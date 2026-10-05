/**
 * ST-DBSCAN: Spatio-Temporal Density-Based Spatial Clustering of Applications with Noise
 * ======================================================================================
 * Pure, standalone module for spatio-temporal deduplication of road hazard detections.
 * 
 * Algorithm Characteristics:
 * - Spatial distance: Haversine great-circle distance in METERS (not Euclidean on degrees).
 * - Temporal distance: Absolute time delta (|t1 - t2|) in SECONDS.
 * - Same-class constraint: Clusters only detections of the identical hazard class (e.g. pothole with pothole).
 * - Spatial Grid Indexing: O(n log n) average performance for large detection collections (10k+).
 * - Noise Handling: Noise points (singletons) are preserved as valid incidents with detection_count = 1,
 *   preventing silent data drops while transparently indicating single-observation status.
 */

// Earth radius in meters
const EARTH_RADIUS_M = 6371000.0;

/**
 * Calculates high-precision Haversine great-circle distance between two points in meters
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 0;
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const toRad = (deg) => (deg * Math.PI) / 180.0;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return Math.round(EARTH_RADIUS_M * c * 100) / 100; // 0.01m precision
}

/**
 * Spatial Grid Hash Key for fast localized neighbor queries
 * Grid cell size in degrees approximately corresponding to ~eps1 meters
 */
function getGridCellKey(lat, lng, cellSizeDeg) {
  const cellX = Math.floor(lat / cellSizeDeg);
  const cellY = Math.floor(lng / cellSizeDeg);
  return `${cellX}:${cellY}`;
}

/**
 * Executes ST-DBSCAN Spatio-Temporal Clustering
 * 
 * @param {Array<Object>} detections - Array of raw detection objects
 * @param {Object} options
 * @param {number} [options.eps1=5.0] - Spatial threshold in meters (Haversine)
 * @param {number} [options.eps2=10.0] - Temporal threshold in seconds
 * @param {number} [options.minPts=2] - Minimum detections to form a dense core
 * @returns {Object} { clusters: Array<Array<Object>>, noise: Array<Object>, totalDetections: number }
 */
export function runSTDBSCAN(detections = [], options = {}) {
  const eps1 = options.eps1 !== undefined ? options.eps1 : 5.0; // meters
  const eps2 = options.eps2 !== undefined ? options.eps2 : 10.0; // seconds
  const minPts = options.minPts !== undefined ? options.minPts : 2;

  if (!detections || !Array.isArray(detections) || detections.length === 0) {
    return {
      clusters: [],
      noise: [],
      totalDetections: 0,
      clustersCount: 0,
      noiseCount: 0,
    };
  }

  const n = detections.length;

  // Standardize detections to ensure valid latitude, longitude, and timestamp
  const points = detections.map((d, index) => {
    const lat = typeof d.latitude === 'number' ? d.latitude : typeof d.lat === 'number' ? d.lat : 0.0;
    const lng = typeof d.longitude === 'number' ? d.longitude : typeof d.lng === 'number' ? d.lng : 0.0;
    const timeS =
      typeof d.timestamp_seconds === 'number'
        ? d.timestamp_seconds
        : typeof d.time_s === 'number'
        ? d.time_s
        : typeof d.timestamp === 'number'
        ? d.timestamp
        : index;

    const hazardClass = (d.hazard_type || d.class || d.type || 'pothole').toLowerCase().trim();

    return {
      ...d,
      _idx: index,
      _lat: lat,
      _lng: lng,
      _timeS: timeS,
      _class: hazardClass,
      _visited: false,
      _assignedCluster: null,
      _isNoise: false,
    };
  });

  // Build spatial grid index for fast localized neighborhood lookup
  // ~5m is approximately 0.00005 degrees
  const cellSizeDeg = Math.max(0.00005, (eps1 / 111320.0) * 1.5);
  const grid = new Map();

  for (let i = 0; i < n; i++) {
    const p = points[i];
    const key = getGridCellKey(p._lat, p._lng, cellSizeDeg);
    if (!grid.has(key)) {
      grid.set(key, []);
    }
    grid.get(key).push(i);
  }

  // Neighbor query using grid + candidate filter
  const getNeighbors = (pointIdx) => {
    const target = points[pointIdx];
    const neighbors = [];

    const cellX = Math.floor(target._lat / cellSizeDeg);
    const cellY = Math.floor(target._lng / cellSizeDeg);

    // Check 3x3 surrounding cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighborKey = `${cellX + dx}:${cellY + dy}`;
        const candidates = grid.get(neighborKey);
        if (!candidates) continue;

        for (const candidateIdx of candidates) {
          const cand = points[candidateIdx];

          // 1. Same-class separation constraint
          if (cand._class !== target._class) continue;

          // 2. Temporal distance threshold (|t1 - t2| <= eps2)
          const dt = Math.abs(cand._timeS - target._timeS);
          if (dt > eps2) continue;

          // 3. Spatial Haversine distance threshold (<= eps1 meters)
          const distM = haversineDistanceMeters(target._lat, target._lng, cand._lat, cand._lng);
          if (distM <= eps1) {
            neighbors.push(candidateIdx);
          }
        }
      }
    }

    return neighbors;
  };

  const clusters = [];
  const noise = [];

  // Density-Based Clustering
  for (let i = 0; i < n; i++) {
    const point = points[i];
    if (point._visited) continue;

    point._visited = true;
    const neighbors = getNeighbors(i);

    if (neighbors.length < minPts) {
      point._isNoise = true;
    } else {
      // Create new cluster
      const currentCluster = [point];
      point._assignedCluster = clusters.length;

      const queue = [...neighbors];

      let qi = 0;
      while (qi < queue.length) {
        const neighborIdx = queue[qi++];
        const neighborPoint = points[neighborIdx];

        if (!neighborPoint._visited) {
          neighborPoint._visited = true;
          const secondNeighbors = getNeighbors(neighborIdx);
          if (secondNeighbors.length >= minPts) {
            for (const sn of secondNeighbors) {
              if (!queue.includes(sn)) {
                queue.push(sn);
              }
            }
          }
        }

        if (neighborPoint._assignedCluster === null) {
          neighborPoint._assignedCluster = clusters.length;
          neighborPoint._isNoise = false;
          currentCluster.push(neighborPoint);
        }
      }

      clusters.push(currentCluster);
    }
  }

  // Collect noise points
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (p._isNoise && p._assignedCluster === null) {
      noise.push(p);
    }
  }

  return {
    clusters,
    noise,
    totalDetections: n,
    clustersCount: clusters.length,
    noiseCount: noise.length,
  };
}

