from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import analysis, health, imports, menu, pairing, search, sync

app = FastAPI(
    title="Stacks Recipe Import API",
    version="1.2.0",
    description="Imports recipes from URLs and provides AI-powered cookbook search plus Google recipe discovery.",
)

# Tighten this to your Stacks frontend origin in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    # ETag is not a CORS-safelisted response header, so without this the sync
    # client (served from a different port, i.e. a different origin) silently
    # reads it as null — which made every database version look identical and
    # broke both pull-adoption and If-Match conflict protection.
    expose_headers=["ETag"],
)

app.include_router(health.router)
app.include_router(imports.router)
app.include_router(search.router)
app.include_router(analysis.router)
app.include_router(pairing.router)
app.include_router(menu.router)
app.include_router(sync.router)
