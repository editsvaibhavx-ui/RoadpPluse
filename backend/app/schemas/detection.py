from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class DetectionResponse(BaseModel):
    id: int
    video_id: Optional[str] = None
    frame_number: int
    timestamp_seconds: float
    hazard_type: str
    confidence: float
    bbox_x1: float
    bbox_y1: float
    bbox_x2: float
    bbox_y2: float
    estimated_width_m: float
    estimated_length_m: float
    estimated_area_m2: float
    latitude: float
    longitude: float
    location_source: str
    image_path: Optional[str] = None
    incident_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