/**
 * Calculates severity score and label based on damage dimensions and confidence
 */
export function calculateIncidentSeverity(avgAreaM2, maxConfidence, detectionCount, hazardType) {
  let score = 0;
  const reasons = [];

  // 1. Confidence points
  if (maxConfidence >= 0.90) {
    score += 2;
    reasons.push('High AI confidence (\u2265 90%)');
  } else if (maxConfidence >= 0.80) {
    score += 1;
    reasons.push('Moderate AI confidence (80-89%)');
  }

  // 2. Area points
  if (avgAreaM2 >= 1.20) {
    score += 3;
    reasons.push(`Large defect surface area (${avgAreaM2.toFixed(2)} m\u00B2)`);
  } else if (avgAreaM2 >= 0.50) {
    score += 2;
    reasons.push(`Medium defect area (${avgAreaM2.toFixed(2)} m\u00B2)`);
  } else {
    score += 1;
    reasons.push(`Surface defect area (${avgAreaM2.toFixed(2)} m\u00B2)`);
  }

  // 3. Cluster count points (multi-frame persistent observation)
  if (detectionCount >= 4) {
    score += 2;
    reasons.push(`Persistent hazard confirmed across ${detectionCount} video frames`);
  } else if (detectionCount >= 2) {
    score += 1;
    reasons.push(`Corroborated across ${detectionCount} consecutive frames`);
  }

  // 4. Hazard class factor
  if (hazardType.includes('pothole')) {
    score += 1;
    reasons.push('Direct wheel impact pothole depression');
  }

  let severity = 'LOW';
  if (score >= 6) severity = 'CRITICAL';
  else if (score >= 4) severity = 'HIGH';
  else if (score >= 2) severity = 'MEDIUM';

  return { score, severity, reasons };
}

/**
 * Synthesizes clusters and noise detections into actionable Municipal Incident records
 * 
 * @param {Array<Array<Object>>} clusters - Dense clusters of detections
 * @param {Array<Object>} noise - Single isolated detections (singletons)
 * @param {Object} [meta={}] - Route / bus metadata
 * @returns {Array<Object>} Array of standardized Incident objects
 */
