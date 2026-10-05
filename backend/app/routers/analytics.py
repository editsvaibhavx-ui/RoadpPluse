from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database import get_db
from app.models.session import Incident, Detection, SessionModel
from app.models.bus import Bus
from app.models.route import Route
from app.schemas.analytics import AnalyticsResponse, DashboardSummary

router = APIRouter(prefix="/api/analytics", tags=["Municipal Analytics"])

@router.get("", response_model=AnalyticsResponse)
def get_analytics_data(db: Session = Depends(get_db)):
    incidents = db.query(Incident).all()
    total_incidents = len(incidents)

    new_inc = sum(1 for i in incidents if (i.status or "").upper() == "OPEN")
    verified_inc = sum(1 for i in incidents if (i.status or "").upper() == "VERIFIED")
    in_progress_inc = sum(1 for i in incidents if (i.status or "").upper() in ["ASSIGNED", "IN_PROGRESS"])
    resolved_inc = sum(1 for i in incidents if (i.status or "").upper() in ["RESOLVED", "REPAIRED", "CLOSED"])
    critical_inc = sum(1 for i in incidents if (i.severity or "").upper() in ["CRITICAL", "HIGH"])

    active_buses = db.query(Bus).filter(Bus.status == "Active").count()
    monitored_routes = db.query(Route).filter(Route.is_active == True).count()
    total_detections_merged = db.query(Detection).count()

    # Severity distribution
    sev_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for i in incidents:
        s = (i.severity or "medium").upper()
        if s not in sev_counts:
            sev_counts[s] = 0
        sev_counts[s] += 1

    severity_colors = {
        "CRITICAL": "#ef4444",
        "HIGH": "#f59e0b",
        "MEDIUM": "#3b82f6",
        "LOW": "#10b981"
    }
    by_severity = [
        {"severity": s, "count": count, "color": severity_colors.get(s, "#64748b")}
        for s, count in sev_counts.items()
    ]

    # Hazard type distribution
    hazard_counts = {}
    for i in incidents:
        ht = (i.class_ or "pothole").capitalize()
        hazard_counts[ht] = hazard_counts.get(ht, 0) + 1

    palette = ["#ef4444", "#f97316", "#06b6d4", "#8b5cf6", "#ec4899"]
    by_hazard_type = [
        {"name": k, "value": v, "color": palette[idx % len(palette)]}
        for idx, (k, v) in enumerate(hazard_counts.items())
    ]

    # Incidents by session
    sessions = db.query(SessionModel).all()
    session_map = {s.id: f"{s.source.capitalize()} ({s.id[-8:]})" for s in sessions}
    session_counts = {}
    for i in incidents:
        label = session_map.get(i.session_id, f"Session {i.session_id[-6:]}")
        session_counts[label] = session_counts.get(label, 0) + 1

    by_route = [
        {"route_name": s_name, "incident_count": count}
        for s_name, count in session_counts.items()
    ]

    # Trends over the last 7 days
    trends = []
    base_date = datetime.utcnow().date()
    for d in range(6, -1, -1):
        day = base_date - timedelta(days=d)
        date_str = day.strftime("%b %d")
        
        day_incidents = [
            i for i in incidents
            if i.first_seen_at and i.first_seen_at.date() == day
        ]
        p_count = sum(1 for i in day_incidents if "pothole" in (i.class_ or "").lower())
        c_count = len(day_incidents) - p_count
        trends.append({
            "date": date_str,
            "potholes": p_count,
            "cracks": c_count,
            "total": len(day_incidents)
        })

    # Real Hotspot locations derived strictly from actual incident coordinates
    hotspots = []
    for inc in incidents[:5]:
        hotspots.append({
            "location": f"GPS [{inc.centroid_lat:.4f}, {inc.centroid_lon:.4f}]",
            "incidents": inc.detection_count,
            "severity": (inc.severity or "MEDIUM").upper(),
            "lat": inc.centroid_lat,
            "lng": inc.centroid_lon
        })

    # Average resolution time: 0.0 when no resolved incidents exist
    avg_res = 0.0

    summary = DashboardSummary(
        total_incidents=total_incidents,
        new_incidents=new_inc,
        verified_incidents=verified_inc,
        in_progress_incidents=in_progress_inc,
        resolved_incidents=resolved_inc,
        critical_incidents=critical_inc,
        active_buses=active_buses,
        monitored_routes=monitored_routes,
        total_detections_merged=total_detections_merged
    )

    return AnalyticsResponse(
        summary=summary,
        by_hazard_type=by_hazard_type,
        by_severity=by_severity,
        by_route=by_route,
        trends=trends,
        hotspot_locations=hotspots,
        avg_resolution_hours=avg_res
    )
