import json
from datetime import datetime
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.session import Incident, Detection

router = APIRouter(prefix="/api/incidents", tags=["Incident Management"])

class VerifyRequest(BaseModel):
    verified_by: Optional[str] = "Authority Officer"
    notes: Optional[str] = None

class AssignRequest(BaseModel):
    assigned_to: str
    assigned_team: Optional[str] = None
    priority: Optional[str] = "HIGH"

class ResolveRequest(BaseModel):
    resolution_notes: Optional[str] = None
    repaired_by: Optional[str] = None

@router.get("")
def get_incidents(
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    hazard_type: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    limit: Optional[int] = Query(100),
    db: Session = Depends(get_db)
):
    query = db.query(Incident)
    if session_id:
        query = query.filter(Incident.session_id == session_id)
    if severity:
        query = query.filter(Incident.severity.ilike(severity))
    if status:
        query = query.filter(Incident.status.ilike(status))
    if hazard_type:
        query = query.filter(Incident.class_.ilike(f"%{hazard_type}%"))

    incidents = query.order_by(Incident.id.desc()).limit(limit).all()
    return [i.to_dict() for i in incidents]

@router.get("/{incident_id}")
def get_incident_detail(incident_id: int, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    detections = db.query(Detection).filter(Detection.incident_id == incident_id).all()
    inc_dict = inc.to_dict()
    inc_dict["detections"] = [d.to_dict() for d in detections]
    return inc_dict

@router.post("/{incident_id}/verify")
def verify_incident(incident_id: int, payload: VerifyRequest, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    inc.status = "verified"
    db.commit()
    db.refresh(inc)
    return inc.to_dict()

@router.post("/{incident_id}/assign")
def assign_incident(incident_id: int, payload: AssignRequest, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    inc.status = "assigned"
    db.commit()
    db.refresh(inc)
    return inc.to_dict()

@router.post("/{incident_id}/resolve")
def resolve_incident(incident_id: int, payload: ResolveRequest, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    inc.status = "repaired"
    db.commit()
    db.refresh(inc)
    return inc.to_dict()
