"""Edit + delete a saved meal (repo.update_meal / repo.delete_meal).

Runs in stub mode (LLM_PROVIDER=off) against the local dev DB via the default
user, so it exercises the real RLS-scoped SQL path deterministically.
"""

from app import capture_service, config, repo

UID = config.DEFAULT_USER_ID


def _make(items, **kw):
    return capture_service.build_meal({"items": items, "source": "phone", **kw})


def test_update_meal_replaces_fields_and_items_keeping_id(db_ready):
    saved = repo.persist_meal(
        _make([{"raw_name": "banana", "quantity": 1, "unit": "medium"}],
              meal_type="snack", note="first"),
        UID,
    )
    mid = saved["id"]

    edited = _make(
        [
            {"raw_name": "apple", "quantity": 2, "unit": "medium"},
            {"raw_name": "toast", "quantity": 1, "unit": "slice"},
        ],
        meal_type="breakfast", note="edited", location="Home",
    )
    updated = repo.update_meal(mid, edited, UID)
    try:
        assert updated is not None
        assert updated["id"] == mid  # same row, edited in place
        assert updated["meal_type"] == "breakfast"
        assert updated["note_text"] == "edited"
        assert updated["location_text"] == "Home"
        assert len(updated["items"]) == 2  # items fully replaced (was 1)

        # A fresh read reflects the same edit (not just the returned dict).
        again = repo.get_meal(mid, UID)
        assert again is not None
        assert {i["canonical_name"] for i in again["items"]} == {
            i["canonical_name"] for i in updated["items"]
        }
    finally:
        repo.delete_meal(mid, UID)


def test_delete_meal_removes_it(db_ready):
    saved = repo.persist_meal(
        _make([{"raw_name": "banana", "quantity": 1, "unit": "medium"}], meal_type="snack"),
        UID,
    )
    mid = saved["id"]
    assert repo.delete_meal(mid, UID) is True
    assert repo.get_meal(mid, UID) is None


def test_update_and_delete_missing_meal_are_safe(db_ready):
    ghost = _make([{"raw_name": "banana", "quantity": 1, "unit": "medium"}], meal_type="snack")
    assert repo.update_meal("meal-does-not-exist", ghost, UID) is None
    assert repo.delete_meal("meal-does-not-exist", UID) is False
