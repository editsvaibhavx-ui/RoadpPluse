"""
Session, Telemetry, Detection, Incident and Pipeline Step Database Models
========================================================================
Full relational schema supporting mobile urban intelligence with spatio-temporal tracking.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from app.database import Base

class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(String(64), primary_key=True, index=True)
    source = Column(String(32), nullable=False)  # 'upload' | 'live'
    video_filename = Column(String(255), nullable=True)
    video_duration_s = Column(Float, default=0.0)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    status = Column(String(32), default="processing")  # 'processing' | 'completed' | 'failed'
    distance_m = Column(Float, default=0.0)
    distance_source = Column(String(64), nullable=True)  # 'embedded_gps' | 'gpx' | 'map_points' | 'live_gps' | 'speed_estimate'
    avg_speed_kmh = Column(Float, default=0.0)
    device_info = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    gps_points = relationship("GPSPoint", backref="session", cascade="all, delete-orphan", order_by="GPSPoint.recorded_at")
    detections = relationship("Detection", backref="session", cascade="all, delete-orphan", order_by="Detection.detected_at")
    incidents = relationship("Incident", backref="session", cascade="all, delete-orphan")
    pipeline_steps = relationship("PipelineStep", backref="session", cascade="all, delete-orphan", order_by="PipelineStep.step_no")

    def to_dict(self):
        return {
            "id": self.id,
            "source": self.source,
            "video_filename": self.video_filename,
            "video_duration_s": round(self.video_duration_s or 0.0, 2),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "status": self.status,
            "distance_m": round(self.distance_m or 0.0, 1),
            "distance_km": round((self.distance_m or 0.0) / 1000.0, 3),
            "distance_source": self.distance_source,
            "avg_speed_kmh": round(self.avg_speed_kmh or 0.0, 1),
            "device_info": self.device_info,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "detections_count": len(self.detections) if self.detections else 0,
            "incidents_count": len(self.incidents) if self.incidents else 0,
            "pipeline_steps": [s.to_dict() for s in self.pipeline_steps] if self.pipeline_steps else []
        }


class GPSPoint(Base):
    __tablename__ = "gps_points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    accuracy_m = Column(Float, default=0.0)
    speed_mps = Column(Float, default=0.0)
    heading = Column(Float, default=0.0)
    recorded_at = Column(DateTime, default=datetime.utcnow)
    video_offset_s = Column(Float, default=0.0)
    cumulative_distance_m = Column(Float, default=0.0)

    __table_args__ = (
        Index("idx_gps_session_recorded", "session_id", "recorded_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "lat": self.lat,
            "lon": self.lon,
            "latitude": self.lat,
            "longitude": self.lon,
            "accuracy_m": self.accuracy_m,
            "speed_mps": self.speed_mps,
            "heading": self.heading,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
            "video_offset_s": round(self.video_offset_s or 0.0, 2),
            "cumulative_distance_m": round(self.cumulative_distance_m or 0.0, 1)
        }


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    class_ = Column("class", String(64), nullable=False)
    confidence = Column(Float, nullable=False)
    bbox_x = Column(Float, nullable=False)
    bbox_y = Column(Float, nullable=False)
    bbox_w = Column(Float, nullable=False)
    bbox_h = Column(Float, nullable=False)
    width_cm = Column(Float, default=0.0)
    length_cm = Column(Float, default=0.0)
    depth_est = Column(String(64), default="0")
    frame_index = Column(Integer, default=0)
    video_offset_s = Column(Float, default=0.0)
    detected_at = Column(DateTime, default=datetime.utcnow)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    gps_accuracy_m = Column(Float, default=5.0)
    chainage_m = Column(Float, default=0.0)
    thumbnail_path = Column(String(255), nullable=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True)

    def to_dict(self):
        w_m = (self.width_cm or 0.0) / 100.0
        l_m = (self.length_cm or 0.0) / 100.0
        return {
            "id": self.id,
            "session_id": self.session_id,
            "class": self.class_,
            "class_name": self.class_,
            "hazard_type": self.class_,
            "confidence": round(self.confidence, 3),
            "bbox_x": round(self.bbox_x, 1),
            "bbox_y": round(self.bbox_y, 1),
            "bbox_w": round(self.bbox_w, 1),
            "bbox_h": round(self.bbox_h, 1),
            "bbox": [round(self.bbox_x, 1), round(self.bbox_y, 1), round(self.bbox_x + self.bbox_w, 1), round(self.bbox_y + self.bbox_h, 1)],
            "bounding_box": [round(self.bbox_x, 1), round(self.bbox_y, 1), round(self.bbox_x + self.bbox_w, 1), round(self.bbox_y + self.bbox_h, 1)],
            "width_cm": round(self.width_cm or 0.0, 1),
            "length_cm": round(self.length_cm or 0.0, 1),
            "estimated_width_m": round(w_m, 2),
            "estimated_length_m": round(l_m, 2),
            "estimated_area_m2": round(w_m * l_m, 3),
            "estimated_dimensions": {
                "width_m": round(w_m, 2),
                "length_m": round(l_m, 2),
                "area_m2": round(w_m * l_m, 3)
            },
            "depth_est": self.depth_est,
            "frame_index": self.frame_index,
            "frame_number": self.frame_index,
            "video_offset_s": round(self.video_offset_s or 0.0, 2),
            "timestamp_seconds": round(self.video_offset_s or 0.0, 2),
            "time_s": round(self.video_offset_s or 0.0, 2),
            "detected_at": self.detected_at.isoformat() if self.detected_at else None,
            "timestamp_iso": self.detected_at.isoformat() if self.detected_at else None,
            "lat": self.lat,
            "lon": self.lon,
            "lng": self.lon,
            "latitude": self.lat,
            "longitude": self.lon,
            "gps_accuracy_m": self.gps_accuracy_m,
            "gps_accuracy": self.gps_accuracy_m,
            "chainage_m": round(self.chainage_m or 0.0, 1),
            "chainageMeters": round(self.chainage_m or 0.0, 1),
            "chainageLabel": f"{round(self.chainage_m or 0.0, 1)} m",
            "thumbnail_path": self.thumbnail_path,
            "image_path": self.thumbnail_path,
            "incident_id": self.incident_id
        }


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    class_ = Column("class", String(64), nullable=False)
    centroid_lat = Column(Float, nullable=False)
    centroid_lon = Column(Float, nullable=False)
    max_confidence = Column(Float, default=0.0)
    avg_width_cm = Column(Float, default=0.0)
    avg_length_cm = Column(Float, default=0.0)
    severity = Column(String(32), default="medium")  # 'low' | 'medium' | 'high'
    severity_score = Column(Float, default=0.0)
    detection_count = Column(Integer, default=1)
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow)
    chainage_m = Column(Float, default=0.0)
    thumbnail_path = Column(String(255), nullable=True)
    status = Column(String(32), default="open")  # 'open' | 'verified' | 'repaired'

    # Relationships
    detections = relationship("Detection", backref="incident_record", foreign_keys=[Detection.incident_id])

    def to_dict(self):
        w_m = (self.avg_width_cm or 0.0) / 100.0
        l_m = (self.avg_length_cm or 0.0) / 100.0
        offsets = [d.video_offset_s for d in self.detections if d.video_offset_s is not None] if self.detections else []
        video_offset = round(min(offsets), 2) if offsets else 0.0
        m = int(video_offset // 60)
        s = int(video_offset % 60)
        return {
            "id": self.id,
            "incident_code": f"INC-{self.id:03d}",
            "session_id": self.session_id,
            "class": self.class_,
            "class_name": self.class_,
            "hazard_type": self.class_,
            "centroid_lat": self.centroid_lat,
            "centroid_lon": self.centroid_lon,
            "latitude": self.centroid_lat,
            "longitude": self.centroid_lon,
            "lat": self.centroid_lat,
            "lng": self.centroid_lon,
            "max_confidence": round(self.max_confidence or 0.0, 3),
            "confidence": round(self.max_confidence or 0.0, 3),
            "avg_width_cm": round(self.avg_width_cm or 0.0, 1),
            "avg_length_cm": round(self.avg_length_cm or 0.0, 1),
            "estimated_width_m": round(w_m, 2),
            "estimated_length_m": round(l_m, 2),
            "estimated_area_m2": round(w_m * l_m, 3),
            "severity": self.severity.upper() if self.severity else "MEDIUM",
            "severity_score": round(self.severity_score or 0.0, 2),
            "detection_count": self.detection_count,
            "first_seen_at": self.first_seen_at.isoformat() if self.first_seen_at else None,
            "last_seen_at": self.last_seen_at.isoformat() if self.last_seen_at else None,
            "detected_at": self.first_seen_at.isoformat() if self.first_seen_at else None,
            "video_offset_s": video_offset,
            "video_timestamp_s": video_offset,
            "video_timestamp": f"{m:02d}:{s:02d} ({video_offset}s)",
            "chainage_m": round(self.chainage_m or 0.0, 1),
            "chainageLabel": f"{round(self.chainage_m or 0.0, 1)} m",
            "thumbnail_path": self.thumbnail_path,
            "image_url": self.thumbnail_path,
            "status": self.status.upper() if self.status else "OPEN"
        }


class PipelineStep(Base):
    __tablename__ = "pipeline_steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    step_no = Column(Integer, nullable=False)  # 1-5
    name = Column(String(128), nullable=False)
    status = Column(String(32), default="pending")  # 'pending' | 'running' | 'completed' | 'failed'
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "step_no": self.step_no,
            "name": self.name,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "error_message": self.error_message
        }
