"""
Database Seed Script: UrbanSense AI
===================================
Seeds the SQLite database with rich realistic demo data for Pune, India:
- Users: admin/admin123, authority/authority123
- Routes: Pune Route 01 (Swargate - Baner), Pune Route 02 (Kothrud - Pune Station)
- Buses: BUS-001 (Pune Route 01), BUS-002, BUS-003
- Incidents: Pre-seeded incidents across key Pune junctions with deduplication notes
- Notifications: Critical hazard alerts
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime, timedelta

# Ensure backend directory is in python path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.database import engine, Base, SessionLocal
from app.models import User, Bus, Route, Detection, Incident, Assignment, Notification
from app.utils.security import get_password_hash
from app.config import PUNE_ROUTE_01_WAYPOINTS
from app.utils.demo_generator import generate_demo_video_if_missing

def seed_database():
    print("Initializing SQLite Database Tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # 1. Clear existing demo data to ensure a fresh clean state
        db.query(Notification).delete()
        db.query(Assignment).delete()
        db.query(Detection).delete()
        db.query(Incident).delete()
        db.query(Bus).delete()
        db.query(Route).delete()
        db.query(User).delete()
        db.commit()

        print("Seeding Users...")
        admin = User(
            username="admin",
            password_hash=get_password_hash("admin123"),
            full_name="Municipal Chief Administrator",
            email="admin@pmc.gov.in",
            role="admin"
        )
        authority = User(
            username="authority",
            password_hash=get_password_hash("authority123"),
            full_name="Pune Road Maintenance Authority",
            email="authority@pmc.gov.in",
            role="authority"
        )
        db.add_all([admin, authority])
        db.commit()

        print("Seeding Routes...")
        route1 = Route(
            route_code="PUNE-RT-01",
            route_name="Pune Route 01: Swargate to Baner Phata",
            start_point="Swargate Terminal",
            end_point="Baner Phata",
            waypoints_json=json.dumps(PUNE_ROUTE_01_WAYPOINTS),
            is_active=True
        )
        route2 = Route(
            route_code="PUNE-RT-02",
            route_name="Pune Route 02: Kothrud Stand to Pune Station",
            start_point="Kothrud Stand",
            end_point="Pune Railway Station",
            waypoints_json=json.dumps([
                {"name": "Kothrud Stand", "lat": 18.5074, "lng": 73.8077},
                {"name": "Deccan Gymkhana", "lat": 18.5173, "lng": 73.8415},
                {"name": "Pune Station", "lat": 18.5284, "lng": 73.8744}
            ]),
            is_active=True
        )
        db.add_all([route1, route2])
        db.commit()
        db.refresh(route1)
        db.refresh(route2)

        print("Seeding Fleet Buses...")
        bus1 = Bus(
            bus_number="BUS-001",
            route_id=route1.id,
            status="Active",
            camera_source="Smartphone Simulation",
            device_info="Simulated Smartphone Dash-Mount (1080p@30fps)"
        )
        bus2 = Bus(
            bus_number="BUS-002",
            route_id=route1.id,
            status="Active",
            camera_source="Smartphone Simulation",
            device_info="Simulated Smartphone Dash-Mount"
        )
        bus3 = Bus(
            bus_number="BUS-003",
            route_id=route2.id,
            status="In Transit",
            camera_source="Smartphone Simulation",
            device_info="Simulated Smartphone Dash-Mount"
        )
        db.add_all([bus1, bus2, bus3])
        db.commit()

        print("Seeding Pre-existing Pune Incidents & Detections...")
        sample_incidents_data = [
            {
                "code": "INC-001",
                "hazard": "pothole",
                "lat": 18.5246,
                "lng": 73.8407,
                "label": "FC Road (Opposite Goodluck Cafe)",
                "conf": 0.942,
                "sev": "CRITICAL",
                "reasons": [
                    "Very high AI confidence (94.2%)",
                    "Critical damage area: 1.82 m² (exceeds 1.5 m² threshold)",
                    "Persistent hazard confirmed by 4 video frames (multi-angle validation)",
                    "Hazard classification: Pothole (direct impact on two-wheeler and bus safety)"
                ],
                "w": 1.4, "l": 1.3, "area": 1.82,
                "count": 4,
                "note": "4 detections merged into Incident INC-001 (ST-DBSCAN clustering within 18m / 45s)",
                "status": "ASSIGNED",
                "team": "Shivajinagar Road Repair Squad",
                "assigned_to": "Rajesh Deshmukh (Lead Engineer)"
            },
            {
                "code": "INC-002",
                "hazard": "pothole",
                "lat": 18.5314,
                "lng": 73.8532,
                "label": "Shivajinagar Bus Station Entry Ramp",
                "conf": 0.915,
                "sev": "HIGH",
                "reasons": [
                    "Very high AI confidence (91.5%)",
                    "Large estimated area: 0.95 m² (potential chassis/suspension damage)",
                    "Detected by multiple observations (3 frames)",
                    "Hazard classification: Pothole"
                ],
                "w": 1.1, "l": 0.86, "area": 0.95,
                "count": 3,
                "note": "3 detections merged into Incident INC-002 (ST-DBSCAN clustering within 18m / 45s)",
                "status": "VERIFIED",
                "team": "Central Zone Road Maintenance",
                "assigned_to": None
            },
            {
                "code": "INC-003",
                "hazard": "road crack",
                "lat": 18.5412,
                "lng": 73.8298,
                "label": "Pune University Circle Underpass",
                "conf": 0.870,
                "sev": "MEDIUM",
                "reasons": [
                    "High AI confidence (87.0%)",
                    "Moderate surface defect area: 0.48 m²",
                    "Detected by multiple observations (2 frames)"
                ],
                "w": 0.8, "l": 0.6, "area": 0.48,
                "count": 2,
                "note": "2 detections merged into Incident INC-003 (ST-DBSCAN clustering within 18m / 45s)",
                "status": "NEW",
                "team": None,
                "assigned_to": None
            },
            {
                "code": "INC-004",
                "hazard": "damaged road",
                "lat": 18.5018,
                "lng": 73.8584,
                "label": "Swargate Flyover Approach",
                "conf": 0.890,
                "sev": "HIGH",
                "reasons": [
                    "High AI confidence (89.0%)",
                    "Large estimated area: 1.15 m²",
                    "Detected by multiple observations (3 frames)",
                    "Hazard classification: Extensive road wear"
                ],
                "w": 1.2, "l": 0.96, "area": 1.15,
                "count": 3,
                "note": "3 detections merged into Incident INC-004 (ST-DBSCAN clustering within 18m / 45s)",
                "status": "RESOLVED",
                "team": "Swargate Maintenance Division",
                "assigned_to": "Anil Patil"
            },
            {
                "code": "INC-005",
                "hazard": "pothole",
                "lat": 18.5582,
                "lng": 73.8075,
                "label": "Aundh Chowk - Bremen Chowk Link",
                "conf": 0.835,
                "sev": "LOW",
                "reasons": [
                    "High AI confidence (83.5%)",
                    "Minor localized surface defect (0.24 m²)",
                    "Single observation detection",
                    "Hazard classification: Pothole"
                ],
                "w": 0.5, "l": 0.48, "area": 0.24,
                "count": 1,
                "note": "Single observation recorded for Incident INC-005",
                "status": "NEW",
                "team": None,
                "assigned_to": None
            }
        ]

        for inc_info in sample_incidents_data:
            inc = Incident(
                incident_code=inc_info["code"],
                hazard_type=inc_info["hazard"],
                latitude=inc_info["lat"],
                longitude=inc_info["lng"],
                location_label=inc_info["label"],
                confidence=inc_info["conf"],
                severity=inc_info["sev"],
                severity_reasons_json=json.dumps(inc_info["reasons"]),
                bus_id="BUS-001",
                route_id=route1.id,
                detected_at=datetime.utcnow() - timedelta(hours=random_hour(inc_info["code"])),
                status=inc_info["status"],
                assigned_to=inc_info["assigned_to"],
                assigned_team=inc_info["team"],
                image_url=f"/static/processed/seed_{inc_info['code']}.jpg",
                description=f"Automated bus dashcam detection of {inc_info['hazard']} at {inc_info['label']}.",
                estimated_width_m=inc_info["w"],
                estimated_length_m=inc_info["l"],
                estimated_area_m2=inc_info["area"],
                detection_count=inc_info["count"],
                deduplication_note=inc_info["note"],
                verified_by="Municipal Authority" if inc_info["status"] != "NEW" else None,
                verified_at=datetime.utcnow() - timedelta(hours=3) if inc_info["status"] != "NEW" else None,
                resolution_notes="Patchwork bitumen repair completed and inspected by PMC team." if inc_info["status"] == "RESOLVED" else None,
                resolved_at=datetime.utcnow() - timedelta(hours=1) if inc_info["status"] == "RESOLVED" else None
            )
            db.add(inc)
            db.commit()
            db.refresh(inc)

            # Notifications for High/Critical
            if inc.severity in ["CRITICAL", "HIGH"]:
                notif = Notification(
                    title=f"🚨 {inc.severity} ROAD HAZARD: {inc.incident_code}",
                    message=f"{inc.hazard_type.capitalize()} on Pune Route 01 ({inc.location_label}). Estimated Area: {inc.estimated_area_m2} m². Immediate action advised.",
                    severity=inc.severity,
                    incident_id=inc.id,
                    is_read=False
                )
                db.add(notif)
                db.commit()

        # Generate sample demo video
        generate_demo_video_if_missing()

        print("Database seeded successfully with Pune road intelligence test data!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

def random_hour(code: str) -> int:
    offsets = {"INC-001": 2, "INC-002": 5, "INC-003": 8, "INC-004": 26, "INC-005": 14}
    return offsets.get(code, 4)

if __name__ == "__main__":
    seed_database()
