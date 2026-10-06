from __future__ import annotations

import httpx

DEFAULT_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
