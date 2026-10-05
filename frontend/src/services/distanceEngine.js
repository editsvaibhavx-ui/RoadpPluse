/**
 * Distance & Telemetry Engine for Road-Condition Monitoring
 * ==========================================================
 * Provides:
 * - High-precision Haversine great-circle distance
 * - GPS drift filtering (accuracy threshold, stationary jitter rejection, speed spike suppression)
 * - Track smoothing (moving average window)
 * - Chainage calculation & linear interpolation along route by timestamp
 * - Track parsers: GPX, CSV, SRT (dashcam subtitles), NMEA
 * - Embedded MP4 ISO 6709 / udta metadata reader
 * - OSRM public routing API client with Haversine fallback
 * - Export formats: GeoJSON, CSV, JSON
 */

// Earth radius in meters
const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculates Haversine distance between two coordinates in meters
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 0;
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c * 10) / 10; // 0.1m precision
}

/**
 * Calculates cumulative distances and total distance along a sequence of points
 * points: array of { lat, lng } or { lat, lon }
 */
export function calculateTrackDistance(points) {
  if (!points || points.length < 2) {
    return {
      totalMeters: 0,
      totalKm: 0,
      cumulativeMeters: points && points.length === 1 ? [0] : [],
    };
  }

  const cumulativeMeters = [0];
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const lat1 = p1.lat ?? p1.latitude;
    const lon1 = p1.lng ?? p1.lon ?? p1.longitude;
    const lat2 = p2.lat ?? p2.latitude;
    const lon2 = p2.lng ?? p2.lon ?? p2.longitude;

    const segment = haversineDistance(lat1, lon1, lat2, lon2);
    total += segment;
    cumulativeMeters.push(Math.round(total * 10) / 10);
  }

  return {
    totalMeters: Math.round(total * 10) / 10,
    totalKm: Math.round((total / 1000) * 100) / 100,
    cumulativeMeters,
  };
}

/**
 * Filter & validate a GPS fix during live tracking to avoid drift
 * Requirements:
 * - Ignore fixes with accuracy worse than 25m
 * - Ignore jumps smaller than accuracy radius or under 2m when stationary
 * - Reject impossible speed spikes (> 140 km/h or 38.89 m/s)
 * - Returns { accepted: boolean, distanceMeters: number, reason?: string }
 */
export function validateLiveFix(prevFix, currentFix, options = {}) {
  const maxAccuracyM = options.maxAccuracyM || 25.0;
  const minStationaryDistM = options.minStationaryDistM || 2.0;
  const maxSpeedKmh = options.maxSpeedKmh || 140.0;
  const maxSpeedMs = (maxSpeedKmh * 1000) / 3600;

  // 1. Check GPS accuracy radius
  if (currentFix.accuracy && currentFix.accuracy > maxAccuracyM) {
    return {
      accepted: false,
      distanceMeters: 0,
      reason: `Accuracy too low (${Math.round(currentFix.accuracy)}m > ${maxAccuracyM}m threshold)`,
    };
  }

  // If first fix, accept immediately with 0 distance
  if (!prevFix) {
    return { accepted: true, distanceMeters: 0 };
  }

  const dist = haversineDistance(prevFix.lat, prevFix.lng, currentFix.lat, currentFix.lng);

  // 2. Reject stationary jitter (movement smaller than accuracy or 2m)
  const accuracyThreshold = Math.max(minStationaryDistM, currentFix.accuracy ? currentFix.accuracy * 0.75 : minStationaryDistM);
  if (dist < accuracyThreshold) {
    return {
      accepted: false,
      distanceMeters: 0,
      reason: `Stationary jitter ignored (${dist.toFixed(1)}m < threshold ${accuracyThreshold.toFixed(1)}m)`,
    };
  }

  // 3. Reject impossible speed spike
  if (prevFix.timestamp && currentFix.timestamp) {
    const dtSeconds = Math.max(0.1, (currentFix.timestamp - prevFix.timestamp) / 1000);
    const speedMs = dist / dtSeconds;
    const speedKmh = speedMs * 3.6;

    if (speedKmh > maxSpeedKmh) {
      return {
        accepted: false,
        distanceMeters: 0,
        reason: `Speed spike rejected (${Math.round(speedKmh)} km/h exceeds limit ${maxSpeedKmh} km/h)`,
      };
    }
  }

  return { accepted: true, distanceMeters: dist };
}

/**
 * Smooth a sequence of GPS track points using a moving average window
 */
