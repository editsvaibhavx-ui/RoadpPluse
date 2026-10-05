"""
Sessions, GPS Telemetry, Real Detection, and ST-DBSCAN Pipeline Router
======================================================================
Provides complete REST API endpoints for session lifecycle, GPS tracks,
frame processing, ST-DBSCAN deduplication, and multi-format exports.
All data is stored in and retrieved from the relational database.
"""

import os
import io
import csv
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
import math
import numpy as np
import cv2
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import UPLOADS_DIR, PROCESSED_DIR, SAMPLE_DIR
from app.models.session import SessionModel, GPSPoint, Detection, Incident, PipelineStep
from app.ai.detector import detector
from app.services.deduplication import run_st_dbscan, synthesize_incident_from_cluster, haversine_distance_meters
from app.ai.video_validator import validate_and_verify_road_video

router = APIRouter(prefix="/api/sessions", tags=["Sessions & Processing Pipeline"])

# ----------------------------------------------------
# Pydantic Schemas for Strict Request Validation
# ----------------------------------------------------
class CreateSessionRequest(BaseModel):
    source: str = Field(..., description="'upload' or 'live'")
    video_filename: Optional[str] = None
    video_duration_s: Optional[float] = 0.0
    distance_source: Optional[str] = None
    device_info: Optional[str] = None

class GPSPointPayload(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)
    accuracy_m: Optional[float] = 5.0
    speed_mps: Optional[float] = 0.0
    heading: Optional[float] = 0.0
    recorded_at: Optional[datetime] = None
    video_offset_s: Optional[float] = 0.0
    cumulative_distance_m: Optional[float] = None

class BatchGPSRequest(BaseModel):
    points: List[GPSPointPayload]

class DetectionPayload(BaseModel):
    class_: str = Field(..., alias="class")
    confidence: float = Field(..., ge=0.0, le=1.0)
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    width_cm: Optional[float] = 0.0
    length_cm: Optional[float] = 0.0
    depth_est: Optional[str] = "0"
    frame_index: Optional[int] = 0
    video_offset_s: Optional[float] = 0.0
    detected_at: Optional[datetime] = None
    lat: float
    lon: float
    gps_accuracy_m: Optional[float] = 5.0
    chainage_m: Optional[float] = 0.0
    thumbnail_path: Optional[str] = None

    class Config:
        populate_by_name = True

class BatchDetectionRequest(BaseModel):
    detections: List[DetectionPayload]

class StepUpdateRequest(BaseModel):
    status: str = Field(..., description="'pending', 'running', 'completed', or 'failed'")
    error_message: Optional[str] = None

# ----------------------------------------------------
# Helper to Initialize Pipeline Steps for a Session
# ----------------------------------------------------
PIPELINE_STEP_NAMES = {
    1: "Video Ingestion: Format validation & metadata extraction",
    2: "Frame Sampling: OpenCV computer vision extraction",
    3: "GPS Alignment: Spatio-temporal track & chainage calculation",
    4: "AI Detection: Road defect edge/contour/YOLO analysis",
    5: "ST-DBSCAN: Spatio-temporal deduplication & incident synthesis",
}

def init_pipeline_steps(db: Session, session_id: str):
    now = datetime.utcnow()
    steps = [
        PipelineStep(
            session_id=session_id,
            step_no=1,
            name=PIPELINE_STEP_NAMES[1],
            status="running",
            started_at=now,
        ),
        PipelineStep(
            session_id=session_id,
            step_no=2,
            name=PIPELINE_STEP_NAMES[2],
            status="pending",
        ),
        PipelineStep(
            session_id=session_id,
            step_no=3,
            name=PIPELINE_STEP_NAMES[3],
            status="pending",
        ),
        PipelineStep(
            session_id=session_id,
            step_no=4,
            name=PIPELINE_STEP_NAMES[4],
            status="pending",
        ),
        PipelineStep(
            session_id=session_id,
            step_no=5,
            name=PIPELINE_STEP_NAMES[5],
            status="pending",
        ),
    ]
    db.add_all(steps)
    db.commit()

