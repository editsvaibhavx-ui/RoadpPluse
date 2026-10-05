"""
Seed-Free Database Reset / Migration Script
===========================================
Recreates all tables for the seed-free architecture:
- sessions
- gps_points
- detections
- incidents
- pipeline_steps
- users (optional auth)
- buses
- routes
- notifications
- assignments

Every table starts with ZERO rows (completely empty). No mock or demo data.
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.database import engine, Base, SessionLocal
from app.models.session import SessionModel, GPSPoint, Detection, Incident, PipelineStep
from app.models.user import User
from app.models.bus import Bus
from app.models.route import Route
from app.models.assignment import Assignment
from app.models.notification import Notification
from app.config import PROCESSED_DIR

def reset_to_clean_slate():
    print("Recreating database schema with ZERO seeded rows...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    # Clean any temporary processed images
    if PROCESSED_DIR.exists():
        for f in PROCESSED_DIR.glob("*.jpg"):
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass

    db = SessionLocal()
    try:
        s_count = db.query(SessionModel).count()
        g_count = db.query(GPSPoint).count()
        d_count = db.query(Detection).count()
        i_count = db.query(Incident).count()
        p_count = db.query(PipelineStep).count()

        print("--------------------------------------------------")
        print("DATABASE INITIALIZED EMPTY (SEED-FREE):")
        print(f"  sessions:       {s_count} rows")
        print(f"  gps_points:     {g_count} rows")
        print(f"  detections:     {d_count} rows")
        print(f"  incidents:      {i_count} rows")
        print(f"  pipeline_steps: {p_count} rows")
        print("--------------------------------------------------")
    finally:
        db.close()

if __name__ == "__main__":
    reset_to_clean_slate()
