"""App-side text-to-SQL safety: AST validation + table allowlist + forced LIMIT.

This layers on top of the DB-enforced defenses (the morsel_ro read-only role +
read-only transaction + RLS). Because it parses to a real AST via sqlglot, it is
robust to comment/stacked-statement injection that string matching misses.
"""

from __future__ import annotations

import sqlglot
from sqlglot import exp

from . import config

ALLOWED_TABLES = {"meals", "meal_items", "food_entities", "user_profile"}

_FORBIDDEN = (
    exp.Insert, exp.Update, exp.Delete, exp.Merge,
    exp.Create, exp.Drop, exp.Alter, exp.Command, exp.Set,
    exp.Grant if hasattr(exp, "Grant") else exp.Command,
)


class SqlGuardError(ValueError):
    """Raised when generated SQL fails validation (never executed)."""


def validate_and_limit(sql: str, limit: int = config.SQL_ROW_LIMIT) -> str:
    sql = (sql or "").strip().rstrip(";")
    if not sql:
        raise SqlGuardError("empty SQL")

    try:
        statements = sqlglot.parse(sql, read="postgres")
    except Exception as exc:  # unparseable -> reject
        raise SqlGuardError(f"unparseable SQL: {exc}") from exc

    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        raise SqlGuardError(f"exactly one statement required (got {len(statements)})")
    stmt = statements[0]

    # top node must be a read query
    if not isinstance(stmt, (exp.Select, exp.Union, exp.With, exp.Subquery)):
        raise SqlGuardError(f"only SELECT/UNION/CTE allowed (got {type(stmt).__name__})")

    # no write/DDL/command node anywhere in the tree
    for bad in _FORBIDDEN:
        if stmt.find(bad) is not None:
            raise SqlGuardError(f"forbidden statement type: {bad.__name__}")

    # table allowlist (blocks pg_catalog, information_schema, etc.)
    for table in stmt.find_all(exp.Table):
        if table.name and table.name.lower() not in ALLOWED_TABLES:
            raise SqlGuardError(f"table not allowed: {table.name}")

    return _enforce_limit(stmt, limit)


def _enforce_limit(stmt: exp.Expression, limit: int) -> str:
    existing = stmt.args.get("limit") if isinstance(stmt, exp.Select) else None
    if isinstance(existing, exp.Limit):
        try:
            if int(existing.expression.name) <= limit:
                return stmt.sql(dialect="postgres")
        except Exception:
            pass
    # wrap so UNION/CTE/limitless queries all get a hard cap
    inner = stmt.sql(dialect="postgres")
    return f"SELECT * FROM ({inner}) _guard LIMIT {int(limit)}"
