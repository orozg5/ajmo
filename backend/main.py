import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

from app.routes.ai import router as ai_router
from app.routes.places import router as places_router
from app.routes.plans import router as plans_router

app = FastAPI(
    title="Travel planning app API",
    version="0.1.0",
    description="Backend for the collaborative travel planning app",
)

# TODO: drive allow_origins from a CORS_ORIGINS env var before any production deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(ai_router)
app.include_router(places_router)
app.include_router(plans_router)


@app.get("/health", tags=["meta"])
async def health_check() -> dict:
    """Simple liveness probe."""
    return {"status": "ok"}
