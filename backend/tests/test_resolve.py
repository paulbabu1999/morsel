"""Entity resolution links name variants to canonical foods and scales nutrition."""

import pytest

from app.nutrition import resolve

pytestmark = pytest.mark.usefixtures("db_ready")


def test_alias_and_modifier_stripping():
    item = resolve.resolve_item("leftover chicken and rice", quantity=1)
    assert item["canonical_name"] == "Chicken Rice Bowl"
    assert item["resolution_method"] in ("alias", "similar")
    assert item["calories"] > 0 and item["protein_g"] > 0


def test_portion_scales_nutrition():
    one = resolve.resolve_item("chicken burrito", quantity=1)
    half = resolve.resolve_item("chicken burrito", quantity=0.5)
    assert half["calories"] == pytest.approx(one["calories"] / 2, rel=0.05)


def test_micros_present():
    item = resolve.resolve_item("dark chocolate", quantity=1)
    assert item["iron_mg"] > 0 and item["fiber_g"] > 0