# ----------------------------------------------------
# Endpoints
# ----------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED)
def create_session(payload: CreateSessionRequest, db: Session = Depends(get_db)):
    """Creates a new monitoring session and initializes all 5 pipeline steps"""
    if payload.source not in ["upload", "live"]:
        raise HTTPException(status_code=400, detail="source must be 'upload' or 'live'")

    session_id = f"SES-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
    session = SessionModel(
        id=session_id,
        source=payload.source,
        video_filename=payload.video_filename,
        video_duration_s=payload.video_duration_s or 0.0,
        status="processing",
        distance_m=0.0,
        distance_source=payload.distance_source,
        avg_speed_kmh=0.0,
        device_info=payload.device_info or "Edge Dashcam Mount",
        started_at=datetime.utcnow()
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    init_pipeline_steps(db, session_id)
    return session.to_dict()

@router.get("")
def list_sessions(db: Session = Depends(get_db)):
    """Returns list of all monitoring sessions. Returns [] if empty."""
    sessions = db.query(SessionModel).order_by(SessionModel.created_at.desc()).all()
    return [s.to_dict() for s in sessions]

@router.get("/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    """Returns detailed session record including current pipeline step states"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.to_dict()

@router.delete("/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Deletes a session and cascade-deletes its GPS points, detections, incidents, and steps"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"message": f"Session {session_id} deleted successfully"}

@router.post("/{session_id}/gps")
def append_gps_points(session_id: str, payload: Any = Body(...), db: Session = Depends(get_db)):
    """Batch appends real GPS telemetry points to a session and updates cumulative distance"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    points_data = []
    if isinstance(payload, dict):
        points_data = payload.get("points") or []
    elif isinstance(payload, list):
        points_data = payload

    if not points_data:
        return {"inserted_count": 0, "total_distance_m": session.distance_m}

    last_pt = db.query(GPSPoint).filter(GPSPoint.session_id == session_id).order_by(GPSPoint.recorded_at.desc()).first()
    running_dist = last_pt.cumulative_distance_m if last_pt else (session.distance_m or 0.0)
    prev_lat = last_pt.lat if last_pt else None
    prev_lon = last_pt.lon if last_pt else None

    new_points = []
    speeds = []

    for item in points_data:
        pt = item if isinstance(item, dict) else (item.dict() if hasattr(item, "dict") else vars(item))
        pt_lat = float(pt.get("lat") if pt.get("lat") is not None else pt.get("latitude", 0.0))
        pt_lon = float(pt.get("lon") if pt.get("lon") is not None else (pt.get("lng") if pt.get("lng") is not None else pt.get("longitude", 0.0)))
        pt_cum_dist = pt.get("cumulative_distance_m")
        pt_acc = float(pt.get("accuracy_m") or pt.get("accuracy") or 5.0)
        pt_speed = float(pt.get("speed_mps") or pt.get("speed") or 0.0)
        pt_heading = float(pt.get("heading") or 0.0)
        pt_offset = float(pt.get("video_offset_s") or pt.get("time_s") or 0.0)
        pt_rec = pt.get("recorded_at") or datetime.utcnow()
        if isinstance(pt_rec, str):
            try:
                pt_rec = datetime.fromisoformat(pt_rec.replace("Z", "+00:00"))
            except Exception:
                pt_rec = datetime.utcnow()

        if pt_cum_dist is not None:
            running_dist = float(pt_cum_dist)
        elif prev_lat is not None and prev_lon is not None:
            step_dist = haversine_distance_meters(prev_lat, prev_lon, pt_lat, pt_lon)
            if step_dist >= 1.5 and step_dist < 150.0:
                running_dist += step_dist

        prev_lat = pt_lat
        prev_lon = pt_lon

        if pt_speed > 0:
            speeds.append(pt_speed * 3.6)

        new_points.append(
            GPSPoint(
                session_id=session_id,
                lat=pt_lat,
                lon=pt_lon,
                accuracy_m=pt_acc,
                speed_mps=pt_speed,
                heading=pt_heading,
                recorded_at=pt_rec,
                video_offset_s=pt_offset,
                cumulative_distance_m=round(running_dist, 1)
            )
        )

    db.add_all(new_points)
    session.distance_m = round(running_dist, 1)
    if speeds:
        session.avg_speed_kmh = round(sum(speeds) / len(speeds), 1)

    db.commit()

    return {
        "inserted_count": len(new_points),
        "total_distance_m": session.distance_m,
        "total_distance_km": round(session.distance_m / 1000.0, 3),
        "avg_speed_kmh": session.avg_speed_kmh
    }

@router.post("/{session_id}/detections")
def insert_detections(session_id: str, payload: Any = Body(...), db: Session = Depends(get_db)):
    """Batch inserts raw detections produced for a session"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    dets_data = []
    if isinstance(payload, dict):
        dets_data = payload.get("detections") or []
    elif isinstance(payload, list):
        dets_data = payload

    new_detections = []
    for item in dets_data:
        d = item if isinstance(item, dict) else (item.dict() if hasattr(item, "dict") else vars(item))
        d_cls = d.get("class") or d.get("class_") or d.get("hazard_type") or "pothole"
        d_conf = float(d.get("confidence") or 0.8)
        d_bx = float(d.get("bbox_x") or (d.get("bbox")[0] if isinstance(d.get("bbox"), list) and len(d.get("bbox")) >= 4 else 0.0))
        d_by = float(d.get("bbox_y") or (d.get("bbox")[1] if isinstance(d.get("bbox"), list) and len(d.get("bbox")) >= 4 else 0.0))
        d_bw = float(d.get("bbox_w") or (d.get("bbox")[2] - d.get("bbox")[0] if isinstance(d.get("bbox"), list) and len(d.get("bbox")) >= 4 else 50.0))
        d_bh = float(d.get("bbox_h") or (d.get("bbox")[3] - d.get("bbox")[1] if isinstance(d.get("bbox"), list) and len(d.get("bbox")) >= 4 else 50.0))
        d_w_cm = float(d.get("width_cm") or (d.get("estimated_width_m", 0.0) * 100) or 20.0)
        d_l_cm = float(d.get("length_cm") or (d.get("estimated_length_m", 0.0) * 100) or 25.0)
        d_depth = str(d.get("depth_est") or d.get("depth") or "moderate")
        d_frame = int(d.get("frame_index") or d.get("frame_number") or 0)
        d_offset = float(d.get("video_offset_s") or d.get("timestamp_seconds") or 0.0)
        d_lat = float(d.get("lat") or d.get("latitude") or 0.0)
        d_lon = float(d.get("lon") or d.get("lng") or d.get("longitude") or 0.0)
        d_acc = float(d.get("gps_accuracy_m") or d.get("gps_accuracy") or 5.0)
        d_chain = float(d.get("chainage_m") or d.get("chainageMeters") or 0.0)
        d_thumb = d.get("thumbnail_path") or d.get("image_path")

        new_detections.append(
            Detection(
                session_id=session_id,
                class_=d_cls,
                confidence=d_conf,
                bbox_x=d_bx,
                bbox_y=d_by,
                bbox_w=d_bw,
                bbox_h=d_bh,
                width_cm=d_w_cm,
                length_cm=d_l_cm,
                depth_est=d_depth,
                frame_index=d_frame,
                video_offset_s=d_offset,
                detected_at=datetime.utcnow(),
                lat=d_lat,
                lon=d_lon,
                gps_accuracy_m=d_acc,
                chainage_m=d_chain,
                thumbnail_path=d_thumb,
                incident_id=None
            )
        )

    if new_detections:
        db.add_all(new_detections)
        db.commit()

    return {"inserted_count": len(new_detections)}

@router.post("/{session_id}/steps/{step_no}")
def update_step_status(session_id: str, step_no: int, payload: StepUpdateRequest, db: Session = Depends(get_db)):
    """Updates the status of a pipeline step (running, completed, failed)"""
    step = db.query(PipelineStep).filter(
        PipelineStep.session_id == session_id,
        PipelineStep.step_no == step_no
    ).first()

    if not step:
        raise HTTPException(status_code=404, detail=f"Pipeline step {step_no} not found for this session")

    step.status = payload.status
    if payload.status == "running" and not step.started_at:
        step.started_at = datetime.utcnow()
    elif payload.status in ["completed", "failed"]:
        step.finished_at = datetime.utcnow()

    if payload.error_message:
        step.error_message = payload.error_message

    # Session level updates
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if session:
        if payload.status == "failed":
            session.status = "failed"
            session.ended_at = datetime.utcnow()
        elif step_no == 5 and payload.status == "completed":
            session.status = "completed"
            session.ended_at = datetime.utcnow()

    db.commit()
    db.refresh(step)
    return step.to_dict()

@router.get("/{session_id}/detections")
def get_session_detections(session_id: str, db: Session = Depends(get_db)):
    """Retrieves all detections for a session"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    detections = db.query(Detection).filter(Detection.session_id == session_id).order_by(Detection.video_offset_s.asc()).all()
    return [d.to_dict() for d in detections]

@router.get("/{session_id}/incidents")
def get_session_incidents(session_id: str, db: Session = Depends(get_db)):
    """Retrieves all synthesized incidents for a session after Step 5 ST-DBSCAN"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    incidents = db.query(Incident).filter(Incident.session_id == session_id).order_by(Incident.chainage_m.asc()).all()
    return [i.to_dict() for i in incidents]

# ----------------------------------------------------
# Real Video Processing (Steps 1 -> 4)
# ----------------------------------------------------
class ProcessVideoRequest(BaseModel):
    video_filename: str
    sample_interval_sec: Optional[float] = 1.0

@router.post("/{session_id}/process-video")
def run_process_video(session_id: str, payload: ProcessVideoRequest, db: Session = Depends(get_db)):
    """
    Executes Steps 1, 2, 3, and 4 on real video frames:
    - Step 1: Pre-flight validation & Computer Vision road scene verification
    - Step 2: Real frame extraction via OpenCV
    - Step 3: GPS Telemetry track alignment & chainage interpolation
    - Step 4: Real OpenCV edge & contour road defect detection
    - Persists all real detections into the database detections table
    """
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Locate video file
    video_path = UPLOADS_DIR / payload.video_filename
    if not video_path.exists():
        video_path = SAMPLE_DIR / payload.video_filename
    if not video_path.exists():
        raise HTTPException(status_code=404, detail=f"Video file '{payload.video_filename}' not found on server")

    # Step 1: Pre-flight Video Integrity & Road Scene Verification
    s1 = db.query(PipelineStep).filter(PipelineStep.session_id == session_id, PipelineStep.step_no == 1).first()
    if s1:
        s1.status = "running"
        s1.started_at = datetime.utcnow()
    db.commit()

    verification = validate_and_verify_road_video(video_path)
    if not verification.get("valid"):
        err_msg = verification.get("error", "Invalid video file.")
        if s1:
            s1.status = "failed"
            s1.finished_at = datetime.utcnow()
            s1.error_message = err_msg
        session.status = "failed"
        session.ended_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail=f"Step 1 Failed: {err_msg}")

    if not verification.get("is_road"):
        err_msg = verification.get("error", "Verification Failed: Uploaded video does not appear to be an authentic road scene.")
        if s1:
            s1.status = "failed"
            s1.finished_at = datetime.utcnow()
            s1.error_message = err_msg
        session.status = "failed"
        session.ended_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail=f"Step 1 Failed: {err_msg}")

    if s1:
        s1.status = "completed"
        s1.finished_at = datetime.utcnow()

    # Step 2: Begin Real Frame Extraction via OpenCV
    s2 = db.query(PipelineStep).filter(PipelineStep.session_id == session_id, PipelineStep.step_no == 2).first()
    if s2:
        s2.status = "running"
        s2.started_at = datetime.utcnow()
    db.commit()

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        cap = cv2.VideoCapture(str(video_path), cv2.CAP_FFMPEG)
    if not cap.isOpened():
        if s2:
            s2.status = "failed"
            s2.finished_at = datetime.utcnow()
            s2.error_message = "Could not open video file via OpenCV decoder"
        session.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail="Step 2 Failed: Failed to decode video format")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if not fps or fps <= 0 or np.isnan(fps):
        fps = 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration_s = total_frames / fps if (fps > 0 and total_frames > 0) else (session.video_duration_s or 10.0)
    frame_step = max(1, int(fps * (payload.sample_interval_sec or 1.0)))

    session.video_duration_s = round(duration_s, 2)
    session.video_filename = payload.video_filename

    # Step 2 complete
    if s2:
        s2.status = "completed"
        s2.finished_at = datetime.utcnow()

    # Step 3: GPS Telemetry Alignment
    s3 = db.query(PipelineStep).filter(PipelineStep.session_id == session_id, PipelineStep.step_no == 3).first()
    if s3:
        s3.status = "running"
        s3.started_at = datetime.utcnow()
    db.commit()

    # Load session GPS points for interpolation
    gps_points = db.query(GPSPoint).filter(GPSPoint.session_id == session_id).order_by(GPSPoint.video_offset_s.asc()).all()

    def get_interpolated_gps(t_sec: float) -> Tuple[float, float, float]:
        if not gps_points:
            return 0.0, 0.0, 0.0
        if len(gps_points) == 1:
            return gps_points[0].lat, gps_points[0].lon, gps_points[0].cumulative_distance_m

        if t_sec <= gps_points[0].video_offset_s:
            return gps_points[0].lat, gps_points[0].lon, gps_points[0].cumulative_distance_m
        if t_sec >= gps_points[-1].video_offset_s:
            return gps_points[-1].lat, gps_points[-1].lon, gps_points[-1].cumulative_distance_m

        for k in range(len(gps_points) - 1):
            p1 = gps_points[k]
            p2 = gps_points[k + 1]
            if p1.video_offset_s <= t_sec <= p2.video_offset_s:
                ratio = (t_sec - p1.video_offset_s) / max(0.001, (p2.video_offset_s - p1.video_offset_s))
                lat_interp = p1.lat + ratio * (p2.lat - p1.lat)
                lon_interp = p1.lon + ratio * (p2.lon - p1.lon)
                dist_interp = p1.cumulative_distance_m + ratio * (p2.cumulative_distance_m - p1.cumulative_distance_m)
                return lat_interp, lon_interp, dist_interp

        return gps_points[-1].lat, gps_points[-1].lon, gps_points[-1].cumulative_distance_m

    if s3:
        s3.status = "completed"
        s3.finished_at = datetime.utcnow()

    # Step 4: AI Hazard Detection on REAL Video Frames
    s4 = db.query(PipelineStep).filter(PipelineStep.session_id == session_id, PipelineStep.step_no == 4).first()
    if s4:
        s4.status = "running"
        s4.started_at = datetime.utcnow()
    db.commit()

    frame_idx = 0
    sampled_count = 0
    all_detections = []
    annotated_samples = []

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_step == 0:
                sampled_count += 1
                t_sec = round(frame_idx / fps, 2)
                cur_lat, cur_lon, cur_chainage = get_interpolated_gps(t_sec)

                # Save raw sampled frame
                temp_frame_path = PROCESSED_DIR / f"frame_{session_id}_{frame_idx}.jpg"
                cv2.imwrite(str(temp_frame_path), frame)

                # Run real OpenCV detector on real frame
                dets = detector.detect_in_image(
                    image_path=temp_frame_path,
                    frame_idx=frame_idx,
                    timestamp_s=t_sec,
                    lat=cur_lat,
                    lon=cur_lon,
                    chainage_m=cur_chainage
                )

                for d in dets:
                    new_det = Detection(
                        session_id=session_id,
                        class_=d["class"],
                        confidence=d["confidence"],
                        bbox_x=d["bbox_x"],
                        bbox_y=d["bbox_y"],
                        bbox_w=d["bbox_w"],
                        bbox_h=d["bbox_h"],
                        width_cm=d["width_cm"],
                        length_cm=d["length_cm"],
                        depth_est=d["depth_est"],
                        frame_index=frame_idx,
                        video_offset_s=t_sec,
                        detected_at=datetime.utcnow(),
                        lat=cur_lat,
                        lon=cur_lon,
                        gps_accuracy_m=5.0,
                        chainage_m=cur_chainage,
                        thumbnail_path=d.get("thumbnail_path"),
                        incident_id=None
                    )
                    all_detections.append(new_det)

                    if d.get("thumbnail_path") and len(annotated_samples) < 8:
                        if not any(s["thumbnail_path"] == d["thumbnail_path"] for s in annotated_samples):
                            annotated_samples.append({
                                "frame_idx": frame_idx,
                                "timestamp_s": t_sec,
                                "thumbnail_path": d["thumbnail_path"],
                                "class": d["class"],
                                "confidence": d["confidence"]
                            })

            frame_idx += 1

        cap.release()

        # Save all real detections into DB
        if all_detections:
            db.add_all(all_detections)

        if s4:
            s4.status = "completed"
            s4.finished_at = datetime.utcnow()

        db.commit()

        pothole_count = sum(1 for d in all_detections if "pothole" in d.class_.lower())
        crack_count = sum(1 for d in all_detections if "crack" in d.class_.lower())

        return {
            "session_id": session_id,
            "sampled_frames_count": sampled_count,
            "detections_count": len(all_detections),
            "potholes_count": pothole_count,
            "cracks_count": crack_count,
            "video_duration_s": session.video_duration_s,
            "annotated_samples": annotated_samples,
            "message": f"Processed {sampled_count} frames. Detected {len(all_detections)} genuine road hazards ({pothole_count} potholes, {crack_count} cracks)."
        }

    except HTTPException:
        cap.release()
        raise
    except Exception as e:
        cap.release()
        if s4:
            s4.status = "failed"
            s4.error_message = str(e)
            s4.finished_at = datetime.utcnow()
        session.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Step 4 Failed: {str(e)}")

