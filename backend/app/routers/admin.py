from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserResponse, UserCreate
from app.utils.security import get_password_hash, require_admin
from app.config import (
    DEFAULT_PIXELS_TO_METERS_WIDTH,
    DEFAULT_PIXELS_TO_METERS_LENGTH,
    DEDUP_SPATIAL_THRESHOLD_METERS,
    DEDUP_TEMPORAL_THRESHOLD_SECONDS,
)

router = APIRouter(prefix="/api/admin", tags=["Admin Portal"])

# In-memory settings state for prototype configuration
system_settings = {
    "pixels_to_meters_width": DEFAULT_PIXELS_TO_METERS_WIDTH,
    "pixels_to_meters_length": DEFAULT_PIXELS_TO_METERS_LENGTH,
    "st_dbscan_spatial_threshold_m": DEDUP_SPATIAL_THRESHOLD_METERS,
    "st_dbscan_temporal_threshold_s": DEDUP_TEMPORAL_THRESHOLD_SECONDS,
    "auto_verify_high_confidence": False,
    "sms_alert_enabled": False,  # Prototype limitation notice
    "mqtt_broker_status": "REST API Fallback (Prototype Mode)"
}

@router.get("/users", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    new_user = User(
        username=payload.username,
        password_hash=get_password_hash(payload.password),
        full_name=payload.full_name,
        email=payload.email,
        role=payload.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.username == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete default admin user")
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}

@router.get("/settings")
def get_settings():
    return system_settings

@router.post("/settings")
def update_settings(updates: Dict[str, Any]):
    system_settings.update(updates)
    return {"message": "Settings updated successfully", "current_settings": system_settings}

@router.post("/reset-database")
def reset_database_endpoint(db: Session = Depends(get_db)):
    """Wipes all incidents, detections, notifications, and assignments to a clean 0 state."""
    from app.models.incident import Incident
    from app.models.detection import Detection
    from app.models.assignment import Assignment
    from app.models.notification import Notification
    from app.config import PROCESSED_DIR

    db.query(Notification).delete()
    db.query(Assignment).delete()
    db.query(Detection).delete()
    db.query(Incident).delete()
    db.commit()

    for f in PROCESSED_DIR.glob("*.jpg"):
        try:
            f.unlink(missing_ok=True)
        except Exception:
            pass

    return {
        "status": "success",
        "message": "All operational data wiped to 0 clean state",
        "incidents_count": 0,
        "detections_count": 0,
        "notifications_count": 0
    }

