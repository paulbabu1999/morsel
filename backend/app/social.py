"""Social layer: display names, follows, shared meals, a feed, and groups.

Design decisions (from the product/psychology review):
  * Sharing writes a DENORMALIZED snapshot into `shared_meals` — it never exposes
    the RLS-protected `meals` table. These social tables are cross-user by nature,
    so (like `users`/`food_entities`) they carry NO row-level security; visibility
    is enforced in the queries here.
  * The feed intentionally does NOT surface calories — it's supportive accountability
    (food + a note among friends/groups), not a calorie leaderboard.
"""

from __future__ import annotations

import uuid

from . import db

_MAX_NAME = 60


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _code() -> str:
    return uuid.uuid4().hex[:8]


def _name(v: str | None) -> str:
    return (v or "").strip() or "A friend"


# --- profile / discovery ---------------------------------------------------

def set_display_name(user_id: str, name: str) -> str:
    clean = (name or "").strip()[:_MAX_NAME] or None
    with db.app_tx(user_id) as cur:
        cur.execute("UPDATE users SET display_name = %s WHERE id = %s", (clean, user_id))
    return clean or ""


def search_users(user_id: str, q: str, limit: int = 12) -> list[dict]:
    q = (q or "").strip()
    if not q:
        return []
    with db.app_tx(user_id) as cur:
        cur.execute(
            """SELECT id, display_name FROM users
               WHERE display_name ILIKE %s AND id <> %s
               ORDER BY display_name LIMIT %s""",
            (f"%{q}%", user_id, limit),
        )
        rows = cur.fetchall()
        cur.execute("SELECT followee_id FROM follows WHERE follower_id = %s", (user_id,))
        following = {r["followee_id"] for r in cur.fetchall()}
        return [
            {"user_id": r["id"], "display_name": _name(r["display_name"]), "following": r["id"] in following}
            for r in rows
        ]


# --- follows ---------------------------------------------------------------

def follow(user_id: str, target_id: str) -> None:
    if not target_id or user_id == target_id:
        return
    with db.app_tx(user_id) as cur:
        cur.execute(
            "INSERT INTO follows (follower_id, followee_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (user_id, target_id),
        )


def unfollow(user_id: str, target_id: str) -> None:
    with db.app_tx(user_id) as cur:
        cur.execute("DELETE FROM follows WHERE follower_id = %s AND followee_id = %s", (user_id, target_id))


def connections(user_id: str) -> dict:
    with db.app_tx(user_id) as cur:
        cur.execute(
            """SELECT u.id, u.display_name FROM follows f JOIN users u ON u.id = f.followee_id
               WHERE f.follower_id = %s ORDER BY u.display_name""",
            (user_id,),
        )
        following = [{"user_id": r["id"], "display_name": _name(r["display_name"]), "following": True}
                     for r in cur.fetchall()]
        cur.execute(
            """SELECT u.id, u.display_name FROM follows f JOIN users u ON u.id = f.follower_id
               WHERE f.followee_id = %s ORDER BY u.display_name""",
            (user_id,),
        )
        followers = [{"user_id": r["id"], "display_name": _name(r["display_name"])} for r in cur.fetchall()]
    return {"following": following, "followers": followers}


# --- groups ----------------------------------------------------------------

def create_group(user_id: str, name: str) -> dict:
    gid, code = _id("grp"), _code()
    clean = (name or "").strip()[:_MAX_NAME] or "Group"
    with db.app_tx(user_id) as cur:
        cur.execute(
            "INSERT INTO groups (id, name, owner_id, invite_code) VALUES (%s, %s, %s, %s)",
            (gid, clean, user_id, code),
        )
        cur.execute(
            "INSERT INTO group_members (group_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (gid, user_id),
        )
    return {"id": gid, "name": clean, "invite_code": code, "member_count": 1, "owner": True}


def join_group(user_id: str, code: str) -> dict | None:
    with db.app_tx(user_id) as cur:
        cur.execute("SELECT id, name FROM groups WHERE invite_code = %s", ((code or "").strip(),))
        g = cur.fetchone()
        if not g:
            return None
        cur.execute(
            "INSERT INTO group_members (group_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (g["id"], user_id),
        )
    return {"id": g["id"], "name": g["name"]}