export function smoothTrackPoints(points, windowSize = 3) {
  if (!points || points.length <= windowSize) return points;

  const smoothed = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(points.length, i + half + 1);
    const window = points.slice(start, end);

    const avgLat = window.reduce((sum, p) => sum + (p.lat ?? p.latitude), 0) / window.length;
    const avgLng = window.reduce((sum, p) => sum + (p.lng ?? p.lon ?? p.longitude), 0) / window.length;

    smoothed.push({
      ...points[i],
      lat: Math.round(avgLat * 1e6) / 1e6,
      lng: Math.round(avgLng * 1e6) / 1e6,
    });
  }

  return smoothed;
}

/**
 * Interpolates chainage (distance from start in meters) and coordinates for a given video timestamp
 * Supports track points with explicit timestamps or route polyline with duration
 */
export function interpolateChainage(trackPoints, timestampSeconds, videoDurationSeconds = 10.0) {
  if (!trackPoints || trackPoints.length === 0) {
    return {
      chainageMeters: 0,
      chainageKm: '0.00',
      chainageLabel: '0 m',
      lat: null,
      lng: null,
    };
  }

  // Calculate cumulative distance for trackPoints if not already present
  const trackWithDist = [];
  let runningDist = 0;
  for (let i = 0; i < trackPoints.length; i++) {
    const pt = trackPoints[i];
    const lat = pt.lat ?? pt.latitude;
    const lng = pt.lng ?? pt.lon ?? pt.longitude;
    if (i > 0) {
      const prev = trackWithDist[i - 1];
      runningDist += haversineDistance(prev.lat, prev.lng, lat, lng);
    }
    trackWithDist.push({
      ...pt,
      lat,
      lng,
      chainage: runningDist,
      time_s: pt.time_s ?? pt.timestamp_s,
    });
  }

  const totalDistance = runningDist;

  // Case 1: Track points have explicit relative timestamps (time_s)
  const hasTime = trackWithDist.every((p) => typeof p.time_s === 'number');
  if (hasTime && trackWithDist.length > 1) {
    const minTime = trackWithDist[0].time_s;
    const maxTime = trackWithDist[trackWithDist.length - 1].time_s;

    if (timestampSeconds <= minTime) {
      const p = trackWithDist[0];
      return {
        chainageMeters: 0,
        chainageKm: '0.00',
        chainageLabel: '0 m',
        lat: p.lat,
        lng: p.lng,
      };
    }
    if (timestampSeconds >= maxTime) {
      const p = trackWithDist[trackWithDist.length - 1];
      return {
        chainageMeters: Math.round(totalDistance),
        chainageKm: (totalDistance / 1000).toFixed(2),
        chainageLabel: `${Math.round(totalDistance)} m`,
        lat: p.lat,
        lng: p.lng,
      };
    }

    // Binary / linear search for enclosing segment
    for (let i = 0; i < trackWithDist.length - 1; i++) {
      const p1 = trackWithDist[i];
      const p2 = trackWithDist[i + 1];
      if (timestampSeconds >= p1.time_s && timestampSeconds <= p2.time_s) {
        const dt = p2.time_s - p1.time_s || 1;
        const alpha = Math.max(0, Math.min(1, (timestampSeconds - p1.time_s) / dt));
        const chainage = p1.chainage + alpha * (p2.chainage - p1.chainage);
        const lat = p1.lat + alpha * (p2.lat - p1.lat);
        const lng = p1.lng + alpha * (p2.lng - p1.lng);
        return {
          chainageMeters: Math.round(chainage),
          chainageKm: (chainage / 1000).toFixed(2),
          chainageLabel: `${Math.round(chainage)} m`,
          lat: Math.round(lat * 1e6) / 1e6,
          lng: Math.round(lng * 1e6) / 1e6,
        };
      }
    }
  }

  // Case 2: Proportional progression along track based on video duration
  const ratio = Math.max(0, Math.min(1, timestampSeconds / Math.max(0.1, videoDurationSeconds)));
  const targetChainage = totalDistance * ratio;

  // Find enclosing point in track
  for (let i = 0; i < trackWithDist.length - 1; i++) {
    const p1 = trackWithDist[i];
    const p2 = trackWithDist[i + 1];
    if (targetChainage >= p1.chainage && targetChainage <= p2.chainage) {
      const segDist = p2.chainage - p1.chainage || 1;
      const alpha = (targetChainage - p1.chainage) / segDist;
      const lat = p1.lat + alpha * (p2.lat - p1.lat);
      const lng = p1.lng + alpha * (p2.lng - p1.lng);
      return {
        chainageMeters: Math.round(targetChainage),
        chainageKm: (targetChainage / 1000).toFixed(2),
        chainageLabel: `${Math.round(targetChainage)} m`,
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
      };
    }
  }

  // Fallback to last point
  const last = trackWithDist[trackWithDist.length - 1];
  return {
    chainageMeters: Math.round(totalDistance),
    chainageKm: (totalDistance / 1000).toFixed(2),
    chainageLabel: `${Math.round(totalDistance)} m`,
    lat: last?.lat,
    lng: last?.lng,
  };
}

