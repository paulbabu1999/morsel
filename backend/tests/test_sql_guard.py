"""SQL guard: only single read queries over allowed tables, with a forced LIMIT."""

import pytest

from app import sql_guard as g


def test_valid_select_passes_and_is_limited():
    out = g.validate_and_limit("SELECT sum(total_calories) FROM meals")
    assert "limit" in out.lower()


def test_existing_small_limit_kept():
    out = g.validate_and_limit("SELECT id FROM meals LIMIT 5")
    assert out.lower().count("limit") == 1


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO meals (id) VALUES ('x')",
        "UPDATE meals SET total_calories = 0",
        "DELETE FROM meals",
        "DROP TABLE meals",
        "ALTER TABLE meals ADD COLUMN x int",
        "SELECT 1; DROP TABLE meals",          # stacked statements
        "SELECT * FROM pg_catalog.pg_user",    # table not allowlisted
        "SELECT * FROM information_schema.tables",
        "SELECT * FROM secrets",               # unknown table
        "TRUNCATE meals",
    ],
)
def test_dangerous_sql_rejected(sql):
    with pytest.raises(g.SqlGuardError):
        g.validate_and_limit(sql)


def test_cte_and_join_allowed():
    sql = """
        WITH d AS (SELECT id FROM meals)
        SELECT m.id FROM meals m JOIN meal_items i ON i.meal_id = m.id
    """
    out = g.validate_and_limit(sql)
    assert "limit" in out.lower()
