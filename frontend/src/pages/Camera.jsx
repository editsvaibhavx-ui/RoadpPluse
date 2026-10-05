import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera as CameraIcon,
  Play,
  Pause,
  Square,
  Video,
  MapPin,
  Bus,
  Clock,
  ShieldCheck,
  Smartphone,
  Upload,
  RefreshCw,
  Sliders,
  CheckCircle,
  Eye,
  AlertTriangle,
  Zap,
  Activity,
  Layers,
  Gauge,
  Navigation,
  Download,
  AlertCircle,
  Radio,
  Sun,
  Lock,
  GitMerge,
} from 'lucide-react';
import { videoService, sessionService } from '../services/api';
import RouteDefectsMap from '../components/RouteDefectsMap';
import { LocationPermissionPrompt } from '../components/LocationPermissionPrompt';
import {
  haversineDistance,
  validateLiveFix,
  smoothTrackPoints,
  exportToJSON,
  exportToCSV,
  exportToGeoJSON,
} from '../services/distanceEngine';
import { runSTDBSCAN, synthesizeIncidents } from '../lib/stdbscan';
import UploadComponent from './Upload';

const Camera = () => {
  // Source State: 'webcam' (rear camera) | 'simulation' | 'uploaded'
  const [activeSource, setActiveSource] = useState('webcam');
  const [cameraFacingMode, setCameraFacingMode] = useState('environment'); // 'environment' (rear) | 'user'
  const [isAiActive, setIsAiActive] = useState(true);
  const [autoReport, setAutoReport] = useState(true);
  const [webcamError, setWebcamError] = useState(null);

  // FIX 1: Browser Location Permission State
  const [locationState, setLocationState] = useState('prompt'); // 'prompt' | 'granted' | 'denied' | 'unavailable' | 'timeout'
  const [geoError, setGeoError] = useState(null);

  // Trip Lifecycle State: 'idle' | 'recording' | 'paused' | 'finished'
  const [tripState, setTripState] = useState('idle');
  const [tripStartTime, setTripStartTime] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live Telemetry
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  const [currentFix, setCurrentFix] = useState(null); // { lat, lng, accuracy, timestamp }
  const [gpsAccuracyM, setGpsAccuracyM] = useState(null);
  const [potholesCount, setPotholesCount] = useState(0);
  const [cracksCount, setCracksCount] = useState(0);
  const [tripTrack, setTripTrack] = useState([]); // Array of { lat, lng, accuracy, time_s, chainage }
  const [liveDefects, setLiveDefects] = useState([]); // Raw detections with spatio-temporal data
  const [finalizedIncidents, setFinalizedIncidents] = useState([]); // ST-DBSCAN synthesized incidents
  const [currentSessionId, setCurrentSessionId] = useState(null); // Real DB session ID

  // Simulation mode fallback for testing GPS vehicle movement while at desk
  const [simulateGpsMovement, setSimulateGpsMovement] = useState(false);

  // Screen Wake Lock
  const wakeLockRef = useRef(null);

  // Active Detection Highlights
  const [activeBoxDetections, setActiveBoxDetections] = useState([]);
  const [lastReportedTicket, setLastReportedTicket] = useState(null);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const geoWatchIdRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const inferenceIntervalRef = useRef(null);
  const simGpsIntervalRef = useRef(null);
  const lastFixRef = useRef(null);
  const distanceAccumulatorRef = useRef(0);
  const tripTrackRef = useRef([]);

  // Formatted elapsed time MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ----------------------------------------------------
  // 1. SCREEN WAKE LOCK API
  // ----------------------------------------------------
  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      } catch (err) {
        console.warn('Wake Lock request failed:', err.message);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && tripState === 'recording') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [tripState, requestWakeLock, releaseWakeLock]);

  // ----------------------------------------------------
  // 2. CAMERA INITIALIZATION (REAR FACING CAMERA)
  // ----------------------------------------------------
  const startCamera = async (facing = cameraFacingMode) => {
    setWebcamError(null);
    stopCamera();

    try {
      const constraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      webcamStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('getUserMedia error:', err);
      let msg = 'Unable to access rear camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission denied. Please allow camera access in browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          webcamStreamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.play().catch(() => {});
          }
          return;
        } catch (fErr) {
          msg = 'No video camera detected on this system. Switch to Simulated Road.';
        }
      }
      setWebcamError(msg);
      setActiveSource('simulation');
    }
  };

  const stopCamera = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (activeSource === 'webcam') {
      startCamera(cameraFacingMode);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeSource, cameraFacingMode]);

  // ----------------------------------------------------
  // 3. GEOLOCATION & PERMISSION HANDLING (FIX 1)
  // ----------------------------------------------------
  const handleNewGpsPosition = useCallback(
    (coords, timestamp = Date.now()) => {
      const newFix = {
        lat: coords.latitude ?? coords.lat,
        lng: coords.longitude ?? coords.lng,
        accuracy: coords.accuracy || 10,
        speed: coords.speed,
        timestamp,
      };

      setCurrentFix(newFix);
      setGpsAccuracyM(Math.round(newFix.accuracy));
      setLocationState('granted');
      setGeoError(null);

      // Calculate speed
      if (typeof coords.speed === 'number' && coords.speed > 0) {
        setCurrentSpeedKmh(Math.round(coords.speed * 3.6));
      }

      // If trip is not actively recording, update point without accumulating distance
      if (tripState !== 'recording') {
        lastFixRef.current = newFix;
        return;
      }

      // Validate fix against stationary drift & speed spikes
      const validation = validateLiveFix(lastFixRef.current, newFix, {
        maxAccuracyM: 25.0,
        minStationaryDistM: 2.0,
        maxSpeedKmh: 140.0,
      });

      if (validation.accepted && validation.distanceMeters > 0) {
        distanceAccumulatorRef.current += validation.distanceMeters;
        const totalM = Math.round(distanceAccumulatorRef.current);
        setDistanceMeters(totalM);

        // Smooth speed calculation
        if (lastFixRef.current?.timestamp) {
          const dt = (timestamp - lastFixRef.current.timestamp) / 1000;
          if (dt > 0.2) {
            const calculatedKmh = Math.round((validation.distanceMeters / dt) * 3.6);
            if (calculatedKmh <= 140) {
              setCurrentSpeedKmh(calculatedKmh);
            }
          }
        }

        const trackPoint = {
          lat: newFix.lat,
          lng: newFix.lng,
          accuracy: newFix.accuracy,
          time_s: elapsedSeconds,
          chainage: totalM,
        };

        tripTrackRef.current.push(trackPoint);
        setTripTrack([...tripTrackRef.current]);
        lastFixRef.current = newFix;
      } else if (!lastFixRef.current) {
        // Initial fix
        lastFixRef.current = newFix;
        tripTrackRef.current.push({
          lat: newFix.lat,
          lng: newFix.lng,
          accuracy: newFix.accuracy,
          time_s: elapsedSeconds,
          chainage: 0,
        });
        setTripTrack([...tripTrackRef.current]);
      }
    },
    [tripState, elapsedSeconds]
  );

  const requestBrowserLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationState('unavailable');
      setGeoError('Browser does not support Geolocation API.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleNewGpsPosition(pos.coords, pos.timestamp);
      },
      (err) => {
        if (err.code === 1) setLocationState('denied');
        else if (err.code === 3) setLocationState('timeout');
        else setLocationState('unavailable');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  // Watch position hook
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setLocationState('unavailable');
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'granted') {
          requestBrowserLocation();
        } else if (result.state === 'denied') {
          setLocationState('denied');
        } else {
          setLocationState('prompt');
        }
      }).catch(() => setLocationState('prompt'));
    }

    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        handleNewGpsPosition(pos.coords, pos.timestamp);
      },
      (err) => {
        if (err.code === 1) {
          setLocationState('denied');
          setGeoError('Location access denied. Please grant GPS permission.');
        } else if (err.code === 2) {
          setGeoError('Position unavailable (check GPS receiver).');
        } else if (err.code === 3) {
          setGeoError('GPS acquisition timeout.');
        }
      },
      geoOptions
    );

    geoWatchIdRef.current = watchId;

    return () => {
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
      }
    };
  }, [handleNewGpsPosition]);

  // Simulation GPS Vehicle Movement (Desk/Testing mode)
  useEffect(() => {
    if (!simulateGpsMovement || tripState !== 'recording') {
      if (simGpsIntervalRef.current) clearInterval(simGpsIntervalRef.current);
      return;
    }

    let simLat = currentFix?.lat || 18.5018;
    let simLng = currentFix?.lng || 73.8584;

    simGpsIntervalRef.current = setInterval(() => {
      simLat += 0.000072;
      simLng += 0.000015;
      handleNewGpsPosition(
        {
          latitude: simLat,
          longitude: simLng,
          accuracy: 5.0,
          speed: 8.0,
        },
        Date.now()
      );
    }, 1000);

    return () => {
      if (simGpsIntervalRef.current) clearInterval(simGpsIntervalRef.current);
    };
  }, [simulateGpsMovement, tripState, currentFix, handleNewGpsPosition]);

  // ----------------------------------------------------
  // 4. TRIP TIMER
  // ----------------------------------------------------
  useEffect(() => {
    if (tripState === 'recording') {
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [tripState]);

  // Trip Controls
  const handleStartTrip = async () => {
    setTripState('recording');
    setTripStartTime(new Date());
    requestWakeLock();

    try {
      const res = await sessionService.createSession({
        source: 'live',
        device_info: `Smartphone Camera (${cameraFacingMode === 'environment' ? 'Rear' : 'Front'})`,
        distance_source: 'live_gps',
      });
      setCurrentSessionId(res.data.id);
    } catch (err) {
      console.error('Failed to create live session in database:', err);
    }
  };

  const handlePauseTrip = () => {
    setTripState('paused');
    releaseWakeLock();
  };

  const handleResumeTrip = () => {
    setTripState('recording');
    requestWakeLock();
  };

  // On Stop: Execute ST-DBSCAN Deduplication in Database
  const handleStopTrip = async () => {
    setTripState('finished');
    releaseWakeLock();
    if (simGpsIntervalRef.current) clearInterval(simGpsIntervalRef.current);

    if (currentSessionId) {
      try {
        const clusterRes = await sessionService.runClustering(currentSessionId, {
          eps1_meters: 5.0,
          eps2_seconds: 10.0,
          min_pts: 2,
        });
        const dbIncidents = clusterRes.data?.incidents || [];
        setFinalizedIncidents(dbIncidents);
      } catch (err) {
        console.error('Database clustering error:', err);
      }
    } else {
      // Fallback in-browser ST-DBSCAN if session failed to create
      try {
        if (liveDefects.length > 0) {
          const dbscanResult = runSTDBSCAN(liveDefects, {
            eps1: 5.0,
            eps2: 10.0,
            min_pts: 2,
          });
          const incidents = synthesizeIncidents(dbscanResult.clusters, dbscanResult.noise, {
            busId: 'BUS-001',
            routeId: 1,
            startingSequence: 201,
          });
          setFinalizedIncidents(incidents);
        } else {
          setFinalizedIncidents([]);
        }
      } catch (err) {
        console.error('Live trip ST-DBSCAN error:', err);
      }
    }
  };

  const handleResetTrip = () => {
    setTripState('idle');
    setElapsedSeconds(0);
    setDistanceMeters(0);
    distanceAccumulatorRef.current = 0;
    lastFixRef.current = null;
    tripTrackRef.current = [];
    setTripTrack([]);
    setLiveDefects([]);
    setFinalizedIncidents([]);
    setPotholesCount(0);
    setCracksCount(0);
    setActiveBoxDetections([]);
    setLastReportedTicket(null);
  };

  // ----------------------------------------------------
  // 5. REAL-TIME AI INFERENCE & COMPLETE SPATIO-TEMPORAL ATTACHMENT (FIX 2)
  // ----------------------------------------------------
  useEffect(() => {
    if (!isAiActive || tripState !== 'recording') {
      if (inferenceIntervalRef.current) clearInterval(inferenceIntervalRef.current);
      return;
    }

    const runFrameInference = async () => {
      const videoEl = videoRef.current;
      const canvasEl = canvasRef.current;

      const hasVideo = activeSource === 'webcam' && videoEl && videoEl.readyState >= 2;
      const hasSim = activeSource === 'simulation' && canvasEl;

      if (!hasVideo && !hasSim) return;

      try {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 640;
        offCanvas.height = 360;
        const ctx = offCanvas.getContext('2d');

        if (hasVideo) {
          ctx.drawImage(videoEl, 0, 0, 640, 360);
        } else if (hasSim) {
          ctx.drawImage(canvasEl, 0, 0, 640, 360);
        }

        offCanvas.toBlob(
          async (blob) => {
            if (!blob) return;

            const curLat = currentFix?.lat ?? 0.0;
            const curLng = currentFix?.lng ?? 0.0;
            const currentChainage = distanceAccumulatorRef.current;

            const formData = new FormData();
            formData.append('file', blob, 'live_frame.jpg');
            formData.append('bus_id', 'BUS-001');
            formData.append('route_id', '1');
            formData.append('lat', curLat.toString());
            formData.append('lng', curLng.toString());
            formData.append('auto_create_incident', 'false');

            try {
              const res = await videoService.detectFrame(formData);
              const dets = res.data?.detections || [];

              if (dets.length > 0) {
                // Update live bounding box overlay
                setActiveBoxDetections(
                  dets.map((d) => ({
                    label: (d.hazard_type || d.class || 'pothole').toUpperCase(),
                    conf: Math.round((d.confidence || 0) * 100),
                    width: d.estimated_width_m,
                    length: d.estimated_length_m,
                    area: d.estimated_area_m2,
                    severity: d.severity || 'HIGH',
                    bbox: d.bbox,
                  }))
                );

                // Tag each detection with full spatio-temporal data
                const newTaggedDefects = [];
                const dbPayload = [];

                dets.forEach((d, detIdx) => {
                  const isCrack = (d.hazard_type || d.class || '').toLowerCase().includes('crack');
                  if (isCrack) {
                    setCracksCount((c) => c + 1);
                  } else {
                    setPotholesCount((p) => p + 1);
                  }

                  const taggedDefect = {
                    id: `LIVE-${Date.now()}-${detIdx}`,
                    class: isCrack ? 'road crack' : 'pothole',
                    hazard_type: isCrack ? 'road crack' : 'pothole',
                    type: isCrack ? 'Road Crack' : 'Pothole',
                    confidence: d.confidence,
                    bounding_box: d.bbox || [0, 0, 0, 0],
                    bbox: d.bbox,
                    estimated_dimensions: {
                      width_m: d.estimated_width_m || 0.4,
                      length_m: d.estimated_length_m || 0.4,
                      area_m2: d.estimated_area_m2 || 0.16,
                    },
                    estimated_width_m: d.estimated_width_m || 0.4,
                    estimated_length_m: d.estimated_length_m || 0.4,
                    estimated_area_m2: d.estimated_area_m2 || 0.16,
                    chainageMeters: Math.round(currentChainage),
                    chainageLabel: `${Math.round(currentChainage)} m`,
                    latitude: curLat,
                    longitude: curLng,
                    lat: curLat,
                    lng: curLng,
                    gps_accuracy: gpsAccuracyM || 5.0,
                    severity: d.severity || (isCrack ? 'MEDIUM' : 'HIGH'),
                    timestamp_seconds: elapsedSeconds,
                    time_s: elapsedSeconds,
                    timestamp_iso: new Date().toISOString(),
                    image_path: d.image_path || '',
                  };

                  newTaggedDefects.push(taggedDefect);

                  if (currentSessionId && d.bbox) {
                    dbPayload.push({
                      class: isCrack ? 'road crack' : 'pothole',
                      confidence: d.confidence,
                      bbox_x: d.bbox[0],
                      bbox_y: d.bbox[1],
                      bbox_w: d.bbox[2] - d.bbox[0],
                      bbox_h: d.bbox[3] - d.bbox[1],
                      width_cm: Math.round((d.estimated_width_m || 0.4) * 100),
                      length_cm: Math.round((d.estimated_length_m || 0.4) * 100),
                      depth_est: d.depth_est || 'moderate',
                      frame_index: Math.round(elapsedSeconds * 2),
                      video_offset_s: elapsedSeconds,
                      lat: curLat,
                      lon: curLng,
                      gps_accuracy_m: gpsAccuracyM || 5.0,
                      chainage_m: currentChainage,
                      thumbnail_path: d.image_path || '',
                    });
                  }
                });

                setLiveDefects((prev) => [...newTaggedDefects, ...prev].slice(0, 100));

                if (currentSessionId && dbPayload.length > 0) {
                  sessionService.insertDetections(currentSessionId, dbPayload).catch(() => {});
                }

                if (res.data?.created_incident) {
                  setLastReportedTicket(res.data.created_incident);
                }
              }
            } catch (err) {
              // Inference pass
            }
          },
          'image/jpeg',
          0.85
        );
      } catch (err) {
        // Frame capture pass
      }
    };

    inferenceIntervalRef.current = setInterval(runFrameInference, 1200);

    return () => {
      if (inferenceIntervalRef.current) clearInterval(inferenceIntervalRef.current);
    };
  }, [isAiActive, tripState, activeSource, currentFix, autoReport, elapsedSeconds, gpsAccuracyM]);

  // ----------------------------------------------------
  // 6. CANVAS SIMULATION FOR FALLBACK
  // ----------------------------------------------------
  useEffect(() => {
    if (activeSource !== 'simulation') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    let animId = null;

    const render = () => {
      frame++;
      const w = canvas.width;
      const h = canvas.height;
      const horizonY = h * 0.44;
      const cx = w / 2;

      // Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, '#0f172a');
      skyGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, horizonY);

      // Road
      const roadGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      roadGrad.addColorStop(0, '#1e293b');
      roadGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = roadGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Lane line
      const offset = (frame * 6) % 70;
      for (let y = horizonY + 5; y < h; y += 65) {
        const curY = y + offset;
        if (curY >= h) continue;
        const prog = (curY - horizonY) / (h - horizonY);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(cx - 3, curY, 6, Math.max(8, 35 * prog));
      }

      // Real roadway canvas (no synthetic potholes)

      animId = requestAnimationFrame(render);
    };

    render();
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [activeSource, isAiActive]);

  // Telemetry Calculations
  const distanceKm = (distanceMeters / 1000).toFixed(2);
  const avgTripSpeedKmh =
    elapsedSeconds > 0 ? Math.round(((distanceMeters / 1000) / (elapsedSeconds / 3600)) * 10) / 10 : 0;
  const totalLiveDefects = potholesCount + cracksCount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Top Banner & Control Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ background: '#0284c7', color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
              FEATURE 2
            </span>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Live Rear Camera & Distance Tracking
            </h1>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 700,
                background:
                  tripState === 'recording'
                    ? 'rgba(16, 185, 129, 0.15)'
                    : tripState === 'paused'
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(100, 116, 139, 0.15)',
                color:
                  tripState === 'recording'
                    ? '#059669'
                    : tripState === 'paused'
                    ? '#d97706'
                    : '#64748b',
                border:
                  tripState === 'recording'
                    ? '1px solid #10b981'
                    : tripState === 'paused'
                    ? '1px solid #f59e0b'
                    : '1px solid #cbd5e1',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background:
                    tripState === 'recording' ? '#10b981' : tripState === 'paused' ? '#f59e0b' : '#64748b',
                  animation: tripState === 'recording' ? 'marker-pulse 1.2s infinite' : 'none',
                }}
              />
              {tripState === 'recording'
                ? 'TRIP RECORDING'
                : tripState === 'paused'
                ? 'TRIP PAUSED'
                : tripState === 'finished'
                ? 'TRIP COMPLETED'
                : 'SURVEY READY'}
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
            Smartphone rear camera feed with high-accuracy GPS tracking, drift filter, and ST-DBSCAN deduplication
          </p>
        </div>

        {/* Source & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.25rem', background: '#f1f5f9', padding: '0.3rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <button
              onClick={() => setActiveSource('webcam')}
              className="btn"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                background: activeSource === 'webcam' ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'transparent',
                color: activeSource === 'webcam' ? '#fff' : '#475569',
                borderRadius: '6px',
              }}
            >
              <Smartphone size={13} /> Rear Camera (Phone)
            </button>

            <button
              onClick={() => setActiveSource('simulation')}
              className="btn"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                background: activeSource === 'simulation' ? 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)' : 'transparent',
                color: activeSource === 'simulation' ? '#fff' : '#475569',
                borderRadius: '6px',
              }}
            >
              <CameraIcon size={13} /> Simulated Road
            </button>

            <button
              onClick={() => setActiveSource('uploaded')}
              className="btn"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                background: activeSource === 'uploaded' ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)' : 'transparent',
                color: activeSource === 'uploaded' ? '#fff' : '#475569',
                borderRadius: '6px',
              }}
            >
              <Upload size={13} /> Upload Road Video
            </button>
          </div>

          {activeSource === 'webcam' && (
            <button
              onClick={() => {
                const nextFacing = cameraFacingMode === 'environment' ? 'user' : 'environment';
                setCameraFacingMode(nextFacing);
                startCamera(nextFacing);
              }}
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
            >
              <RefreshCw size={12} /> {cameraFacingMode === 'environment' ? 'Rear Cam' : 'Front Cam'}
            </button>
          )}

          <button
            onClick={() => setIsAiActive(!isAiActive)}
            className="btn btn-secondary"
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem', gap: '0.4rem' }}
          >
            <Zap size={14} color={isAiActive ? '#10b981' : '#64748b'} />
            AI: <strong>{isAiActive ? 'ON' : 'OFF'}</strong>
          </button>
        </div>
      </div>

      {activeSource === 'uploaded' ? (
        <UploadComponent />
      ) : (
        <>
          {/* FIX 1: IN-APP LOCATION PERMISSION PROMPT BANNER */}
          <LocationPermissionPrompt
            locationState={locationState}
            coords={currentFix}
            onRequestPermission={requestBrowserLocation}
            onManualLocationSelect={(pt) => {
              handleNewGpsPosition(pt);
            }}
          />

      {webcamError && (
        <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', borderRadius: '8px', padding: '0.65rem 1rem', color: '#fde047', fontSize: '0.8rem' }}>
          {webcamError}
        </div>
      )}

      {/* TRIP TELEMETRY HUD (METRIC CARDS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <div className="card" style={{ borderLeft: '4px solid #0284c7', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.7rem' }}>
            <span>DISTANCE TRAVELLED</span>
            <Navigation size={16} color="#0284c7" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
            {distanceMeters} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>m</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#0284c7' }}>
            {distanceKm} km (Drift-Filtered)
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #8b5cf6', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.7rem' }}>
            <span>CURRENT SPEED</span>
            <Gauge size={16} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
            {currentSpeedKmh} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>km/h</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#7c3aed' }}>
            Avg: {avgTripSpeedKmh} km/h
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #10b981', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.7rem' }}>
            <span>ELAPSED TIME</span>
            <Clock size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
            {formatTime(elapsedSeconds)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#059669' }}>
            Wake Lock: {wakeLockRef.current ? 'ACTIVE' : 'READY'}
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #3b82f6', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.7rem' }}>
            <span>GPS ACCURACY</span>
            <Radio size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
            &plusmn;{gpsAccuracyM || 10} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>m</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: gpsAccuracyM && gpsAccuracyM <= 25 ? '#059669' : '#d97706' }}>
            {gpsAccuracyM && gpsAccuracyM <= 25 ? 'High Precision' : 'Filtering Jitter'}
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #ef4444', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.7rem' }}>
            <span>POTHOLES / CRACKS</span>
            <span style={{ color: '#ef4444', fontWeight: 800 }}>⬤ / ⚡</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
            <span style={{ color: '#ef4444' }}>{potholesCount}</span> / <span style={{ color: '#d97706' }}>{cracksCount}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Total: {totalLiveDefects} Defects
          </div>
        </div>
      </div>

      {/* TRIP CONTROLS BAR */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          borderRadius: '8px',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {tripState === 'idle' && (
            <button
              onClick={handleStartTrip}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem' }}
            >
              <Play size={16} fill="#fff" /> Start Survey & Trip
            </button>
          )}

          {tripState === 'recording' && (
            <>
              <button
                onClick={handlePauseTrip}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
              >
                <Pause size={16} /> Pause Survey
              </button>
              <button
                onClick={handleStopTrip}
                className="btn"
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '6px',
                }}
              >
                <Square size={16} fill="#fff" /> Stop & Finalize Trip
              </button>
            </>
          )}

          {tripState === 'paused' && (
            <>
              <button
                onClick={handleResumeTrip}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
              >
                <Play size={16} fill="#fff" /> Resume Survey
              </button>
              <button
                onClick={handleStopTrip}
                className="btn"
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '6px',
                }}
              >
                <Square size={16} fill="#fff" /> Stop & Finalize Trip
              </button>
            </>
          )}

          {tripState === 'finished' && (
            <button
              onClick={handleResetTrip}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
            >
              <RefreshCw size={16} /> Start New Trip
            </button>
          )}
        </div>

        {/* Vehicle Movement Simulation Toggle (For desk evaluation) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              color: simulateGpsMovement ? '#0284c7' : '#64748b',
            }}
          >
            <input
              type="checkbox"
              checked={simulateGpsMovement}
              onChange={(e) => setSimulateGpsMovement(e.target.checked)}
            />
            <span>Simulate Vehicle Drive (Desk Demo)</span>
          </label>

          <span style={{ color: '#cbd5e1' }}>|</span>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              color: autoReport ? '#059669' : '#64748b',
            }}
          >
            <input
              type="checkbox"
              checked={autoReport}
              onChange={(e) => setAutoReport(e.target.checked)}
            />
            <span>Auto-Report to DB</span>
          </label>
        </div>
      </div>

      {/* MAIN VIEWPORT & SIDE TELEMETRY */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem' }}>
        {/* VIEWPORT CARD */}
        <div className="card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div
            style={{
              position: 'relative',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#090d16',
              aspectRatio: '16/9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #1e293b',
            }}
          >
            {activeSource === 'simulation' && (
              <canvas
                ref={canvasRef}
                width={854}
                height={480}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )}

            {activeSource === 'webcam' && (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {isAiActive &&
                  activeBoxDetections.map((det, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        top: '35%',
                        left: '25%',
                        width: '45%',
                        height: '40%',
                        border: det.label.includes('CRACK') ? '2.5px solid #f59e0b' : '2.5px solid #ef4444',
                        borderRadius: '4px',
                        pointerEvents: 'none',
                        boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)',
                      }}
                    >
                      <div
                        style={{
                          background: det.label.includes('CRACK') ? '#d97706' : '#dc2626',
                          color: '#fff',
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          display: 'inline-block',
                        }}
                      >
                        {det.label} | {det.conf}% | Chainage: {distanceMeters}m
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Top-Left Telemetry HUD */}
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                background: 'rgba(10, 15, 25, 0.90)',
                border: '1px solid #233454',
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                color: '#67e8f9',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem',
                pointerEvents: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: tripState === 'recording' ? '#ef4444' : '#64748b',
                    animation: tripState === 'recording' ? 'marker-pulse 1s infinite' : 'none',
                  }}
                />
                <strong>LIVE ROAD OPTICAL STREAM &bull; BUS-001</strong>
              </div>
              <div style={{ color: '#94a3b8' }}>
                Chainage: <strong style={{ color: '#f1f5f9' }}>{distanceMeters} m</strong> &bull; Speed:{' '}
                {currentSpeedKmh} km/h
              </div>
              {isAiActive && (
                <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.7rem' }}>
                  &#10003; Real-Time AI Detection Overlay Active
                </div>
              )}
            </div>

            {/* Bottom-Right Coordinates HUD */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                background: 'rgba(10, 15, 25, 0.90)',
                border: '1px solid #233454',
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                color: '#f1f5f9',
                textAlign: 'right',
                pointerEvents: 'none',
              }}
            >
              <div>
                GPS:{' '}
                <strong>
                  {currentFix ? `${currentFix.lat.toFixed(5)}° N, ${currentFix.lng.toFixed(5)}° E` : 'Searching...'}
                </strong>
              </div>
              <div style={{ color: '#94a3b8' }}>Accuracy: &plusmn;{gpsAccuracyM || 10}m</div>
            </div>
          </div>
        </div>

        {/* SIDEBAR: REAL-TIME TAGGED OBSERVATIONS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Activity size={16} color="#0284c7" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Live Tagged Hazards
                </h3>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 600 }}>
                {liveDefects.length} Observations
              </span>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Each detection is stamped with GPS coordinates, accuracy, and distance-from-start chainage.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
              {liveDefects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', fontSize: '0.8rem' }}>
                  {tripState === 'recording'
                    ? 'Scanning road for surface defects...'
                    : 'Click "Start Survey & Trip" to begin detection'}
                </div>
              ) : (
                liveDefects.map((d) => {
                  const isCrack = d.class.includes('crack');
                  return (
                    <div
                      key={d.id}
                      style={{
                        background: '#f8fafc',
                        border: isCrack ? '1px solid #fde68a' : '1px solid #fecaca',
                        borderRadius: '6px',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                        <strong style={{ color: isCrack ? '#d97706' : '#dc2626' }}>
                          {isCrack ? '⚡ Road Crack' : '⬤ Pothole'}
                        </strong>
                        <span style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: '4px', color: '#334155' }}>
                          {Math.round(d.confidence > 1 ? d.confidence : d.confidence * 100)}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                        <span>Chainage: <strong style={{ color: '#0284c7' }}>{d.chainageLabel}</strong></span>
                        <span>Time: {d.timestamp_seconds}s</span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '0.15rem' }}>
                        GPS: {d.latitude.toFixed(5)}, {d.longitude.toFixed(5)} (&plusmn;{d.gps_accuracy}m)
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* LIVE ROUTE TRACK MAP */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={16} color="#0284c7" />
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Live Vehicle Track & Defect Locations
            </h3>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Accumulated Track: <strong>{tripTrack.length} fixes</strong> &bull; Total Distance: <strong>{distanceMeters} m</strong>
          </div>
        </div>

        <RouteDefectsMap
          routeCoordinates={tripTrack}
          defects={tripState === 'finished' && finalizedIncidents.length > 0 ? finalizedIncidents : liveDefects}
          startPoint={tripTrack[0] || currentFix}
          endPoint={tripTrack[tripTrack.length - 1] || currentFix}
          height="320px"
        />
      </div>

      {/* ========================================================
          TRIP SUMMARY & ST-DBSCAN DEDUPLICATION VIEW (SHOWN ON STOP)
         ======================================================== */}
      {tripState === 'finished' && (
        <div
          className="card"
          style={{
            background: '#ffffff',
            border: '2px solid #0284c7',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Deduplication Milestone */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ background: '#059669', color: '#fff', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <GitMerge size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Trip Completed & ST-DBSCAN Deduplicated
                </h2>
                <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                  {liveDefects.length} raw optical detections clustered into{' '}
                  <strong>{finalizedIncidents.length} consolidated incident(s)</strong>
                </div>
              </div>
            </div>

            {/* Export Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {currentSessionId && (
                <Link
                  to={`/sessions/${currentSessionId}`}
                  className="btn btn-primary"
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
                >
                  <Eye size={14} /> View Session in Database
                </Link>
              )}
              <button
                onClick={() =>
                  exportToJSON(
                    {
                      bus_id: 'BUS-001',
                      distanceMeters,
                      distanceKm,
                      elapsedSeconds,
                      rawDetectionsCount: liveDefects.length,
                      incidentsCount: finalizedIncidents.length,
                      incidents: finalizedIncidents,
                      rawDetections: liveDefects,
                      track: tripTrack,
                    },
                    `survey_trip_${Date.now()}.json`
                  )
                }
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Download size={14} /> Export JSON
              </button>
              <button
                onClick={() => exportToCSV(finalizedIncidents, `live_incidents_${Date.now()}.csv`)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Download size={14} /> Export CSV
              </button>
              <button
                onClick={() => exportToGeoJSON(tripTrack, finalizedIncidents, `survey_trip_gis_${Date.now()}.geojson`)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Download size={14} /> Export GeoJSON
              </button>
            </div>
          </div>

          {/* Metrics Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Distance Travelled</div>
              <strong style={{ fontSize: '1.3rem', color: '#0284c7' }}>{distanceMeters} m ({distanceKm} km)</strong>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Survey Duration</div>
              <strong style={{ fontSize: '1.3rem', color: '#7c3aed' }}>{formatTime(elapsedSeconds)}</strong>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Raw Camera Observations</div>
              <strong style={{ fontSize: '1.3rem', color: '#d97706' }}>{liveDefects.length}</strong>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Consolidated Incidents</div>
              <strong style={{ fontSize: '1.3rem', color: '#059669' }}>{finalizedIncidents.length}</strong>
            </div>
          </div>

          {/* Consolidated Incidents Table */}
          {finalizedIncidents.length > 0 && (
            <div style={{ overflowX: 'auto', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                    <th style={{ padding: '0.5rem' }}>Incident Code</th>
                    <th style={{ padding: '0.5rem' }}>Hazard Type</th>
                    <th style={{ padding: '0.5rem' }}>Observations Merged</th>
                    <th style={{ padding: '0.5rem' }}>Confidence</th>
                    <th style={{ padding: '0.5rem' }}>Chainage</th>
                    <th style={{ padding: '0.5rem' }}>Centroid Coordinates</th>
                    <th style={{ padding: '0.5rem' }}>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {finalizedIncidents.map((inc) => (
                    <tr key={inc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.5rem', fontWeight: 700, color: '#0284c7' }}>{inc.id}</td>
                      <td style={{ padding: '0.5rem', color: '#0f172a' }}>{inc.hazard_type}</td>
                      <td style={{ padding: '0.5rem', color: '#059669', fontWeight: 700 }}>
                        {inc.detection_count} frame{inc.detection_count > 1 ? 's' : ''}
                      </td>
                      <td style={{ padding: '0.5rem', color: '#0f172a' }}>{Math.round(inc.confidence * 100)}%</td>
                      <td style={{ padding: '0.5rem', color: '#0284c7' }}>{inc.chainageLabel}</td>
                      <td style={{ padding: '0.5rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {inc.latitude.toFixed(5)}, {inc.longitude.toFixed(5)}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            background: inc.severity === 'CRITICAL' ? '#ef4444' : inc.severity === 'HIGH' ? '#f59e0b' : '#3b82f6',
                            color: '#fff',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '3px',
                          }}
                        >
                          {inc.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default Camera;