/**
 * Parser for GPX files (XML string)
 * Extracts <trkpt lat="..." lon="..."> with optional <time>
 */
export function parseGPX(xmlText) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const trkpts = xmlDoc.getElementsByTagName('trkpt');
    const points = [];

    let startTime = null;

    for (let i = 0; i < trkpts.length; i++) {
      const node = trkpts[i];
      const lat = parseFloat(node.getAttribute('lat'));
      const lon = parseFloat(node.getAttribute('lon'));
      const timeNode = node.getElementsByTagName('time')[0];

      let time_s = i;
      let timestamp = null;

      if (timeNode && timeNode.textContent) {
        timestamp = new Date(timeNode.textContent).getTime();
        if (startTime === null) startTime = timestamp;
        time_s = (timestamp - startTime) / 1000;
      }

      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({ lat, lng: lon, time_s, timestamp });
      }
    }

    if (points.length === 0) {
      // Try <wpt>
      const wpts = xmlDoc.getElementsByTagName('wpt');
      for (let i = 0; i < wpts.length; i++) {
        const node = wpts[i];
        const lat = parseFloat(node.getAttribute('lat'));
        const lon = parseFloat(node.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) {
          points.push({ lat, lng: lon, time_s: i });
        }
      }
    }

    return {
      success: points.length > 0,
      points,
      count: points.length,
      source: 'Sidecar Track (.gpx)',
    };
  } catch (err) {
    return { success: false, error: err.message, points: [] };
  }
}

/**
 * Parser for CSV telemetry files
 * Accepts columns: latitude/lat, longitude/lon/lng, timestamp/time/time_s
 */
export function parseCSV(csvText) {
  try {
    const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new Error('CSV has fewer than 2 rows');

    const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/['"]/g, ''));
    const latIdx = headers.findIndex((h) => h === 'lat' || h === 'latitude');
    const lngIdx = headers.findIndex((h) => h === 'lng' || h === 'lon' || h === 'longitude');
    const timeIdx = headers.findIndex((h) => h === 'timestamp' || h === 'time' || h === 'time_s' || h === 'sec');

    if (latIdx === -1 || lngIdx === -1) {
      throw new Error('CSV must contain latitude and longitude columns');
    }

    const points = [];
    let startTimestamp = null;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/['"]/g, ''));
      const lat = parseFloat(cols[latIdx]);
      const lng = parseFloat(cols[lngIdx]);

      let time_s = i - 1;
      if (timeIdx !== -1 && cols[timeIdx]) {
        const val = cols[timeIdx];
        if (!isNaN(Number(val))) {
          time_s = parseFloat(val);
        } else {
          const parsed = new Date(val).getTime();
          if (!isNaN(parsed)) {
            if (startTimestamp === null) startTimestamp = parsed;
            time_s = (parsed - startTimestamp) / 1000;
          }
        }
      }

      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({ lat, lng, time_s });
      }
    }

    return {
      success: points.length > 0,
      points,
      count: points.length,
      source: 'Sidecar Track (.csv)',
    };
  } catch (err) {
    return { success: false, error: err.message, points: [] };
  }
}

/**
 * Parser for SRT dashcam subtitles containing embedded GPS coordinates
 * Matches lines like:
 * [latitude: 18.5204] [longitude: 73.8567]
 * 18.520432, 73.856712
 * N: 18.5204 E: 73.8567
 */
