import os
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import (
    UPLOADS_DIR,
    PROCESSED_DIR,
    SAMPLE_DIR,
    CORS_ORIGINS,
    PORT,
    HOST,
    PUNE_ROUTE_01_WAYPOINTS,
)
from app.database import engine, Base, SessionLocal
from app.models.user import User
from app.models.route import Route
from app.models.bus import Bus
from app.utils.security import get_password_hash
from app.routers import (
    auth,
    buses,
    routes,
    videos,
    detections,
    incidents,
    analytics,
    notifications,
    admin,
    sessions,
)

def bootstrap_database():
    """Initializes tables and seeds basic system accounts/routes if the database is fresh."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin_user = User(
                username="admin",
                password_hash=get_password_hash("admin123"),
                full_name="Municipal Chief Administrator",
                email="admin@pmc.gov.in",
                role="admin"
            )
            authority_user = User(
                username="authority",
                password_hash=get_password_hash("authority123"),
                full_name="Pune Road Maintenance Authority",
                email="authority@pmc.gov.in",
                role="authority"
            )
            db.add_all([admin_user, authority_user])
            db.commit()

        if db.query(Route).count() == 0:
            default_route = Route(
                route_name="Pune Route 01 (Swargate - Baner Phata)",
                route_code="PUNE-R01",
                start_point="Swargate Terminal",
                end_point="Baner Phata",
                waypoints_json=json.dumps(PUNE_ROUTE_01_WAYPOINTS)
            )
            db.add(default_route)
            db.commit()
            db.refresh(default_route)

            if db.query(Bus).count() == 0:
                buses_init = [
                    Bus(
                        bus_number="MH-12-RN-4821",
                        route_id=default_route.id,
                        status="Active",
                        camera_source="Dashcam-Front-01"
                    ),
                    Bus(
                        bus_number="MH-12-RN-4822",
                        route_id=default_route.id,
                        status="Active",
                        camera_source="Dashcam-Front-02"
                    )
                ]
                db.add_all(buses_init)
                db.commit()
    except Exception as e:
        db.rollback()
        print(f"Database bootstrap notice: {e}")
    finally:
        db.close()

# Auto-migrate and bootstrap on start
bootstrap_database()

app = FastAPI(
    title="RoadPulse AI - Mobile Urban Intelligence Platform",
    description="AI-Powered Mobile Urban Road Intelligence Platform Using Public Transport Fleet",
    version="2.0.0"
)

# Enable CORS for frontend development & production deployments
raw_cors = CORS_ORIGINS or "*"
if raw_cors == "*":
    allowed_origins = ["*"]
else:
    allowed_origins = [o.strip() for o in raw_cors.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static file directories for video previews, frame inspections, and annotated snapshots
app.mount("/static/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/static/processed", StaticFiles(directory=str(PROCESSED_DIR)), name="processed")
app.mount("/static/sample_data", StaticFiles(directory=str(SAMPLE_DIR)), name="sample_data")

# Register all API routers
app.include_router(sessions.router)
app.include_router(auth.router)
app.include_router(buses.router)
app.include_router(routes.router)
app.include_router(videos.router)
app.include_router(detections.router)
app.include_router(incidents.router)
app.include_router(analytics.router)
app.include_router(notifications.router)
app.include_router(admin.router)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "RoadPulse AI",
        "version": "2.0.0",
        "detector": "OpenCV Computer Vision Segmentation"
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "RoadPulse AI Platform",
        "version": "2.0.0",
        "database": "SQLite / PostgreSQL Portable Relational Schema",
        "detector": "Real OpenCV Computer Vision Road Defect Segmentation"
    }

# ----------------------------------------------------
# Unified Frontend + Backend Serving
# ----------------------------------------------------
FRONTEND_DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if FRONTEND_DIST_DIR.exists():
    if (FRONTEND_DIST_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST_DIR / "assets")), name="frontend_assets")
    if (FRONTEND_DIST_DIR / "sample_tracks").exists():
        app.mount("/sample_tracks", StaticFiles(directory=str(FRONTEND_DIST_DIR / "sample_tracks")), name="frontend_sample_tracks")

    @app.get("/")
    async def serve_spa_root():
        index_file = FRONTEND_DIST_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"status": "Frontend build not found"}

    @app.get("/{full_path:path}")
    async def serve_spa_app(full_path: str):
        # Don't intercept API, health, or static requests
        if full_path == "health" or full_path.startswith("api/") or full_path.startswith("static/") or full_path.startswith("docs") or full_path.startswith("openapi"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        file_path = FRONTEND_DIST_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        index_file = FRONTEND_DIST_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Resource not found")

if __name__ == "__main__":
    import uvicorn
    from app.config import PORT, HOST
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=False)

