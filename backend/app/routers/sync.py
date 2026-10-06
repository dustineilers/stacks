from __future__ import annotations

import hashlib
import os
import sqlite3
import tempfile

from fastapi import APIRouter, HTTPException, Request, Response

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
DB_PATH = os.path.join(DATA_DIR, "shared.sqlite")

# Tables that only ever hold things a person created. `meal_plan` is excluded
# on purpose: the client seeds its single row automatically on read, so it is
# present even in a brand-new, empty database.
USER_DATA_TABLES = (
    "cookbooks", "recipes", "grocery_items", "pantry_items",
    "menus", "calendar_events", "meal_plan_entries",
)


def _etag_for(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def _user_row_count(data: bytes) -> int | None:
    """Total user-created rows in a SQLite database given as bytes, or None if
    it can't be read as one."""
    tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
    try:
        tmp.write(data)
        tmp.close()
        conn = sqlite3.connect(tmp.name)
        try:
            total = 0
            for table in USER_DATA_TABLES:
                try:
                    total += conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                except sqlite3.Error:
                    pass  # table absent in an older schema — not an error
            return total
        finally:
            conn.close()
    except sqlite3.Error:
        return None
    finally:
        os.unlink(tmp.name)


@router.get("/api/sync/db")
async def get_shared_db():
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="No shared database has been pushed yet.")

    with open(DB_PATH, "rb") as f:
        data = f.read()

    return Response(content=data, media_type="application/octet-stream", headers={"ETag": _etag_for(data)})


@router.put("/api/sync/db")
async def put_shared_db(request: Request):
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Request body is empty.")

    if_match = request.headers.get("if-match")

    current: bytes | None = None
    current_etag: str | None = None
    if os.path.exists(DB_PATH):
        with open(DB_PATH, "rb") as f:
            current = f.read()
        current_etag = _etag_for(current)

    if if_match and current_etag and if_match != current_etag:
        raise HTTPException(
            status_code=409,
            detail="The shared database has changed since you last synced.",
            headers={"ETag": current_etag},
        )

    # Last line of defence: never let an empty database replace one that holds
    # real content. A client that uploads before it has reconciled — e.g. one
    # running stale code, or one that just started up with nothing yet — would
    # otherwise silently destroy everyone's data, and no amount of client-side
    # correctness protects against a client that predates the fix. Deliberate
    # wipes remain possible via the opt-in header.
    if current is not None and request.headers.get("x-allow-empty-overwrite") != "true":
        incoming_rows = _user_row_count(body)
        existing_rows = _user_row_count(current)
        if incoming_rows == 0 and (existing_rows or 0) > 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Refusing to replace the shared database ({existing_rows} records) with an "
                    "empty one. If this is intentional, resend with X-Allow-Empty-Overwrite: true."
                ),
                headers={"ETag": current_etag or ""},
            )

    os.makedirs(DATA_DIR, exist_ok=True)
    tmp_path = f"{DB_PATH}.tmp"
    with open(tmp_path, "wb") as f:
        f.write(body)
    os.replace(tmp_path, DB_PATH)

    return Response(status_code=200, headers={"ETag": _etag_for(body)})