export function parseSRT(srtText) {
  try {
    const blocks = srtText.split(/\r?\n\r?\n/);
    const points = [];

    const timeRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;
    const coordRegex = /([+-]?\d{1,3}\.\d{4,9})[,\s/]+([+-]?\d{1,3}\.\d{4,9})/;
    const kvRegex = /(?:lat|latitude)[\s:=]+([+-]?\d{1,3}\.\d{4,9})[\s,;|]+(?:lon|lng|longitude)[\s:=]+([+-]?\d{1,3}\.\d{4,9})/i;

    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map((l) => l.trim());
      let time_s = null;
      let lat = null;
      let lng = null;

      for (const line of lines) {
        const timeMatch = line.match(timeRegex);
        if (timeMatch) {
          const h = parseInt(timeMatch[1], 10);
          const m = parseInt(timeMatch[2], 10);
          const s = parseInt(timeMatch[3], 10);
          const ms = parseInt(timeMatch[4], 10);
          time_s = h * 3600 + m * 60 + s + ms / 1000;
        }

        const kvMatch = line.match(kvRegex);
        if (kvMatch) {
          lat = parseFloat(kvMatch[1]);
          lng = parseFloat(kvMatch[2]);
        } else {
          const cMatch = line.match(coordRegex);
          if (cMatch) {
            lat = parseFloat(cMatch[1]);
            lng = parseFloat(cMatch[2]);
          }
        }
      }

      if (lat !== null && lng !== null) {
        points.push({
          lat,
          lng,
          time_s: time_s !== null ? time_s : points.length,
        });
      }
    }

    return {
      success: points.length > 0,
      points,
      count: points.length,
      source: 'Sidecar Track (.srt Dashcam)',
    };
  } catch (err) {
    return { success: false, error: err.message, points: [] };
  }
}

/**
 * Parser for NMEA 0183 sentences ($GPRMC and $GPGGA)
 */
export function parseNMEA(nmeaText) {
  try {
    const lines = nmeaText.split(/\r?\n/);
    const points = [];

    // Helper for NMEA ddmm.mmmm to decimal degrees
    const nmeaToDec = (nmeaVal, dir) => {
      const val = parseFloat(nmeaVal);
      if (isNaN(val)) return null;
      const deg = Math.floor(val / 100);
      const min = val - deg * 100;
      let dec = deg + min / 60;
      if (dir === 'S' || dir === 'W') dec = -dec;
      return dec;
    };

    let time_s = 0;
    for (const line of lines) {
      if (line.startsWith('$GPRMC') || line.startsWith('$GNRMC')) {
        const parts = line.split(',');
        if (parts[2] === 'A') {
          // Valid fix
          const lat = nmeaToDec(parts[3], parts[4]);
          const lng = nmeaToDec(parts[5], parts[6]);
          if (lat !== null && lng !== null) {
            points.push({ lat, lng, time_s: time_s++ });
          }
        }
      } else if (line.startsWith('$GPGGA') || line.startsWith('$GNGGA')) {
        const parts = line.split(',');
        const fixQuality = parseInt(parts[6], 10);
        if (fixQuality > 0) {
          const lat = nmeaToDec(parts[2], parts[3]);
          const lng = nmeaToDec(parts[4], parts[5]);
          if (lat !== null && lng !== null) {
            points.push({ lat, lng, time_s: time_s++ });
          }
        }
      }
    }

    return {
      success: points.length > 0,
      points,
      count: points.length,
      source: 'Sidecar Track (.nmea)',
    };
  } catch (err) {
    return { success: false, error: err.message, points: [] };
  }
}

/**
 * Scans video file binary header for embedded ISO 6709 or udta location metadata
 * Matches patterns like +18.5204+073.8567/ or +18.5204-073.8567
 */
