from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class DashboardSummary(BaseModel):
    total_incidents: int
    new_incidents: int
    verified_incidents: int
    in_progress_incidents: int
    resolved_incidents: int
    critical_incidents: int
    active_buses: int
    monitored_routes: int
    total_detections_merged: int

class HazardDistributionItem(BaseModel):
    name: str
    value: int
    color: Optional[str] = None

class SeverityDistributionItem(BaseModel):
    severity: str
    count: int
    color: Optional[str] = None

class RouteIncidentItem(BaseModel):
    route_name: str
    incident_count: int

class TrendItem(BaseModel):
    date: str
    potholes: int
    cracks: int
    total: int

class AnalyticsResponse(BaseModel):
    summary: DashboardSummary
    by_hazard_type: List[HazardDistributionItem]
    by_severity: List[SeverityDistributionItem]
    by_route: List[RouteIncidentItem]
    trends: List[TrendItem]
    hotspot_locations: List[Dict[str, Any]]
    avg_resolution_hours: float
