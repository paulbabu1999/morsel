"""Database access via psycopg3 connection pools.

Two pools mirror the two roles:
  * `app_pool`  — read/write, for ingestion and normal reads.
  * `ro_pool`   — SELECT-only, used ONLY to execute LLM-generated SQL.

Row-Level Security is enforced by setting the `app.current_user_id` GUC per
transaction (LOCAL), so every statement — including a generated SQL query that
"forgets" its WHERE clause — only sees the current user's rows.
"""

from __future__ import annotations

from contextlib import contextmanager
from decimal import Decimal
from typing import Any, Iterator

import psycopg
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import config

_app_pool: ConnectionPool | None = None
_ro_pool: ConnectionPool | None = None


def _configure(conn: psycopg.Connection) -> None:
    register_vector(conn)


# prepare_threshold=None disables auto server-side prepared statements, which
# are incompatible with connection poolers (Neon/PgBouncer in transaction mode).
_PG_KWARGS = {"prepare_threshold": None}


def app_pool() -> ConnectionPool:
    global _app_pool
    if _app_pool is None:
        _app_pool = ConnectionPool(
            config.APP_DSN, min_size=1, max_size=5, kwargs=_PG_KWARGS,
            configure=_configure, open=True,
        )
    return _app_pool


def ro_pool() -> ConnectionPool:
    global _ro_pool
    if _ro_pool is None:
        _ro_pool = ConnectionPool(
            config.RO_DSN, min_size=1, max_size=3, kwargs=_PG_KWARGS,
            configure=_configure, open=True,
        )
    return _ro_pool


def close_pools() -> None:
    global _app_pool, _ro_pool
    for p in (_app_pool, _ro_pool):
        if p is not None:
            p.close()
    _app_pool = _ro_pool = None


@contextmanager
def app_tx(user_id: str = config.DEFAULT_USER_ID) -> Iterator[psycopg.Cursor]:
    """Read/write transaction with RLS scoped to `user_id`. Commits on success."""
    with app_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT set_config('app.current_user_id', %s, true)", (user_id,)
            )
            yield cur
        # context manager commits on clean exit, rolls back on exception


def run_readonly_sql(
    sql: str, user_id: str = config.DEFAULT_USER_ID, params: tuple | None = None
) -> list[dict[str, Any]]:
    """Execute an already-validated SELECT on the read-only role with RLS set.

    This is the ONLY path that runs LLM-generated SQL. The morsel_ro role lacks
    write privileges (DB-enforced), runs read-only transactions, and is scoped
    to the user via the GUC.
    """
    with ro_pool().connection() as conn:
        with conn.transaction():
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    "SELECT set_config('app.current_user_id', %s, true)", (user_id,)
                )
                cur.execute(sql, params or ())
                # psycopg returns numeric as Decimal -> serializes as a JSON
                # string; convert so aggregate facts are real numbers.
                return [_floatify(row) for row in cur.fetchall()]


def _floatify(row: dict[str, Any]) -> dict[str, Any]:
    return {k: (float(v) if isinstance(v, Decimal) else v) for k, v in row.items()}


def healthcheck(user_id: str = config.DEFAULT_USER_ID) -> dict[str, Any]:
    try:
        # meals are behind FORCE RLS, so count within the user scope (GUC set);
        # food_entities is global.
        with app_tx(user_id) as cur:
            cur.execute("SELECT count(*) AS n FROM meals")
            meals = cur.fetchone()["n"]
            cur.execute("SELECT count(*) AS n FROM food_entities")
            foods = cur.fetchone()["n"]
        return {"connected": True, "meals": meals, "food_entities": foods}
    except Exception as exc:  # pragma: no cover - surfaced in /health
        return {"connected": False, "error": str(exc)}
