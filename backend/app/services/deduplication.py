"""
ST-DBSCAN Spatio-Temporal Clustering Service
============================================
Implements ST-DBSCAN (Spatio-Temporal Density-Based Spatial Clustering of Applications with Noise)
for public transit road monitoring data:
- Spatial radius: eps1 in meters (Haversine formula)
- Temporal window: eps2 in seconds
- Minimum points: minPts for core cluster
- Class constraint: clusters only detections of the SAME class
- Noise handling: preserves singletons as low-confidence incidents (no silent data loss)
- Incident synthesis: computes centroid lat/lon, max confidence, mean/max dimensions,
  first-seen and last-seen timestamps, chainage, representative thumbnail, and severity score.
"""

import math
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple, Optional

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters between two WGS-84 coordinates"""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(max(0.0, a)), math.sqrt(max(0.0, 1.0 - a)))
    return R * c

def run_st_dbscan(
    detections: List[Dict[str, Any]],
    eps1_meters: float = 5.0,
    eps2_seconds: float = 10.0,
    min_pts: int = 2
) -> Dict[str, Any]:
    """
    Executes ST-DBSCAN on a list of detection dictionaries or DB objects.
    Each detection dict must have:
      lat, lon, class (or class_name/hazard_type), video_offset_s (or timestamp_seconds)
    Returns:
      {
        "clusters": [[det, ...], ...],
        "noise": [det, ...],
        "clusters_count": int,
        "noise_count": int
      }
    """
    if not detections:
        return {"clusters": [], "noise": [], "clusters_count": 0, "noise_count": 0}

    n = len(detections)
    visited = [False] * n
    cluster_labels = [-1] * n  # -1 = unassigned / noise
    current_cluster_id = 0

    # Group detections by class first (ST-DBSCAN constraint: cluster only same class)
    class_groups: Dict[str, List[int]] = {}
    for idx, d in enumerate(detections):
        cls = (d.get("class") or d.get("class_name") or d.get("hazard_type") or "pothole").lower().strip()
        class_groups.setdefault(cls, []).append(idx)

    for cls_name, indices in class_groups.items():
        for i in indices:
            if visited[i]:
                continue
            visited[i] = True

            d_i = detections[i]
            lat_i = float(d_i.get("lat") or d_i.get("latitude") or 0.0)
            lon_i = float(d_i.get("lon") or d_i.get("longitude") or 0.0)
            t_i = float(d_i.get("video_offset_s") or d_i.get("timestamp_seconds") or 0.0)

            # Find spatio-temporal neighbors within same class
            neighbors = []
            for j in indices:
                d_j = detections[j]
                lat_j = float(d_j.get("lat") or d_j.get("latitude") or 0.0)
                lon_j = float(d_j.get("lon") or d_j.get("longitude") or 0.0)
                t_j = float(d_j.get("video_offset_s") or d_j.get("timestamp_seconds") or 0.0)

                if abs(t_i - t_j) <= eps2_seconds:
                    dist = haversine_distance_meters(lat_i, lon_i, lat_j, lon_j)
                    if dist <= eps1_meters:
                        neighbors.append(j)

            if len(neighbors) < min_pts:
                # Mark as noise candidate (may be claimed by another core point later)
                cluster_labels[i] = -1
            else:
                # Core point: start new cluster
                current_cluster_id += 1
                cluster_labels[i] = current_cluster_id

                queue = list(neighbors)
                while queue:
                    q_idx = queue.pop(0)
                    if not visited[q_idx]:
                        visited[q_idx] = True

                        d_q = detections[q_idx]
                        lat_q = float(d_q.get("lat") or d_q.get("latitude") or 0.0)
                        lon_q = float(d_q.get("lon") or d_q.get("longitude") or 0.0)
                        t_q = float(d_q.get("video_offset_s") or d_q.get("timestamp_seconds") or 0.0)

                        q_neighbors = []
                        for k in indices:
                            d_k = detections[k]
                            lat_k = float(d_k.get("lat") or d_k.get("latitude") or 0.0)
                            lon_k = float(d_k.get("lon") or d_k.get("longitude") or 0.0)
                            t_k = float(d_k.get("video_offset_s") or d_k.get("timestamp_seconds") or 0.0)

                            if abs(t_q - t_k) <= eps2_seconds:
                                if haversine_distance_meters(lat_q, lon_q, lat_k, lon_k) <= eps1_meters:
                                    q_neighbors.append(k)

                        if len(q_neighbors) >= min_pts:
                            for qn in q_neighbors:
                                if qn not in queue:
                                    queue.append(qn)

                    if cluster_labels[q_idx] == -1 or cluster_labels[q_idx] == 0:
                        cluster_labels[q_idx] = current_cluster_id

    # Gather clusters and noise
    clusters_map: Dict[int, List[Dict[str, Any]]] = {}
    noise_list: List[Dict[str, Any]] = []

    for idx, c_id in enumerate(cluster_labels):
        if c_id > 0:
            clusters_map.setdefault(c_id, []).append(detections[idx])
        else:
            noise_list.append(detections[idx])

    clusters = list(clusters_map.values())
    return {
        "clusters": clusters,
        "noise": noise_list,
        "clusters_count": len(clusters),
        "noise_count": len(noise_list)
    }

def synthesize_incident_from_cluster(
    cluster_dets: List[Dict[str, Any]],
    session_id: str,
    is_noise: bool = False
) -> Dict[str, Any]:
    """
    Transforms a cluster of detections (or a singleton noise detection) into an incident dict ready for DB insertion.
    """
    count = len(cluster_dets)
    best_det = max(cluster_dets, key=lambda d: float(d.get("confidence") or 0.0))
    cls = best_det.get("class") or best_det.get("class_name") or best_det.get("hazard_type") or "pothole"

    avg_lat = sum(float(d.get("lat") or d.get("latitude") or 0.0) for d in cluster_dets) / count
    avg_lon = sum(float(d.get("lon") or d.get("longitude") or 0.0) for d in cluster_dets) / count
    avg_w = sum(float(d.get("width_cm") or 0.0) for d in cluster_dets) / count
    avg_l = sum(float(d.get("length_cm") or 0.0) for d in cluster_dets) / count
    max_conf = float(best_det.get("confidence") or 0.0)
    avg_chainage = sum(float(d.get("chainage_m") or 0.0) for d in cluster_dets) / count

    # Determine first seen and last seen
    offsets = [float(d.get("video_offset_s") or d.get("timestamp_seconds") or 0.0) for d in cluster_dets]
    min_offset = min(offsets)
    max_offset = max(offsets)

    now = datetime.utcnow()
    first_seen = now - timedelta(seconds=max(0.0, 30.0 - min_offset))
    last_seen = now - timedelta(seconds=max(0.0, 30.0 - max_offset))

    # Calculate severity score: area + confidence + multi-observation reinforcement
    area_m2 = ((avg_w / 100.0) * (avg_l / 100.0))
    area_factor = min(40.0, area_m2 * 60.0)
    conf_factor = max_conf * 35.0
    count_factor = min(25.0, count * 5.0)
    severity_score = round(min(100.0, area_factor + conf_factor + count_factor), 1)

    if is_noise:
        severity = "low"
    elif severity_score >= 70.0 or "pothole" in cls.lower() and area_m2 > 0.30:
        severity = "high"
    elif severity_score >= 45.0:
        severity = "medium"
    else:
        severity = "low"

    return {
        "session_id": session_id,
        "class": cls,
        "centroid_lat": round(avg_lat, 6),
        "centroid_lon": round(avg_lon, 6),
        "max_confidence": round(max_conf, 3),
        "avg_width_cm": round(avg_w, 1),
        "avg_length_cm": round(avg_l, 1),
        "severity": severity,
        "severity_score": severity_score,
        "detection_count": count,
        "first_seen_at": first_seen,
        "last_seen_at": last_seen,
        "chainage_m": round(avg_chainage, 1),
        "thumbnail_path": best_det.get("thumbnail_path") or best_det.get("image_path") or "",
        "status": "open",
        "detection_ids": [d.get("id") for d in cluster_dets if d.get("id") is not None]
    }

def cluster_detections_st_dbscan(detections, spatial_threshold_m=5.0, temporal_threshold_s=10.0):
    res = run_st_dbscan(detections, eps1_meters=spatial_threshold_m, eps2_seconds=temporal_threshold_s)
    return res["clusters"]

def merge_cluster_into_incident(cluster, incident_code="INC-001"):
    inc = synthesize_incident_from_cluster(cluster, session_id="legacy")
    inc["incident_code"] = incident_code
    return inc

