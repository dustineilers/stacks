from __future__ import annotations

import re
from typing import Any


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = re.sub(r"\s+", " ", value).strip()
        return value or None
    return str(value).strip() or None


def first_text(value: Any) -> str | None:
    if isinstance(value, str):
        return clean_text(value)
    if isinstance(value, dict):
        return clean_text(value.get("name") or value.get("value"))
    if isinstance(value, list):
        for item in value:
            result = first_text(item)
            if result:
                return result
    return None