# ----------------------------------------------------
# Step 5: ST-DBSCAN Deduplication & Incident Creation
# ----------------------------------------------------
class ClusterRequest(BaseModel):
    eps1_meters: Optional[float] = 5.0
    eps2_seconds: Optional[float] = 10.0
    min_pts: Optional[int] = 2

@router.post("/{session_id}/cluster")
def run_session_clustering(
    session_id: str,
    params: Optional[ClusterRequest] = None,
    db: Session = Depends(get_db)
):
    """
    Executes Step 5:
    - Reads all detections for this session from DB
    - Executes pure ST-DBSCAN clustering (eps1=5m, eps2=10s, minPts=2, same class)
    - Synthesizes clusters and noise singletons into incidents in DB
    - Links each detection.incident_id to its synthesized incident
    - Updates Step 5 to 'completed' and session to 'completed'
    """
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    s5 = db.query(PipelineStep).filter(PipelineStep.session_id == session_id, PipelineStep.step_no == 5).first()
    if s5:
        s5.status = "running"
        s5.started_at = datetime.utcnow()
    db.commit()

    eps1 = params.eps1_meters if params and params.eps1_meters else 5.0
    eps2 = params.eps2_seconds if params and params.eps2_seconds else 10.0
    min_pts = params.min_pts if params and params.min_pts else 2

    detections = db.query(Detection).filter(Detection.session_id == session_id).all()
    if not detections:
        # Zero detections: Step 5 still completes cleanly with zero fake data!
        if s5:
            s5.status = "completed"
            s5.finished_at = datetime.utcnow()
        session.status = "completed"
        session.ended_at = datetime.utcnow()
        db.commit()
        return {
            "session_id": session_id,
            "clusters_count": 0,
            "noise_count": 0,
            "incidents_count": 0,
            "incidents": [],
            "annotated_samples": [],
            "message": "No potholes detected"
        }

    dets_dict = [d.to_dict() for d in detections]
    clustering = run_st_dbscan(dets_dict, eps1_meters=eps1, eps2_seconds=eps2, min_pts=min_pts)

    created_incidents = []

    # 1. Synthesize clusters
    for cluster in clustering["clusters"]:
        inc_data = synthesize_incident_from_cluster(cluster, session_id=session_id, is_noise=False)
        inc_obj = Incident(
            session_id=session_id,
            class_=inc_data["class"],
            centroid_lat=inc_data["centroid_lat"],
            centroid_lon=inc_data["centroid_lon"],
            max_confidence=inc_data["max_confidence"],
            avg_width_cm=inc_data["avg_width_cm"],
            avg_length_cm=inc_data["avg_length_cm"],
            severity=inc_data["severity"],
            severity_score=inc_data["severity_score"],
            detection_count=inc_data["detection_count"],
            first_seen_at=inc_data["first_seen_at"],
            last_seen_at=inc_data["last_seen_at"],
            chainage_m=inc_data["chainage_m"],
            thumbnail_path=inc_data["thumbnail_path"],
            status="open"
        )
        db.add(inc_obj)
        db.flush()

        # Link detections
        for det_id in inc_data["detection_ids"]:
            det_record = db.query(Detection).filter(Detection.id == det_id).first()
            if det_record:
                det_record.incident_id = inc_obj.id

        created_incidents.append(inc_obj)

    # 2. Synthesize noise singletons (preserved as low-confidence incidents)
    for noise_det in clustering["noise"]:
        inc_data = synthesize_incident_from_cluster([noise_det], session_id=session_id, is_noise=True)
        inc_obj = Incident(
            session_id=session_id,
            class_=inc_data["class"],
            centroid_lat=inc_data["centroid_lat"],
            centroid_lon=inc_data["centroid_lon"],
            max_confidence=inc_data["max_confidence"],
            avg_width_cm=inc_data["avg_width_cm"],
            avg_length_cm=inc_data["avg_length_cm"],
            severity="low",
            severity_score=inc_data["severity_score"],
            detection_count=1,
            first_seen_at=inc_data["first_seen_at"],
            last_seen_at=inc_data["last_seen_at"],
            chainage_m=inc_data["chainage_m"],
            thumbnail_path=inc_data["thumbnail_path"],
            status="open"
        )
        db.add(inc_obj)
        db.flush()

        det_id = noise_det.get("id")
        if det_id:
            det_record = db.query(Detection).filter(Detection.id == det_id).first()
            if det_record:
                det_record.incident_id = inc_obj.id

        created_incidents.append(inc_obj)

    # Mark Step 5 and Session completed
    if s5:
        s5.status = "completed"
        s5.finished_at = datetime.utcnow()
    session.status = "completed"
    session.ended_at = datetime.utcnow()

    db.commit()

    # Collect sample annotated thumbnails
    sample_thumbnails = []
    for d in detections:
        if d.thumbnail_path and not any(st["thumbnail_path"] == d.thumbnail_path for st in sample_thumbnails):
            sample_thumbnails.append({
                "thumbnail_path": d.thumbnail_path,
                "class": d.class_,
                "confidence": round(d.confidence or 0.0, 3),
                "video_offset_s": round(d.video_offset_s or 0.0, 2),
                "chainage_m": round(d.chainage_m or 0.0, 1)
            })
            if len(sample_thumbnails) >= 8:
                break

    return {
        "session_id": session_id,
        "clusters_count": clustering["clusters_count"],
        "noise_count": clustering["noise_count"],
        "incidents_count": len(created_incidents),
        "incidents": [i.to_dict() for i in created_incidents],
        "annotated_samples": sample_thumbnails
    }

