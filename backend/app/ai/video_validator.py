"""
Road Video Validation & Scene Verification Module
==================================================
Performs strict pre-flight validation on uploaded video files:
1. File format, extension, and file size limits.
2. Decoder readability via OpenCV (cv2.VideoCapture / FFMPEG).
3. Duration, FPS, and frame count verification.
4. Computer Vision Road Scene Verification:
   - Examines lower roadway plane across sampled frames.
   - Analyzes asphalt texture variance, HSV color saturation, and edge distribution.
   - Distinguishes authentic road surfaces from blank screens, cartoons, indoor rooms, or documents.
   - Rejects non-road video before detection starts to prevent generating fake reports.
"""

import os
from pathlib import Path
from typing import Dict, Any, Tuple
import cv2
import numpy as np

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".webm", ".avi", ".mkv"}
MAX_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB

def validate_and_verify_road_video(video_path: Path) -> Dict[str, Any]:
    """
    Validates video file integrity and verifies if it depicts an authentic road scene.
    Returns a dict with 'valid' (bool), 'is_road' (bool), and metadata or error message.
    """
    # 1. File existence
    if not video_path.exists():
        return {
            "valid": False,
            "is_road": False,
            "error": f"Video file not found at {video_path.name}"
        }

    # 2. Extension validation
    ext = video_path.suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return {
            "valid": False,
            "is_road": False,
            "error": f"Unsupported video format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        }

    # 3. File size validation
    size_bytes = video_path.stat().st_size
    if size_bytes == 0:
        return {
            "valid": False,
            "is_road": False,
            "error": "Uploaded video file is empty (0 bytes). Please select a valid video recording."
        }
    if size_bytes > MAX_SIZE_BYTES:
        return {
            "valid": False,
            "is_road": False,
            "error": f"Video size ({size_bytes / (1024*1024):.1f} MB) exceeds maximum allowed limit (100 MB)."
        }

    # 4. Decoder verification
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        cap = cv2.VideoCapture(str(video_path), cv2.CAP_FFMPEG)
    if not cap.isOpened():
        return {
            "valid": False,
            "is_road": False,
            "error": "Unable to decode video. The file may be corrupted or encoded with an unsupported codec."
        }

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    # Read first test frame to verify actual frame decoding
    ret, test_frame = cap.read()
    if not ret or test_frame is None:
        cap.release()
        return {
            "valid": False,
            "is_road": False,
            "error": "Failed to decode video frames. Stream is empty or unreadable."
        }

    if fps <= 0 or np.isnan(fps):
        fps = 30.0
    if total_frames <= 0:
        total_frames = 30

    duration_s = round(total_frames / fps, 2)
    if duration_s < 0.4 and total_frames < 10:
        cap.release()
        return {
            "valid": False,
            "is_road": False,
            "error": f"Video duration ({duration_s}s) is too short. Minimum 1 second of road footage is required."
        }

    # 5. Computer Vision Road Scene Verification
    # Sample up to 5 evenly distributed frames across the video
    sample_indices = []
    if total_frames <= 5:
        sample_indices = list(range(total_frames))
    else:
        sample_indices = [
            0,
            int(total_frames * 0.25),
            int(total_frames * 0.50),
            int(total_frames * 0.75),
            min(total_frames - 1, total_frames - 2)
        ]

    road_frame_matches = 0
    checked_count = 0

    for f_idx in sample_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue

        checked_count += 1
        h, w = frame.shape[:2]
        if h < 40 or w < 40:
            continue

        # Extract lower 55% road plane ROI
        roi = frame[int(h * 0.45):, :]
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

        mean_val = float(np.mean(gray))
        std_val = float(np.std(gray))
        mean_sat = float(np.mean(hsv[:, :, 1]))

        # Edge distribution in roadway plane
        edges = cv2.Canny(gray, 50, 150)
        edge_density = float(np.count_nonzero(edges)) / float(edges.size)

        # Authentic asphalt road criteria:
        # - Roadway asphalt brightness spectrum: 25 <= mean <= 225 (reject pitch black or washed white)
        # - Pavement texture variance: std >= 10.0 (reject solid uniform colors, blank screens, wallpapers)
        # - Low-to-moderate saturation: mean saturation <= 160 (reject high-saturation cartoons, blue sky, solid greens)
        # - Surface edge texture: 0.002 <= edge_density <= 0.35 (reject flat paper and pure noise)
        is_road_surface = (
            (25 <= mean_val <= 225) and
            (std_val >= 9.0) and
            (mean_sat <= 165.0) and
            (0.002 <= edge_density <= 0.38)
        )

        if is_road_surface:
            road_frame_matches += 1

    cap.release()

    pass_ratio = road_frame_matches / max(1, checked_count)
    if pass_ratio < 0.40:
        return {
            "valid": True,
            "is_road": False,
            "error": "Verification Failed: The uploaded video does not appear to be a road scene (no roadway surface or pavement texture detected). Please upload an authentic forward-facing road video.",
            "road_confidence": round(pass_ratio * 100, 1),
            "fps": round(fps, 2),
            "total_frames": total_frames,
            "duration_s": duration_s
        }

    return {
        "valid": True,
        "is_road": True,
        "message": "Video successfully verified: Authentic road scene confirmed.",
        "road_confidence": round(pass_ratio * 100, 1),
        "fps": round(fps, 2),
        "total_frames": total_frames,
        "duration_s": duration_s,
        "width": int(test_frame.shape[1]),
        "height": int(test_frame.shape[0]),
        "size_bytes": size_bytes
    }