def my_groups(user_id: str) -> list[dict]:
    with db.app_tx(user_id) as cur:
        cur.execute(
            """SELECT g.id, g.name, g.owner_id, g.invite_code,
                      (SELECT count(*) FROM group_members m WHERE m.group_id = g.id) AS member_count
               FROM groups g JOIN group_members gm ON gm.group_id = g.id
               WHERE gm.user_id = %s ORDER BY g.created_at DESC""",
            (user_id,),
        )
        return [
            {
                "id": r["id"], "name": r["name"], "member_count": r["member_count"],
                "owner": r["owner_id"] == user_id,
                # only the owner sees the invite code (to hand out)
                "invite_code": r["invite_code"] if r["owner_id"] == user_id else None,
            }
            for r in cur.fetchall()
        ]


# --- sharing + feed --------------------------------------------------------

def share_meal(user_id: str, meal: dict, group_id: str | None = None, note: str | None = None) -> str | None:
    sid = _id("shr")
    with db.app_tx(user_id) as cur:
        if group_id:
            cur.execute("SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s", (group_id, user_id))
            if not cur.fetchone():
                return None
        cur.execute(
            """INSERT INTO shared_meals
               (id, user_id, meal_id, group_id, meal_type, description, note, photo_uri, total_calories, eaten_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (sid, user_id, meal.get("id"), group_id, meal.get("meal_type"), meal.get("description", ""),
             (note or "").strip()[:280] or None, meal.get("photo_uri"), meal.get("total_calories"),
             meal.get("eaten_at")),
        )
    return sid


def unshare(user_id: str, shared_id: str) -> None:
    with db.app_tx(user_id) as cur:
        cur.execute("DELETE FROM shared_meals WHERE id = %s AND user_id = %s", (shared_id, user_id))


def _feed_item(r: dict, me: str) -> dict:
    # NOTE: calories deliberately omitted — the feed is food + note, not a scoreboard.
    return {
        "id": r["id"],
        "user_id": r["user_id"],
        "display_name": _name(r.get("display_name")),
        "is_me": r["user_id"] == me,
        "group_id": r.get("group_id"),
        "group_name": r.get("group_name"),
        "meal_type": r.get("meal_type"),
        "description": r.get("description") or "",
        "note": r.get("note"),
        "photo_uri": r.get("photo_uri"),
        "eaten_at": r.get("eaten_at"),
        "shared_at": r["shared_at"],
    }


_FEED_COLS = ("s.id, s.user_id, s.group_id, s.meal_type, s.description, s.note, s.photo_uri, "
              "s.eaten_at, s.shared_at, u.display_name, g.name AS group_name")


def feed(user_id: str, limit: int = 50) -> list[dict]:
    with db.app_tx(user_id) as cur:
        cur.execute(
            f"""SELECT {_FEED_COLS}
               FROM shared_meals s
               JOIN users u ON u.id = s.user_id
               LEFT JOIN groups g ON g.id = s.group_id
               WHERE (s.group_id IS NULL
                        AND s.user_id IN (SELECT followee_id FROM follows WHERE follower_id = %(uid)s))
                  OR s.group_id IN (SELECT group_id FROM group_members WHERE user_id = %(uid)s)
                  OR s.user_id = %(uid)s
               ORDER BY s.shared_at DESC LIMIT %(lim)s""",
            {"uid": user_id, "lim": limit},
        )
        return [_feed_item(r, user_id) for r in cur.fetchall()]


def group_feed(user_id: str, group_id: str, limit: int = 50) -> list[dict] | None:
    with db.app_tx(user_id) as cur:
        cur.execute("SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s", (group_id, user_id))
        if not cur.fetchone():
            return None
        cur.execute(
            f"""SELECT {_FEED_COLS}
               FROM shared_meals s
               JOIN users u ON u.id = s.user_id
               LEFT JOIN groups g ON g.id = s.group_id
               WHERE s.group_id = %s ORDER BY s.shared_at DESC LIMIT %s""",
            (group_id, limit),
        )
        return [_feed_item(r, user_id) for r in cur.fetchall()]
