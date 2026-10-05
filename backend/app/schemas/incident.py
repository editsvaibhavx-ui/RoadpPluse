from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class IncidentResponse(BaseModel):
    id: int
    incident_code: str
    hazard_type: str
    latitude: float
    longitude: float
    location_label: Optional[str] = None
    confidence: float
    severity: str
    severity_reasons_json: Optional[str] = None
    bus_id: str
    route_id: Optional[int] = None
    detected_at: Optional[datetime] = None
    status: str
    assigned_to: Optional[str] = None
    assigned_team: Optional[str] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    estimated_width_m: float
    estimated_length_m: float
    estimated_area_m2: float
    detection_count: int
    deduplication_note: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class IncidentVerifyRequest(BaseModel):
    verified_by: Optional[str] = "Municipal Authority"
    notes: Optional[str] = "Verified from video frame detection"

class IncidentAssignRequest(BaseModel):
    assigned_to: str
    assigned_team: str = "Pune Road Maintenance Division"
    priority: Optional[str] = "High"
    notes: Optional[str] = None

class IncidentResolveRequest(BaseModel):
    resolution_notes: str
    resolved_by: Optional[str] = "Municipal Authority"

class IncidentUpdateRequest(BaseModel):
    status: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None
