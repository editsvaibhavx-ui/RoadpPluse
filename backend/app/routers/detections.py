from typing import List, Optional, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.session import Detection

router = APIRouter(prefix="/api/detections", tags=["Raw AI Detections"])

@router.get("")
def get_detections(
    incident_id: Optional[int] = Query(None),
    hazard_type: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    limit: int = Query(100),
    db: Session = Depends(get_db)
):
    query = db.query(Detection)
    if session_id:
        query = query.filter(Detection.session_id == session_id)
    if incident_id is not None:
        query = query.filter(Detection.incident_id == incident_id)
    if hazard_type:
        query = query.filter(Detection.class_.ilike(f"%{hazard_type}%"))
    
    dets = query.order_by(Detection.id.desc()).limit(limit).all()
    return [d.to_dict() for d in dets]
