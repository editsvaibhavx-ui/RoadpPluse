import os
import shutil
import json
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import UPLOADS_DIR, SAMPLE_DIR
from app.models.detection import Detection
from app.models.incident import Incident
from app.models.notification import Notification
from app.models.bus import Bus
from app.ai.detector import detector
from app.ai.video_processor import video_processor
from app.utils.demo_generator import generate_demo_video_if_missing
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/videos", tags=["Video Processing & Camera Feed"])

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB limit for prototype

@router.get("/status")
def get_system_status():
    """Returns AI model status, whether custom weights or demo mode is active"""
    return detector.get_status()

@router.get("/demo-video")
def get_demo_video_info():
    """Returns info for pre-rendered demo video"""
    video_path = generate_demo_video_if_missing()
    return {
        "filename": video_path.name,
        "path": str(video_path),
        "url": f"/static/sample_data/{video_path.name}",
        "size_kb": round(video_path.stat().st_size / 1024, 1),
        "description": "Simulated Smartphone Camera (Pune Route 01, BUS-001)"
    }

from app.ai.video_validator import validate_and_verify_road_video, ALLOWED_EXTENSIONS as ALLOWED_VIDEO_EXTENSIONS, MAX_SIZE_BYTES as MAX_VIDEO_SIZE_BYTES
import re

@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    bus_id: str = Form("BUS-001"),
    route_id: int = Form(1),
    camera_source: str = Form("Smartphone Camera")
):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{suffix}'. Allowed formats: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}"
        )

    clean_stem = re.sub(r'[^a-zA-Z0-9_-]', '_', Path(file.filename).stem)
    safe_filename = f"{clean_stem}{suffix}"
    dest_path = UPLOADS_DIR / safe_filename

    # Save uploaded video
    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {str(e)}")

    # 1. Validate video integrity and verify authentic road scene
    verification = validate_and_verify_road_video(dest_path)
    if not verification.get("valid"):
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=verification.get("error", "Invalid video file"))

    if not verification.get("is_road"):
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=verification.get("error", "Uploaded video is not an authentic road scene."))

    return {
        "message": "Video uploaded and verified successfully as authentic road footage.",
        "filename": safe_filename,
        "size_bytes": dest_path.stat().st_size,
        "bus_id": bus_id,
        "route_id": route_id,
        "camera_source": camera_source,
        "video_url": f"/static/uploads/{safe_filename}",
        "duration_s": verification.get("duration_s", 0.0),
        "fps": verification.get("fps", 30.0),
        "total_frames": verification.get("total_frames", 0),
        "road_confidence": verification.get("road_confidence", 100.0)
    }

