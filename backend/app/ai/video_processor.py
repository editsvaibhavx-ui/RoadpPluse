"""
Video & Frame Processing Pipeline
=================================
Pipeline Workflow:
1. Video Ingestion: Reads smartphone / demo video using OpenCV cv2.VideoCapture
2. Frame Extraction: Samples frames at configurable interval (e.g., every 15-30 frames / 1s)
   to prevent wasteful duplicate computation on near-identical adjacent frames.
3. GPS Association: Correlates timestamps with GPS coordinates (Pune route stops or custom CSV)
4. AI Inference: Evaluates hazard presence via YOLO / Demo detector
5. Deduplication & Severity: Groups temporally and spatially proximate observations via ST-DBSCAN
"""

import os
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import cv2
from PIL import Image

from app.config import PROCESSED_DIR, PUNE_ROUTE_01_WAYPOINTS
from app.ai.detector import detector
from app.services.deduplication import cluster_detections_st_dbscan, merge_cluster_into_incident
from app.services.severity import assess_severity

logger = logging.getLogger(__name__)

class VideoProcessor:
    def __init__(self):
        self.processed_dir = PROCESSED_DIR

    def process_video(
        self,
        video_path: Path,
        sample_interval_sec: float = 1.0,
        bus_id: str = "BUS-001",
        route_id: int = 1,
        gps_points: Optional[List[Dict[str, float]]] = None
    ) -> Dict[str, Any]:
        """
        Processes video and produces raw detections and deduplicated incidents.
        """
        if not video_path.exists():
            raise FileNotFoundError(f"Video file not found at {video_path}")

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Unable to decode video format at {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration_s = total_frames / fps if fps > 0 else 10.0
        frame_step = max(1, int(fps * sample_interval_sec))

        extracted_frames_info = []
        raw_detections: List[Dict[str, Any]] = []

        # Coordinate interpolation list
        waypoints = gps_points if gps_points and len(gps_points) > 0 else PUNE_ROUTE_01_WAYPOINTS
        num_waypoints = len(waypoints)

        frame_idx = 0
        saved_frame_count = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_step == 0:
                saved_frame_count += 1
                timestamp_s = round(frame_idx / fps, 2)
                
                # Approximate waypoint progression along Pune route
                waypoint_ratio = (frame_idx / max(1, total_frames)) * (num_waypoints - 1)
                wp_idx = min(int(waypoint_ratio), num_waypoints - 1)
                next_wp_idx = min(wp_idx + 1, num_waypoints - 1)
                alpha = waypoint_ratio - wp_idx
                
                cur_lat = round(waypoints[wp_idx]["lat"] + alpha * (waypoints[next_wp_idx]["lat"] - waypoints[wp_idx]["lat"]), 6)
                cur_lng = round(waypoints[wp_idx]["lng"] + alpha * (waypoints[next_wp_idx]["lng"] - waypoints[wp_idx]["lng"]), 6)

                # Save raw sampled frame
                raw_frame_name = f"raw_frame_{video_path.stem}_{saved_frame_count}.jpg"
                raw_frame_path = self.processed_dir / raw_frame_name
                cv2.imwrite(str(raw_frame_path), frame)

                extracted_frames_info.append({
                    "frame_number": frame_idx,
                    "sample_index": saved_frame_count,
                    "timestamp_s": timestamp_s,
                    "image_url": f"/static/processed/{raw_frame_name}",
                    "lat": cur_lat,
                    "lng": cur_lng
                })

                # Run hazard detection
                dets = detector.detect_in_image(
                    raw_frame_path,
                    frame_idx=frame_idx,
                    timestamp_s=timestamp_s,
                    bus_id=bus_id,
                    route_id=route_id,
                    lat=cur_lat,
                    lng=cur_lng
                )
                raw_detections.extend(dets)

            frame_idx += 1

        cap.release()

        # Step 4: Spatio-Temporal Deduplication (ST-DBSCAN)
        clusters = cluster_detections_st_dbscan(raw_detections)
        consolidated_incidents = []

        for idx, cluster in enumerate(clusters, start=1):
            inc_code = f"INC-{100 + idx}"
            merged = merge_cluster_into_incident(cluster, inc_code)
            
            # Severity Assessment
            sev_result = assess_severity(
                hazard_type=merged["hazard_type"],
                confidence=merged["confidence"],
                estimated_area_m2=merged["estimated_area_m2"],
                detection_count=merged["detection_count"]
            )
            merged["severity"] = sev_result["severity"]
            merged["severity_score"] = sev_result["score"]
            merged["severity_reasons"] = sev_result["reasons"]
            consolidated_incidents.append(merged)

        return {
            "total_frames_in_video": total_frames,
            "fps": fps,
            "duration_seconds": round(duration_s, 2),
            "sampled_frames_count": saved_frame_count,
            "raw_detections_count": len(raw_detections),
            "incidents_created_count": len(consolidated_incidents),
            "raw_detections": raw_detections,
            "incidents": consolidated_incidents,
            "sampled_frames": extracted_frames_info,
            "detector_status": detector.get_status()
        }

video_processor = VideoProcessor()
