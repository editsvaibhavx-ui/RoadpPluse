"""
Road Damage Physical Dimension Estimation Service
-------------------------------------------------
Provides approximate metric estimations (width, length, surface area)
from camera frame bounding box coordinates.

PROTOTYPE DISCLAIMER:
This is an APPROXIMATE PROTOTYPE ESTIMATE based on typical dash-mount
smartphone camera perspective projection and configurable ground-plane scale factors.
It does NOT claim centimeter-level survey accuracy.
"""

from typing import Dict, Tuple
from app.config import DEFAULT_PIXELS_TO_METERS_WIDTH, DEFAULT_PIXELS_TO_METERS_LENGTH

def estimate_damage_dimensions(
    bbox: Tuple[float, float, float, float],
    frame_width: int = 1280,
    frame_height: int = 720,
    scale_w: float = DEFAULT_PIXELS_TO_METERS_WIDTH,
    scale_l: float = DEFAULT_PIXELS_TO_METERS_LENGTH
) -> Dict[str, float]:
    """
    Estimates approximate width (m), length (m), and surface area (m^2) of a detected road hazard.
    
    bbox: (x1, y1, x2, y2) in pixel coordinates or normalized
    frame_width, frame_height: resolution of the video frame
    """
    x1, y1, x2, y2 = bbox
    
    # If coordinates are normalized (0.0 to 1.0), scale to frame dimensions
    if 0.0 <= x1 <= 1.0 and 0.0 <= x2 <= 1.0:
        pixel_w = abs(x2 - x1) * frame_width
        pixel_h = abs(y2 - y1) * frame_height
        center_y = ((y1 + y2) / 2.0) * frame_height
    else:
        pixel_w = abs(x2 - x1)
        pixel_h = abs(y2 - y1)
        center_y = (y1 + y2) / 2.0

    # Perspective compensation factor: objects lower in the frame are closer to the bus
    # Normalize perspective: horizon is around 0.45 of frame height, bottom of frame is 1.0
    relative_y = max(0.1, min(1.0, center_y / max(frame_height, 1)))
    perspective_adj = 0.65 + (relative_y * 0.70)  # closer objects appear larger in pixels

    # Calculate metric estimates
    width_m = round((pixel_w * scale_w) / perspective_adj, 2)
    length_m = round((pixel_h * scale_l) / perspective_adj, 2)

    # Ensure realistic minimum bounds for typical road defects
    width_m = max(0.20, min(width_m, 4.50))
    length_m = max(0.20, min(length_m, 5.00))
    area_m2 = round(width_m * length_m, 2)

    return {
        "width_m": width_m,
        "length_m": length_m,
        "area_m2": area_m2,
        "is_approximate": True,
        "disclaimer": "APPROXIMATE PROTOTYPE ESTIMATE (Smartphone Simulation)"
    }