# ----------------------------------------------------
# Multi-Format Export (JSON / CSV / GeoJSON)
# ----------------------------------------------------
@router.get("/{session_id}/export")
def export_session_data(
    session_id: str,
    format: str = Query("json", pattern="^(json|csv|geojson)$"),
    db: Session = Depends(get_db)
):
    """Exports session telemetry, detections, and incidents in JSON, CSV, or GeoJSON"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    incidents = db.query(Incident).filter(Incident.session_id == session_id).all()
    detections = db.query(Detection).filter(Detection.session_id == session_id).all()
    gps_points = db.query(GPSPoint).filter(GPSPoint.session_id == session_id).order_by(GPSPoint.recorded_at.asc()).all()

    if format == "json":
        export_payload = {
            "session": session.to_dict(),
            "summary": {
                "distance_m": session.distance_m,
                "video_duration_s": session.video_duration_s,
                "detections_count": len(detections),
                "incidents_count": len(incidents),
            },
            "incidents": [i.to_dict() for i in incidents],
            "detections": [d.to_dict() for d in detections],
            "track": [p.to_dict() for p in gps_points]
        }
        return JSONResponse(
            content=export_payload,
            headers={"Content-Disposition": f"attachment; filename=session_{session_id}.json"}
        )

    elif format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Incident_Code", "Class", "Severity", "Severity_Score",
            "Centroid_Lat", "Centroid_Lon", "Confidence", "Avg_Width_CM",
            "Avg_Length_CM", "Detection_Count", "Chainage_M", "Status"
        ])
        for inc in incidents:
            writer.writerow([
                f"INC-{inc.id:03d}", inc.class_, inc.severity, inc.severity_score,
                inc.centroid_lat, inc.centroid_lon, inc.max_confidence, inc.avg_width_cm,
                inc.avg_length_cm, inc.detection_count, inc.chainage_m, inc.status
            ])
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=session_{session_id}_incidents.csv"}
        )

    elif format == "geojson":
        features = []
        # GPS Track LineString
        if len(gps_points) >= 2:
            line_coords = [[p.lon, p.lat] for p in gps_points]
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": line_coords
                },
                "properties": {
                    "type": "vehicle_route",
                    "session_id": session_id,
                    "distance_m": session.distance_m
                }
            })

        # Incident Points
        for inc in incidents:
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [inc.centroid_lon, inc.centroid_lat]
                },
                "properties": {
                    "id": f"INC-{inc.id:03d}",
                    "class": inc.class_,
                    "severity": inc.severity,
                    "severity_score": inc.severity_score,
                    "confidence": inc.max_confidence,
                    "chainage_m": inc.chainage_m,
                    "detection_count": inc.detection_count,
                    "status": inc.status
                }
            })

        geojson_obj = {
            "type": "FeatureCollection",
            "session_id": session_id,
            "created_at": datetime.utcnow().isoformat(),
            "features": features
        }
        return JSONResponse(
            content=geojson_obj,
            headers={"Content-Disposition": f"attachment; filename=session_{session_id}.geojson"}
        )