@router.post("/process")
def process_video_endpoint(
    video_filename: str = Form(...),
    bus_id: str = Form("BUS-001"),
    route_id: int = Form(1),
    sample_interval_sec: float = Form(1.0),
    gps_coordinates_json: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    # Check if file is in uploads or sample_data
    vid_path = UPLOADS_DIR / video_filename
    if not vid_path.exists():
        vid_path = SAMPLE_DIR / video_filename
    if not vid_path.exists():
        # Maybe demo video was requested
        vid_path = generate_demo_video_if_missing()

    # Parse optional GPS coordinates (Option B / Option A)
    gps_points = None
    if gps_coordinates_json:
        try:
            gps_points = json.loads(gps_coordinates_json)
        except Exception:
            gps_points = None

    # Run complete Computer Vision + ST-DBSCAN pipeline
    results = video_processor.process_video(
        vid_path,
        sample_interval_sec=sample_interval_sec,
        bus_id=bus_id,
        route_id=route_id,
        gps_points=gps_points
    )

    created_incident_records = []
    
    # Save newly generated incidents to database
    for inc_data in results["incidents"]:
        # Find next sequential incident code
        last_inc = db.query(Incident).order_by(Incident.id.desc()).first()
        next_num = (last_inc.id + 1) if last_inc else 1
        incident_code = f"INC-{next_num:03d}"

        new_inc = Incident(
            incident_code=incident_code,
            hazard_type=inc_data["hazard_type"],
            latitude=inc_data["latitude"],
            longitude=inc_data["longitude"],
            location_label=f"Pune Route 01 ({inc_data['latitude']}, {inc_data['longitude']})",
            confidence=inc_data["confidence"],
            severity=inc_data["severity"],
            severity_reasons_json=json.dumps(inc_data.get("severity_reasons", [])),
            bus_id=bus_id,
            route_id=route_id,
            status="NEW",
            image_url=inc_data.get("image_url", ""),
            description=f"Automated detection of {inc_data['hazard_type']} along Pune transit corridor.",
            estimated_width_m=inc_data.get("estimated_width_m", 0.0),
            estimated_length_m=inc_data.get("estimated_length_m", 0.0),
            estimated_area_m2=inc_data.get("estimated_area_m2", 0.0),
            detection_count=inc_data.get("detection_count", 1),
            deduplication_note=inc_data.get("deduplication_note", "")
        )
        db.add(new_inc)
        db.commit()
        db.refresh(new_inc)

        # Link raw detections
        for det_data in inc_data.get("detections", []):
            det_record = Detection(
                video_id=video_filename,
                frame_number=det_data["frame_number"],
                timestamp_seconds=det_data["timestamp_seconds"],
                hazard_type=det_data["hazard_type"],
                confidence=det_data["confidence"],
                bbox_x1=det_data["bbox"][0],
                bbox_y1=det_data["bbox"][1],
                bbox_x2=det_data["bbox"][2],
                bbox_y2=det_data["bbox"][3],
                estimated_width_m=det_data["estimated_width_m"],
                estimated_length_m=det_data["estimated_length_m"],
                estimated_area_m2=det_data["estimated_area_m2"],
                latitude=det_data["latitude"],
                longitude=det_data["longitude"],
                location_source="Demo GPS Location",
                image_path=det_data["image_path"],
                incident_id=new_inc.id
            )
            db.add(det_record)

        # Trigger notification if HIGH or CRITICAL
        if new_inc.severity in ["CRITICAL", "HIGH"]:
            notif = Notification(
                title=f"🚨 {new_inc.severity} ROAD HAZARD DETECTED",
                message=f"{new_inc.hazard_type.capitalize()} detected by {bus_id} on Pune Route 01. Estimated Area: {new_inc.estimated_area_m2} m². Immediate municipal inspection advised.",
                severity=new_inc.severity,
                incident_id=new_inc.id
            )
            db.add(notif)

        db.commit()
        created_incident_records.append(new_inc.incident_code)

    return {
        "status": "success",
        "video_processed": video_filename,
        "duration_seconds": results.get("duration_seconds", 0),
        "sampled_frames_count": results["sampled_frames_count"],
        "raw_detections_count": results["raw_detections_count"],
        "raw_detections": results.get("raw_detections", []),
        "incidents": results.get("incidents", []),
        "incidents_created": created_incident_records,
        "detector_info": results["detector_status"]
    }

@router.post("/demo/start")
def start_demo_pipeline(db: Session = Depends(get_db)):
    """
    1-Click Master Demo Workflow:
    Loads simulated demo road video -> Extracts frames -> AI Detection -> ST-DBSCAN -> Severity -> DB & Map!
    """
    demo_vid_path = generate_demo_video_if_missing()
    return process_video_endpoint(
        video_filename=demo_vid_path.name,
        bus_id="BUS-001",
        route_id=1,
        sample_interval_sec=1.0,
        gps_coordinates_json=None,
        db=db
    )

@router.post("/detect-frame")
async def detect_frame(
    file: Optional[UploadFile] = File(None),
    bus_id: str = Form("BUS-001"),
    route_id: int = Form(1),
    lat: float = Form(18.5204),
    lng: float = Form(73.8567),
    auto_create_incident: bool = Form(False),
    db: Session = Depends(get_db)
):
    """
    Real-Time Live Optical Detection Endpoint:
    Receives an image snapshot from webcam or video frame,
    runs AI hazard inference, estimates dimensions, and returns detections.
    """
    from PIL import Image
    from app.services.severity import assess_severity
    import time

    temp_path = PROCESSED_DIR / f"live_{int(time.time() * 1000)}.jpg"
    
    if file:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    else:
        # Fallback: create mock road frame
        img = Image.new("RGB", (640, 360), color=(45, 50, 60))
        img.save(temp_path)

    dets = detector.detect_in_image(
        temp_path,
        frame_idx=1,
        timestamp_s=0.0,
        bus_id=bus_id,
        route_id=route_id,
        lat=lat,
        lng=lng
    )

    results = []
    created_incident = None

    for d in dets:
        sev_info = assess_severity(
            hazard_type=d["hazard_type"],
            confidence=d["confidence"],
            estimated_area_m2=d["estimated_area_m2"],
            detection_count=1
        )
        d["severity"] = sev_info["severity"]
        d["severity_reasons"] = sev_info["reasons"]
        results.append(d)

        # Optionally create incident immediately if user toggles auto-report
        if auto_create_incident and d["confidence"] >= 0.85:
            last_inc = db.query(Incident).order_by(Incident.id.desc()).first()
            next_num = (last_inc.id + 1) if last_inc else 1
            inc_code = f"INC-{next_num:03d}"
            
            new_inc = Incident(
                incident_code=inc_code,
                hazard_type=d["hazard_type"],
                latitude=lat,
                longitude=lng,
                location_label=f"Live Optical Stream ({lat:.4f}, {lng:.4f})",
                confidence=d["confidence"],
                severity=sev_info["severity"],
                severity_reasons_json=json.dumps(sev_info["reasons"]),
                bus_id=bus_id,
                route_id=route_id,
                status="NEW",
                image_url=d.get("image_path", ""),
                description=f"Live real-time road hazard detected by mobile sensor {bus_id}.",
                estimated_width_m=d["estimated_width_m"],
                estimated_length_m=d["estimated_length_m"],
                estimated_area_m2=d["estimated_area_m2"],
                detection_count=1,
                deduplication_note="Live camera optical stream detection"
            )
            db.add(new_inc)
            db.commit()
            db.refresh(new_inc)
            created_incident = inc_code

            # Trigger notification if HIGH or CRITICAL
            if new_inc.severity in ["CRITICAL", "HIGH"]:
                notif = Notification(
                    title=f"🚨 LIVE {new_inc.severity} HAZARD: {new_inc.incident_code}",
                    message=f"Live {new_inc.hazard_type} identified by {bus_id} camera. Area: {new_inc.estimated_area_m2} m².",
                    severity=new_inc.severity,
                    incident_id=new_inc.id
                )
                db.add(notif)
                db.commit()

    return {
        "status": "success",
        "detections_count": len(results),
        "detections": results,
        "created_incident": created_incident,
        "mode": detector.mode
    }