export async function extractEmbeddedGPSFromVideo(videoFile) {
  return new Promise((resolve) => {
    if (!videoFile || typeof FileReader === 'undefined') {
      resolve({ found: false });
      return;
    }

    // Read the first 512KB and last 512KB where MP4 moov/udta atom typically lives
    const reader = new FileReader();
    const slice = videoFile.slice(0, Math.min(videoFile.size, 512 * 1024));

    reader.onload = () => {
      try {
        const buffer = new Uint8Array(reader.result);
        const decoder = new TextDecoder('latin1');
        const text = decoder.decode(buffer);

        // ISO 6709 regex: e.g. +18.5204+073.8567 or +18.5204-073.8567/
        const isoMatch = text.match(/([+-]\d{2}\.\d{3,7})([+-]\d{3}\.\d{3,7})/);
        if (isoMatch) {
          const lat = parseFloat(isoMatch[1]);
          const lng = parseFloat(isoMatch[2]);
          if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            resolve({
              found: true,
              lat,
              lng,
              source: 'Embedded MP4 Metadata (ISO 6709 / udta atom)',
            });
            return;
          }
        }

        // Check for QuickTime '©xyz' tag
        const xyzIdx = text.indexOf('©xyz');
        if (xyzIdx !== -1) {
          const sub = text.substring(xyzIdx + 4, xyzIdx + 32);
          const m = sub.match(/([+-]\d{2,}\.\d+)([+-]\d{3,}\.\d+)/);
          if (m) {
            resolve({
              found: true,
              lat: parseFloat(m[1]),
              lng: parseFloat(m[2]),
              source: 'Embedded QuickTime udta (©xyz)',
            });
            return;
          }
        }

        resolve({ found: false });
      } catch {
        resolve({ found: false });
      }
    };

    reader.onerror = () => resolve({ found: false });
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Fetch road route distance and polyline from public OSRM Routing API
 * Falls back to straight-line Haversine if service unavailable
 */
export async function fetchOSRMRoute(startLat, startLng, endLat, endLng) {
  const straightLineM = haversineDistance(startLat, startLng, endLat, endLng);

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`OSRM responded with status ${res.status}`);
    const data = await res.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const roadDistanceM = Math.round(route.distance);
      // coordinates from OSRM are [lng, lat]
      const coordinates = route.geometry.coordinates.map((c) => ({
        lat: c[1],
        lng: c[0],
      }));

      return {
        success: true,
        source: 'Map Routing (OSRM Public Road Network)',
        roadDistanceM,
        roadDistanceKm: (roadDistanceM / 1000).toFixed(2),
        straightLineM,
        straightLineKm: (straightLineM / 1000).toFixed(2),
        durationS: Math.round(route.duration),
        coordinates,
      };
    }
    throw new Error('No route returned by OSRM');
  } catch (err) {
    // Graceful fallback to straight-line Haversine
    return {
      success: true,
      source: 'Map Fallback (Haversine Straight-Line Distance)',
      roadDistanceM: straightLineM,
      roadDistanceKm: (straightLineM / 1000).toFixed(2),
      straightLineM,
      straightLineKm: (straightLineM / 1000).toFixed(2),
      durationS: 0,
      coordinates: [
        { lat: startLat, lng: startLng },
        { lat: endLat, lng: endLng },
      ],
      notice: 'OSRM routing API unavailable; using direct great-circle geometry.',
    };
  }
}

/**
 * Export helpers: JSON, CSV, GeoJSON
 */
export function exportToJSON(data, filename = 'road_intelligence_report.json') {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  downloadBlob(blob, filename);
}

export function exportToCSV(defects, filename = 'road_defects_chainage.csv') {
  const headers = ['Defect_ID', 'Type', 'Confidence', 'Chainage_m', 'Chainage_km', 'Latitude', 'Longitude', 'Timestamp_s', 'Severity'];
  const rows = (defects || []).map((d, idx) => [
    d.id || `DEF-${idx + 1}`,
    `"${d.type || d.hazard_type || 'Pothole'}"`,
    typeof d.confidence === 'number' ? (d.confidence > 1 ? (d.confidence / 100).toFixed(2) : d.confidence.toFixed(2)) : '0.90',
    d.chainageMeters ?? d.chainage ?? 0,
    d.chainageKm ?? ((d.chainageMeters || 0) / 1000).toFixed(3),
    d.lat ?? d.latitude ?? '',
    d.lng ?? d.longitude ?? '',
    d.timestamp_s ?? d.timestamp ?? '',
    `"${d.severity || 'HIGH'}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

export function exportToGeoJSON(routeCoordinates, defects, filename = 'road_intelligence.geojson') {
  const features = [];

  // Route Polyline Feature
  if (routeCoordinates && routeCoordinates.length > 1) {
    features.push({
      type: 'Feature',
      properties: {
        name: 'Monitored Public Transit Route',
        type: 'route_polyline',
        totalPoints: routeCoordinates.length,
      },
      geometry: {
        type: 'LineString',
        coordinates: routeCoordinates.map((p) => [p.lng ?? p.lon, p.lat]),
      },
    });
  }

  // Defect Point Features
  (defects || []).forEach((d, idx) => {
    const lat = d.lat ?? d.latitude;
    const lng = d.lng ?? d.longitude;
    if (lat && lng) {
      features.push({
        type: 'Feature',
        properties: {
          id: d.id || `DEF-${idx + 1}`,
          hazard_type: d.type || d.hazard_type,
          confidence: d.confidence,
          chainage_meters: d.chainageMeters ?? d.chainage,
          severity: d.severity,
          timestamp_s: d.timestamp_s ?? d.timestamp,
        },
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      });
    }
  });

  const geoJson = {
    type: 'FeatureCollection',
    features,
  };

  const blob = new Blob([JSON.stringify(geoJson, null, 2)], { type: 'application/geo+json' });
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