export function synthesizeIncidents(clusters = [], noise = [], meta = {}) {
  const incidents = [];
  let seq = meta.startingSequence || 101;

  // 1. Synthesize multi-observation clusters
  for (const cluster of clusters) {
    const count = cluster.length;
    const representative = cluster.reduce((best, curr) =>
      (curr.confidence || 0) > (best.confidence || 0) ? curr : best, cluster[0]);

    // Centroid coordinates
    const centroidLat = cluster.reduce((sum, d) => sum + d._lat, 0) / count;
    const centroidLng = cluster.reduce((sum, d) => sum + d._lng, 0) / count;

    // Time boundaries
    const times = cluster.map((d) => d._timeS).sort((a, b) => a - b);
    const firstSeenS = times[0];
    const lastSeenS = times[times.length - 1];
    const durationS = Math.round((lastSeenS - firstSeenS) * 10) / 10;

    // Dimensions
    const widths = cluster.map((d) => d.estimated_width_m || d.width_m || 0.8);
    const lengths = cluster.map((d) => d.estimated_length_m || d.length_m || 0.6);
    const areas = cluster.map((d) => d.estimated_area_m2 || d.area_m2 || d.area || 0.48);

    const maxWidth = Math.max(...widths);
    const maxLength = Math.max(...lengths);
    const maxArea = Math.max(...areas);
    const avgArea = areas.reduce((s, a) => s + a, 0) / count;

    const maxConf = Math.max(...cluster.map((d) => d.confidence || 0.9));
    const hazardClass = representative._class || 'pothole';

    // Chainage interpolation (from representative or first)
    const chainageMeters = representative.chainageMeters ?? representative.chainage ?? 0;
    const chainageLabel = representative.chainageLabel || `${Math.round(chainageMeters)} m`;

    const sev = calculateIncidentSeverity(avgArea, maxConf, count, hazardClass);

    incidents.push({
      id: `INC-${seq++}`,
      incident_code: `INC-${seq - 1}`,
      hazard_type: hazardClass === 'road crack' ? 'road crack' : hazardClass,
      class: hazardClass,
      latitude: Math.round(centroidLat * 1e6) / 1e6,
      longitude: Math.round(centroidLng * 1e6) / 1e6,
      centroid_lat: Math.round(centroidLat * 1e6) / 1e6,
      centroid_lng: Math.round(centroidLng * 1e6) / 1e6,
      confidence: Math.round(maxConf * 100) / 100,
      max_confidence: maxConf,
      detection_count: count,
      is_singleton: false,
      first_seen_s: firstSeenS,
      last_seen_s: lastSeenS,
      duration_s: durationS,
      first_seen_iso: new Date(Date.now() - (100 - firstSeenS) * 1000).toISOString(),
      last_seen_iso: new Date(Date.now() - (100 - lastSeenS) * 1000).toISOString(),
      estimated_width_m: Math.round(maxWidth * 100) / 100,
      estimated_length_m: Math.round(maxLength * 100) / 100,
      estimated_area_m2: Math.round(maxArea * 100) / 100,
      avg_area_m2: Math.round(avgArea * 100) / 100,
      chainageMeters: Math.round(chainageMeters),
      chainageLabel,
      severity: sev.severity,
      severity_score: sev.score,
      severity_reasons: sev.reasons,
      image_url: representative.image_path || representative.image_url || '',
      bus_id: representative.bus_id || meta.busId || 'BUS-001',
      route_id: representative.route_id || meta.routeId || 1,
      deduplication_note: `${count} video frames merged into 1 Incident (ST-DBSCAN \u2264 5m / 10s)`,
      detections: cluster.map((c) => ({
        id: c.id,
        frame_number: c.frame_number,
        timestamp_seconds: c._timeS,
        confidence: c.confidence,
        bbox: c.bbox,
        latitude: c._lat,
        longitude: c._lng,
      })),
    });
  }

  // 2. Synthesize noise points (singletons) - never drop them silently!
  for (const single of noise) {
    const hazardClass = single._class || 'pothole';
    const area = single.estimated_area_m2 || single.area_m2 || single.area || 0.45;
    const conf = single.confidence || 0.85;
    const width = single.estimated_width_m || single.width_m || 0.7;
    const length = single.estimated_length_m || single.length_m || 0.5;

    const chainageMeters = single.chainageMeters ?? single.chainage ?? 0;
    const chainageLabel = single.chainageLabel || `${Math.round(chainageMeters)} m`;

    const sev = calculateIncidentSeverity(area, conf, 1, hazardClass);

    incidents.push({
      id: `INC-${seq++}`,
      incident_code: `INC-${seq - 1}`,
      hazard_type: hazardClass === 'road crack' ? 'road crack' : hazardClass,
      class: hazardClass,
      latitude: Math.round(single._lat * 1e6) / 1e6,
      longitude: Math.round(single._lng * 1e6) / 1e6,
      centroid_lat: Math.round(single._lat * 1e6) / 1e6,
      centroid_lng: Math.round(single._lng * 1e6) / 1e6,
      confidence: Math.round(conf * 100) / 100,
      max_confidence: conf,
      detection_count: 1,
      is_singleton: true,
      first_seen_s: single._timeS,
      last_seen_s: single._timeS,
      duration_s: 0.0,
      first_seen_iso: new Date().toISOString(),
      last_seen_iso: new Date().toISOString(),
      estimated_width_m: Math.round(width * 100) / 100,
      estimated_length_m: Math.round(length * 100) / 100,
      estimated_area_m2: Math.round(area * 100) / 100,
      avg_area_m2: Math.round(area * 100) / 100,
      chainageMeters: Math.round(chainageMeters),
      chainageLabel,
      severity: sev.severity,
      severity_score: sev.score,
      severity_reasons: ['Single frame observation (singleton noise point)', ...sev.reasons],
      image_url: single.image_path || single.image_url || '',
      bus_id: single.bus_id || meta.busId || 'BUS-001',
      route_id: single.route_id || meta.routeId || 1,
      deduplication_note: 'Single observation (low-density noise cluster preserved)',
      detections: [
        {
          id: single.id,
          frame_number: single.frame_number,
          timestamp_seconds: single._timeS,
          confidence: single.confidence,
          bbox: single.bbox,
          latitude: single._lat,
          longitude: single._lng,
        },
      ],
    });
  }

  return incidents;
}
