from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class RouteBase(BaseModel):
    route_code: str
    route_name: str
    start_point: str
    end_point: str
    waypoints_json: Optional[str] = None
    is_active: bool = True

class RouteCreate(RouteBase):
    pass

class RouteResponse(RouteBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class BusBase(BaseModel):
    bus_number: str
    route_id: Optional[int] = None
    status: str = "Active"
    camera_source: str = "Smartphone Simulation"
    device_info: str = "Android / iOS Smartphone Camera"

class BusCreate(BusBase):
    pass

class BusUpdate(BaseModel):
    bus_number: Optional[str] = None
    route_id: Optional[int] = None
    status: Optional[str] = None
    camera_source: Optional[str] = None
    device_info: Optional[str] = None

class BusResponse(BusBase):
    id: int
    last_active: Optional[datetime] = None
    created_at: Optional[datetime] = None
    route: Optional[RouteResponse] = None

    class Config:
        from_attributes = True
