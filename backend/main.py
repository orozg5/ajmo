import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

from app.config import settings
from app.routes.ai import router as ai_router
from app.routes.collab import router as collab_router
from app.routes.places import router as places_router
from app.routes.plan_days import router as plan_days_router
from app.routes.plan_destinations import router as plan_destinations_router
from app.routes.plan_hotels import router as plan_hotels_router
from app.routes.plan_items import router as plan_items_router
from app.routes.plans import router as plans_router
from app.routes.social import (
    friends_router,
    invite_router,
    plan_activity_router,
    plan_comments_router,
    plan_invites_router,
    plan_members_router,
    plan_ratings_router,
    plan_reactions_router,
)
from app.routes.storage import router as storage_router
from app.routes.transit import router as transit_router
from app.routes.users import router as users_router
from app.services.places.cleanup import start_cache_cleanup
from app.services.places.geocoding import close_geocoder_client
from app.services.transit.directions import close_transit_client
from app.services.transport.osrm import close_osrm_client


@asynccontextmanager
async def lifespan(application: FastAPI):
    await start_cache_cleanup()
    yield
    await close_geocoder_client()
    await close_transit_client()
    await close_osrm_client()


app = FastAPI(
    title="Travel planning app API",
    version="0.1.0",
    description="Backend for the collaborative travel planning app",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(ai_router)
app.include_router(places_router)
app.include_router(plans_router)
app.include_router(plan_days_router)
app.include_router(plan_destinations_router)
app.include_router(plan_hotels_router)
app.include_router(plan_items_router)
app.include_router(storage_router)
app.include_router(transit_router)
app.include_router(users_router)
app.include_router(friends_router)
app.include_router(plan_members_router)
app.include_router(plan_invites_router)
app.include_router(plan_comments_router)
app.include_router(plan_reactions_router)
app.include_router(plan_ratings_router)
app.include_router(plan_activity_router)
app.include_router(invite_router)
app.include_router(collab_router)


@app.get("/health", tags=["meta"])
async def health_check() -> dict:
    """Simple liveness probe."""
    return {"status": "ok"}
