"""Admin gate: ADMIN_EMAILS allowlist (fail-closed) + require_admin dependency."""

import uuid

import pytest
from fastapi import HTTPException

from app import auth, config, db, repo


def _mk_user(email: str) -> str:
    uid = "test-adm-" + uuid.uuid4().hex[:10]
    repo.create_user(uid, email, "x")
    return uid


def _rm_user(uid: str) -> None:
    with db.app_pool().connection() as conn:
        conn.execute("DELETE FROM users WHERE id = %s", (uid,))
        conn.commit()


def test_is_admin_allowlist(db_ready, monkeypatch):
    email = f"owner-{uuid.uuid4().hex[:6]}@bite.test"
    uid = _mk_user(email)
    try:
        # fail-closed: an empty allowlist means nobody is admin
        monkeypatch.setattr(config, "ADMIN_EMAILS", frozenset())
        assert auth.is_admin(uid) is False

        # listed email (case-insensitive) => admin
        monkeypatch.setattr(config, "ADMIN_EMAILS", frozenset({email.upper().lower()}))
        assert auth.is_admin(uid) is True

        # someone else's allowlist => not admin
        monkeypatch.setattr(config, "ADMIN_EMAILS", frozenset({"other@bite.test"}))
        assert auth.is_admin(uid) is False
    finally:
        _rm_user(uid)


def test_is_admin_unknown_user(db_ready, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_EMAILS", frozenset({"someone@bite.test"}))
    assert auth.is_admin("no-such-user") is False


def test_require_admin_403_and_pass(monkeypatch):
    monkeypatch.setattr(auth, "is_admin", lambda uid: False)
    with pytest.raises(HTTPException) as exc:
        auth.require_admin("u-123")
    assert exc.value.status_code == 403

    monkeypatch.setattr(auth, "is_admin", lambda uid: True)
    assert auth.require_admin("u-123") == "u-123"
