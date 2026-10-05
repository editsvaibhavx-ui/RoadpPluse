"""
Real Computer Vision Road Defect Detection Engine
=================================================
Performs genuine road surface inspection on actual video frames:
1. If custom YOLO weights are installed and available, runs custom YOLO model.
2. Otherwise, executes OpenCV Computer Vision algorithms:
   - Road Region of Interest (ROI) extraction (lower roadway plane)
   - Grayscale conversion and Gaussian noise filtration
   - Dark asphalt depression segmentation via adaptive thresholding and morphological closing
   - Road crack detection via Canny edge detection and directional contour analysis
   - Spatial geometry filtering (aspect ratio, surface area, and relative darkness contrast)
   - Real confidence computation derived from local road contrast ratio
   - If a frame has NO road defects, it returns EXACTLY 0 detections (no fake boxes or random values).
"""

import cv2
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Tuple
from app.config import MODEL_WEIGHTS_PATH, PROCESSED_DIR

class RoadHazardDetector:
    def __init__(self):
        self.weights_path = MODEL_WEIGHTS_PATH
        self.yolo_model = None
        self.mode = "OPENCV_COMPUTER_VISION"
        self.status_message = "Active: Real OpenCV Computer Vision Road Inspection (Edge & Contour Segmentation)"
        self._initialize_model()

    def _initialize_model(self):
        """Attempts to load custom trained YOLO weights; otherwise activates OpenCV CV"""
        if self.weights_path.exists() and self.weights_path.stat().st_size > 1024:
            try:
                from ultralytics import YOLO
                self.yolo_model = YOLO(str(self.weights_path))
                self.mode = "CUSTOM_YOLO_WEIGHTS"
                self.status_message = f"Active Custom YOLO Weights ({self.weights_path.name})"
                return
            except Exception:
                pass
        self.mode = "OPENCV_COMPUTER_VISION"
        self.status_message = "Active: Real OpenCV Computer Vision Road Inspection (Edge & Contour Segmentation)"

    def get_status(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "status_message": self.status_message,
            "custom_weights_found": self.weights_path.exists() and self.weights_path.stat().st_size > 1024,
            "weights_target_path": str(self.weights_path)
        }

    def detect_in_image(
        self,
        image_path: Path,
        frame_idx: int = 0,
        timestamp_s: float = 0.0,
        lat: float = 0.0,
        lon: float = 0.0,
        chainage_m: float = 0.0
    ) -> List[Dict[str, Any]]:
        """
        Runs real computer vision detection on an image file.
        Returns a list of genuine detections. Returns [] if no defects are present.
        """
        detections: List[Dict[str, Any]] = []
        img = cv2.imread(str(image_path))
        if img is None:
            return detections

        h, w = img.shape[:2]
        if h < 50 or w < 50:
            return detections

        # If custom YOLO is active
        if self.mode == "CUSTOM_YOLO_WEIGHTS" and self.yolo_model is not None:
            try:
                results = self.yolo_model(str(image_path), conf=0.35)
                for r in results:
                    for box in r.boxes:
                        cls_id = int(box.cls[0].item())
                        cls_name = r.names.get(cls_id, "pothole")
                        conf = float(box.conf[0].item())
                        xyxy = box.xyxy[0].tolist()
                        bx1, by1, bx2, by2 = xyxy
                        bw = bx2 - bx1
                        bh = by2 - by1
                        w_cm = max(10.0, round(bw * 0.28, 1))
                        l_cm = max(10.0, round(bh * 0.35, 1))
                        
                        detections.append({
                            "class": cls_name,
                            "confidence": round(conf, 3),
                            "bbox_x": round(bx1, 1),
                            "bbox_y": round(by1, 1),
                            "bbox_w": round(bw, 1),
                            "bbox_h": round(bh, 1),
                            "width_cm": w_cm,
                            "length_cm": l_cm,
                            "depth_est": "moderate",
                            "frame_index": frame_idx,
                            "video_offset_s": timestamp_s,
                            "lat": lat,
                            "lon": lon,
                            "gps_accuracy_m": 5.0,
                            "chainage_m": chainage_m,
                        })
                return detections
            except Exception:
                pass

        # ----------------------------------------------------
        # Real OpenCV Computer Vision Pipeline
        # ----------------------------------------------------
        # 1. Road Region of Interest (ROI) - lower 55% of camera frame
        roi_y = int(h * 0.45)
        roi = img[roi_y:, :]
        roi_h, roi_w = roi.shape[:2]

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        mean_road = float(np.mean(gray))
        std_road = float(np.std(gray))

        annotated = img.copy()
        det_found = False

        # --- A. Pothole / Surface Depression Detection ---
        # Asphalt depression has dark shadowing + localized gradient drop
        thresh = cv2.adaptiveThreshold(
            blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 8
        )
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        opened = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        pothole_contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for c in pothole_contours:
            area = cv2.contourArea(c)
            # Area filter: must be significant defect, but not entire scene
            if area < 350 or area > (roi_w * roi_h * 0.20):
                continue

            bx, by, bw, bh = cv2.boundingRect(c)
            aspect_ratio = float(bw) / float(bh)
            if not (0.35 <= aspect_ratio <= 3.2):
                continue

            mask = np.zeros(gray.shape, dtype=np.uint8)
            cv2.drawContours(mask, [c], -1, 255, -1)
            mean_inside = float(cv2.mean(gray, mask=mask)[0])

            # Must be significantly darker than the road asphalt average
            if mean_inside < (mean_road - 0.25 * std_road):
                contrast_delta = max(1.0, mean_road - mean_inside)
                conf = round(min(0.96, max(0.60, 0.60 + (contrast_delta / (std_road + 1e-4)) * 0.15)), 3)

                real_x = float(bx)
                real_y = float(by + roi_y)
                real_w = float(bw)
                real_h = float(bh)

                w_cm = round(max(15.0, real_w * 0.28), 1)
                l_cm = round(max(15.0, real_h * 0.35), 1)
                depth = "deep" if (mean_road - mean_inside) > 1.2 * std_road else "moderate"

                detections.append({
                    "class": "pothole",
                    "confidence": conf,
                    "bbox_x": real_x,
                    "bbox_y": real_y,
                    "bbox_w": real_w,
                    "bbox_h": real_h,
                    "width_cm": w_cm,
                    "length_cm": l_cm,
                    "depth_est": depth,
                    "frame_index": frame_idx,
                    "video_offset_s": timestamp_s,
                    "lat": lat,
                    "lon": lon,
                    "gps_accuracy_m": 5.0,
                    "chainage_m": chainage_m,
                })
                det_found = True

                # Draw bounding box on annotated frame
                cv2.rectangle(
                    annotated,
                    (int(real_x), int(real_y)),
                    (int(real_x + real_w), int(real_y + real_h)),
                    (0, 0, 235),
                    2
                )
                label = f"POTHOLE {int(conf * 100)}%"
                cv2.rectangle(annotated, (int(real_x), int(real_y - 20)), (int(real_x + 130), int(real_y)), (0, 0, 235), -1)
                cv2.putText(annotated, label, (int(real_x + 4), int(real_y - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        # --- B. Road Crack Detection ---
        # High-frequency elongated edges in asphalt
        edges = cv2.Canny(blur, 60, 160)
        edge_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        dilated_edges = cv2.dilate(edges, edge_kernel, iterations=1)
        crack_contours, _ = cv2.findContours(dilated_edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cc in crack_contours:
            perimeter = cv2.arcLength(cc, False)
            if perimeter < 140:
                continue

            bx, by, bw, bh = cv2.boundingRect(cc)
            aspect_ratio = float(bw) / float(bh)
            # Cracks are elongated
            if aspect_ratio > 2.5 or aspect_ratio < 0.4 or perimeter > 200:
                real_x = float(bx)
                real_y = float(by + roi_y)
                real_w = float(bw)
                real_h = float(bh)

                # Avoid overlap with existing pothole detections
                is_overlap = False
                for d in detections:
                    if (abs(d["bbox_x"] - real_x) < 30 and abs(d["bbox_y"] - real_y) < 30):
                        is_overlap = True
                        break

                if not is_overlap:
                    conf = round(min(0.92, max(0.58, 0.58 + min(0.30, perimeter / 600.0))), 3)
                    w_cm = round(max(8.0, real_w * 0.25), 1)
                    l_cm = round(max(20.0, real_h * 0.32), 1)

                    detections.append({
                        "class": "road crack",
                        "confidence": conf,
                        "bbox_x": real_x,
                        "bbox_y": real_y,
                        "bbox_w": real_w,
                        "bbox_h": real_h,
                        "width_cm": w_cm,
                        "length_cm": l_cm,
                        "depth_est": "shallow",
                        "frame_index": frame_idx,
                        "video_offset_s": timestamp_s,
                        "lat": lat,
                        "lon": lon,
                        "gps_accuracy_m": 5.0,
                        "chainage_m": chainage_m,
                    })
                    det_found = True

                    # Draw crack bounding box
                    cv2.rectangle(
                        annotated,
                        (int(real_x), int(real_y)),
                        (int(real_x + real_w), int(real_y + real_h)),
                        (0, 165, 255),
                        2
                    )
                    label = f"CRACK {int(conf * 100)}%"
                    cv2.rectangle(annotated, (int(real_x), int(real_y - 20)), (int(real_x + 110), int(real_y)), (0, 165, 255), -1)
                    cv2.putText(annotated, label, (int(real_x + 4), int(real_y - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        # Save annotated image thumbnail if detections were found
        if det_found:
            annotated_filename = f"det_frame_{frame_idx}_{Path(image_path).stem}.jpg"
            annotated_path = PROCESSED_DIR / annotated_filename
            cv2.imwrite(str(annotated_path), annotated)
            thumbnail_url = f"/static/processed/{annotated_filename}"
            for d in detections:
                d["thumbnail_path"] = thumbnail_url

        return detections

detector = RoadHazardDetector()
