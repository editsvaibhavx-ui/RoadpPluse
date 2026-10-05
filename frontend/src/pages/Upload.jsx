import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  UploadCloud,
  FileVideo,
  Play,
  MapPin,
  CheckCircle,
  Sparkles,
  Sliders,
  FileSpreadsheet,
  Compass,
  Download,
  AlertCircle,
  Navigation,
  Gauge,
  Clock,
  Layers,
  FileText,
  Eye,
  RefreshCw,
  GitMerge,
  Filter,
} from 'lucide-react';
import { videoService, routeService, sessionService, resolveMediaUrl } from '../services/api';
import ProcessingStepper from '../components/ProcessingStepper';
import RouteDefectsMap from '../components/RouteDefectsMap';
import { LocationPermissionPrompt } from '../components/LocationPermissionPrompt';
import {
  haversineDistance,
  calculateTrackDistance,
  interpolateChainage,
  parseGPX,
  parseCSV,
  parseSRT,
  parseNMEA,
  extractEmbeddedGPSFromVideo,
  fetchOSRMRoute,
  exportToJSON,
  exportToCSV,
  exportToGeoJSON,
} from '../services/distanceEngine';
import { runSTDBSCAN, synthesizeIncidents } from '../lib/stdbscan';

const Upload = () => {
  const navigate = useNavigate();

  // Video State
  const [file, setFile] = useState(null);
  const [videoDuration, setVideoDuration] = useState(10.0);
  const [busId, setBusId] = useState('BUS-001');
  const [routeId, setRouteId] = useState(1);
  const [routes, setRoutes] = useState([]);
  const [intervalSec, setIntervalSec] = useState(0.5); // ~2-5 fps sampling

  // Browser Geolocation Permission State (Fix 1)
  const [locationState, setLocationState] = useState('prompt'); // 'prompt' | 'granted' | 'denied' | 'unavailable'
  const [browserCoords, setBrowserCoords] = useState(null);

  // Distance Source Priority State
  // Priority order: 1: embedded, 2: sidecar, 3: map, 4: manual
  const [selectedSourceType, setSelectedSourceType] = useState('sidecar'); // 'embedded' | 'sidecar' | 'map' | 'manual'
  const [embeddedGpsInfo, setEmbeddedGpsInfo] = useState(null);
  const [sidecarFile, setSidecarFile] = useState(null);
  const [sidecarTrack, setSidecarTrack] = useState(null);
  const [sidecarFileName, setSidecarFileName] = useState('');

  // Map Picker State (Option 3)
  const [mapStartPoint, setMapStartPoint] = useState({ lat: 18.5018, lng: 73.8584 });
  const [mapEndPoint, setMapEndPoint] = useState({ lat: 18.5246, lng: 73.8407 });
  const [mapPickingMode, setMapPickingMode] = useState(null); // 'start' | 'end' | null
  const [osrmRouteData, setOsrmRouteData] = useState(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);

  // Manual Speed / Length State (Option 4)
  const [manualSpeedKmh, setManualSpeedKmh] = useState(30);
  const [manualKnownLengthM, setManualKnownLengthM] = useState('');

  // Pipeline Status & Results
  const [currentStep, setCurrentStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [stepStatusMap, setStepStatusMap] = useState({
    1: 'pending',
    2: 'pending',
    3: 'pending',
    4: 'pending',
    5: 'pending',
  });
  const [stepMessage, setStepMessage] = useState(null);
  const [analysisReport, setAnalysisReport] = useState(null);
  const [activeResultsTab, setActiveResultsTab] = useState('incidents'); // 'incidents' | 'raw_detections'

  // Fetch routes & check initial location permission on mount
  useEffect(() => {
    routeService.getRoutes().then((res) => setRoutes(res.data)).catch(() => {});

    if ('geolocation' in navigator) {
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
      } else {
        setLocationState('prompt');
      }
    } else {
      setLocationState('unavailable');
    }
  }, []);

  // Request browser geolocation
  const requestBrowserLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationState('unavailable');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 10.0,
        };
        setBrowserCoords(coords);
        setLocationState('granted');
        setMapStartPoint({ lat: coords.lat, lng: coords.lng });
      },
      (err) => {
        if (err.code === 1) {
          setLocationState('denied');
        } else if (err.code === 3) {
          setLocationState('timeout');
        } else {
          setLocationState('unavailable');
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  // When a video file is chosen, inspect for embedded GPS metadata and duration
  const handleVideoFileChange = async (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
    setError(null);

    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      window.URL.revokeObjectURL(tempVideo.src);
      if (tempVideo.duration && !isNaN(tempVideo.duration)) {
        setVideoDuration(Math.round(tempVideo.duration * 10) / 10);
      }
    };
    tempVideo.src = URL.createObjectURL(selected);

    const embedded = await extractEmbeddedGPSFromVideo(selected);
    if (embedded && embedded.found) {
      setEmbeddedGpsInfo(embedded);
      setSelectedSourceType('embedded');
    }
  };

  // Handle Sidecar Track File (.gpx, .srt, .csv, .nmea)
  const handleSidecarFileChange = async (e) => {
    const trackFile = e.target.files[0];
    if (!trackFile) return;

    setSidecarFile(trackFile);
    setSidecarFileName(trackFile.name);
    const text = await trackFile.text();
    const ext = trackFile.name.split('.').pop().toLowerCase();

    let parsed = null;
    if (ext === 'gpx') {
      parsed = parseGPX(text);
    } else if (ext === 'csv') {
      parsed = parseCSV(text);
    } else if (ext === 'srt') {
      parsed = parseSRT(text);
    } else if (ext === 'nmea' || ext === 'log') {
      parsed = parseNMEA(text);
    } else {
      parsed = parseCSV(text);
    }

    if (parsed && parsed.success && parsed.points.length > 0) {
      setSidecarTrack(parsed);
      setSelectedSourceType('sidecar');
    } else {
      alert(`Could not parse track coordinates from ${trackFile.name}. Please check file format.`);
    }
  };

  // Quick helper: Load built-in Pune GPX Track
  const handleLoadDemoGpx = async () => {
    try {
      const res = await fetch('/sample_tracks/demo_pune_bus_route.gpx');
      const text = await res.text();
      const parsed = parseGPX(text);
      if (parsed.success) {
        setSidecarTrack(parsed);
        setSidecarFileName('demo_pune_bus_route.gpx (Pune Route 01)');
        setSelectedSourceType('sidecar');
      }
    } catch (err) {
      console.error('Failed to load demo gpx:', err);
    }
  };

  // Map Picker point tap
  const handlePickMapPoint = (coord) => {
    if (mapPickingMode === 'start') {
      setMapStartPoint(coord);
      setMapPickingMode(null);
    } else if (mapPickingMode === 'end') {
      setMapEndPoint(coord);
      setMapPickingMode(null);
    }
  };

  // Calculate OSRM route when start/end change in map mode
  const calculateMapRoute = async () => {
    if (!mapStartPoint || !mapEndPoint) return;
    setIsRoutingLoading(true);
    try {
      const routeRes = await fetchOSRMRoute(
        mapStartPoint.lat,
        mapStartPoint.lng,
        mapEndPoint.lat,
        mapEndPoint.lng
      );
      setOsrmRouteData(routeRes);
      setSelectedSourceType('map');
    } catch (err) {
      console.error('Routing error:', err);
    } finally {
      setIsRoutingLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSourceType === 'map' && mapStartPoint && mapEndPoint) {
      calculateMapRoute();
    }
  }, [mapStartPoint, mapEndPoint, selectedSourceType]);

  // ----------------------------------------------------
  // COMPLETE 5-STEP PROCESSING PIPELINE WITH ST-DBSCAN
  // ----------------------------------------------------
  const runCompleteAnalysisPipeline = async (videoFilenameToProcess) => {
    setIsProcessing(true);
    setError(null);
    setAnalysisReport(null);

    // Initial Stepper State
    setCurrentStep(1);
    setStepStatusMap({ 1: 'running', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending' });
    setStepMessage('Creating session and validating video in database...');

    try {
      // 1. Create real Session record in DB with 5 pipeline_steps
      const sessionRes = await sessionService.createSession({
        source: 'upload',
        video_filename: videoFilenameToProcess,
        video_duration_s: videoDuration,
        distance_source: selectedSourceType,
        device_info: `Edge Dashboard Upload (${busId})`
      });
      const session = sessionRes.data;
      const sessionId = session.id;

      // 2. Resolve GPS Points and Track
      let routePoints = [];
      let calculatedTotalDistanceM = 0;
      let usedSourceDescription = '';
      let usedSourcePriority = 1;
      let isDistanceEstimated = false;

      // Priority 1: Embedded GPS
      if (selectedSourceType === 'embedded' && embeddedGpsInfo?.found) {
        usedSourcePriority = 1;
        usedSourceDescription = embeddedGpsInfo.source || 'Priority 1: Embedded Video GPS Metadata';
        routePoints = [{ lat: embeddedGpsInfo.lat, lng: embeddedGpsInfo.lng, time_s: 0 }];
        calculatedTotalDistanceM = 100;
      }
      // Priority 2: Sidecar Track File (.gpx, .srt, .nmea, .csv)
      else if (selectedSourceType === 'sidecar' && sidecarTrack?.points?.length > 0) {
        usedSourcePriority = 2;
        usedSourceDescription = `Priority 2: Sidecar Track File (${sidecarFileName || sidecarTrack.source})`;
        routePoints = sidecarTrack.points;
        const trackDist = calculateTrackDistance(routePoints);
        calculatedTotalDistanceM = trackDist.totalMeters;
      }
      // Priority 3: Map Start & End Points (OSRM Road Network + Haversine)
      else if (selectedSourceType === 'map') {
        usedSourcePriority = 3;
        usedSourceDescription = osrmRouteData?.source || 'Priority 3: Map Routing (OSRM Public Road Distance)';
        if (osrmRouteData?.coordinates?.length > 0) {
          routePoints = osrmRouteData.coordinates;
          calculatedTotalDistanceM = osrmRouteData.roadDistanceM;
        } else {
          const directM = haversineDistance(
            mapStartPoint.lat,
            mapStartPoint.lng,
            mapEndPoint.lat,
            mapEndPoint.lng
          );
          calculatedTotalDistanceM = directM;
          routePoints = [mapStartPoint, mapEndPoint];
        }
      }
      // Priority 4: Manual Fallback
      else {
        usedSourcePriority = 4;
        isDistanceEstimated = true;
        if (manualKnownLengthM && !isNaN(Number(manualKnownLengthM))) {
          calculatedTotalDistanceM = parseFloat(manualKnownLengthM);
          usedSourceDescription = `Priority 4: Manual Known Road Length (${calculatedTotalDistanceM}m - Estimated)`;
        } else {
          const speedMs = (parseFloat(manualSpeedKmh || 30) * 1000) / 3600;
          calculatedTotalDistanceM = Math.round(speedMs * videoDuration);
          usedSourceDescription = `Priority 4: Manual Fallback (${manualSpeedKmh} km/h \u00D7 ${videoDuration}s - Estimated)`;
        }

        const baseLat = browserCoords?.lat || 18.5204;
        const baseLng = browserCoords?.lng || 73.8567;
        const dLat = calculatedTotalDistanceM / 111320;
        routePoints = [
          { lat: baseLat, lng: baseLng, time_s: 0 },
          { lat: baseLat + dLat, lng: baseLng + 0.002, time_s: videoDuration },
        ];
      }

      // Step 2 & 3: Persist real GPS Points to database
      if (routePoints.length > 0) {
        setStepStatusMap((prev) => ({ ...prev, 1: 'completed', 2: 'completed', 3: 'running' }));
        setCurrentStep(3);
        setStepMessage('Persisting GPS telemetry track points to relational database...');

        const gpsPayload = routePoints.map((pt, idx) => ({
          lat: pt.lat ?? pt.latitude,
          lon: pt.lng ?? pt.lon ?? pt.longitude,
          accuracy_m: pt.accuracy || 5.0,
          video_offset_s: pt.time_s ?? (idx / Math.max(1, routePoints.length - 1)) * videoDuration,
        }));

        await sessionService.appendGPS(sessionId, gpsPayload);
      }

      setStepStatusMap((prev) => ({ ...prev, 3: 'completed', 4: 'running' }));
      setCurrentStep(4);
      setStepMessage('Executing real OpenCV road defect detection on sampled frames...');

      // Step 4: Real OpenCV Video Processing via Backend API
      const processRes = await sessionService.processVideo(sessionId, {
        video_filename: videoFilenameToProcess,
        sample_interval_sec: intervalSec,
      });

      setStepStatusMap((prev) => ({ ...prev, 4: 'completed', 5: 'running' }));
      setCurrentStep(5);
      setStepMessage('Running DB ST-DBSCAN Spatio-Temporal Clustering (eps1=5m, eps2=10s)...');

      // Step 5: Real ST-DBSCAN Clustering in Database
      const clusterRes = await sessionService.runClustering(sessionId, {
        eps1_meters: 5.0,
        eps2_seconds: 10.0,
        min_pts: 2,
      });

      setStepStatusMap({ 1: 'completed', 2: 'completed', 3: 'completed', 4: 'completed', 5: 'completed' });
      setCurrentStep(5);
      setStepMessage('Analysis Completed & Persisted to Relational Database');

      // Fetch freshly persisted data directly from database
      const [finalSession, finalDets, finalIncs] = await Promise.all([
        sessionService.getSession(sessionId),
        sessionService.getSessionDetections(sessionId),
        sessionService.getSessionIncidents(sessionId),
      ]);

      const detectionsWithSpatioTemporalData = finalDets.data || [];
      const clusteredIncidents = finalIncs.data || [];
      const totalDist = finalSession.data.distance_m || calculatedTotalDistanceM;

      // Post-clustering deduplicated hazard counts (one incident per real road defect)
      const potholesCount = clusteredIncidents.filter(i => (i.class || i.hazard_type || '').toLowerCase().includes('pothole')).length;
      const cracksCount = clusteredIncidents.filter(i => (i.class || i.hazard_type || '').toLowerCase().includes('crack')).length;
      const otherHazardsCount = clusteredIncidents.filter(i => {
        const c = (i.class || i.hazard_type || '').toLowerCase();
        return !c.includes('pothole') && !c.includes('crack');
      }).length;
      const rawPotholesCount = detectionsWithSpatioTemporalData.filter(d => (d.class || d.hazard_type || '').toLowerCase().includes('pothole')).length;
      const rawCracksCount = detectionsWithSpatioTemporalData.filter(d => (d.class || d.hazard_type || '').toLowerCase().includes('crack')).length;
      const totalDefects = detectionsWithSpatioTemporalData.length;
      const distKm = totalDist / 1000;
      const defectsPerKm = distKm > 0 ? (clusteredIncidents.length / distKm).toFixed(2) : '0.00';
      const effectiveDuration = finalSession.data.video_duration_s || videoDuration;
      const avgSpeed = effectiveDuration > 0 && totalDist > 0 ? ((totalDist / effectiveDuration) * 3.6).toFixed(1) : (finalSession.data.avg_speed_kmh || manualSpeedKmh || 30);

      const sampleFrames = clusterRes.data?.annotated_samples || processRes.data?.annotated_samples || [];

      const finalReport = {
        sessionId,
        videoFilename: videoFilenameToProcess,
        videoDuration: effectiveDuration,
        totalDistanceMeters: Math.round(totalDist),
        totalDistanceKm: (totalDist / 1000).toFixed(2),
        avgSpeedKmh: avgSpeed,
        potholesCount,
        cracksCount,
        otherHazardsCount,
        rawPotholesCount,
        rawCracksCount,
        totalDefects,
        defectsPerKm,
        sourcePriority: usedSourcePriority,
        sourceDescription: usedSourceDescription,
        isDistanceEstimated,
        routePoints,
        rawDetections: detectionsWithSpatioTemporalData,
        rawDetectionsCount: detectionsWithSpatioTemporalData.length,
        incidents: clusteredIncidents,
        incidentsCount: clusteredIncidents.length,
        clustersCount: clusterRes.data?.clusters_count || 0,
        noiseCount: clusterRes.data?.noise_count || 0,
        dedupReductionPercent:
          detectionsWithSpatioTemporalData.length > 0
            ? Math.round(
                ((detectionsWithSpatioTemporalData.length - clusteredIncidents.length) /
                  detectionsWithSpatioTemporalData.length) *
                  100
              )
            : 0,
        sampledFramesCount: processRes.data?.sampled_frames_count || 0,
        detectorInfo: 'OpenCV Computer Vision (Edge & Contour Segmentation)',
        annotatedSamples: sampleFrames,
      };

      setAnalysisReport(finalReport);
    } catch (err) {
      console.error('Pipeline error:', err);
      setError(err.response?.data?.detail || err.message || 'Pipeline encountered an error');
      setStepStatusMap((prev) => ({ ...prev, [currentStep]: 'failed' }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadAndAnalyze = async (e) => {
    e.preventDefault();
    if (!file) {
      alert('Please select a video file or click "Run With Built-in Demo Video"');
      return;
    }

    try {
      setIsProcessing(true);
      setCurrentStep(1);
      setStepStatusMap({ 1: 'running', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending' });

      const uploadForm = new FormData();
      uploadForm.append('file', file);
      uploadForm.append('bus_id', busId);
      uploadForm.append('route_id', routeId);
      uploadForm.append('camera_source', 'Smartphone Camera');

      const uploadRes = await videoService.uploadVideo(uploadForm);
      await runCompleteAnalysisPipeline(uploadRes.data.filename);
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed');
      setStepStatusMap((prev) => ({ ...prev, 1: 'failed' }));
      setIsProcessing(false);
    }
  };

  const handleRunDemoVideo = async () => {
    if (!sidecarTrack && selectedSourceType === 'sidecar') {
      await handleLoadDemoGpx();
    }
    await runCompleteAnalysisPipeline('demo_pune_bus_route.mp4');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1150px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ background: '#0284c7', color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
              PS-124
            </span>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
              AI Video Ingestion & ST-DBSCAN Pipeline
            </h1>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.3rem' }}>
            Frame-by-frame hazard detection, 4-tier distance resolution, and ST-DBSCAN spatio-temporal deduplication
          </p>
        </div>

        {analysisReport && (
          <button
            onClick={() => setAnalysisReport(null)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={16} /> Process New Video
          </button>
        )}
      </div>

      {/* FIX 1: LOCATION PERMISSION PROMPT BANNER */}
      <LocationPermissionPrompt
        locationState={locationState}
        coords={browserCoords}
        onRequestPermission={requestBrowserLocation}
        onManualLocationSelect={(pt) => {
          setBrowserCoords(pt);
          setLocationState('granted');
          setMapStartPoint(pt);
        }}
      />

      {/* 5-STEP PROCESSING PIPELINE STEPPER */}
      <ProcessingStepper
        currentStep={currentStep}
        isProcessing={isProcessing}
        error={error}
        stepStatus={stepStatusMap}
        stepMessage={stepMessage}
        onRetry={() => {
          if (file) handleUploadAndAnalyze({ preventDefault: () => {} });
          else handleRunDemoVideo();
        }}
      />

      {/* ========================================================
          RESULTS DASHBOARD (RENDERED ONCE PROCESSING FINISHES)
         ======================================================== */}
      {analysisReport && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Deduplication Milestone Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.15) 100%)',
              border: '2px solid #10b981',
              borderRadius: '10px',
              padding: '1rem 1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: '#10b981', color: '#fff', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <GitMerge size={20} />
              </div>
              <div>
                <strong style={{ fontSize: '1rem', color: '#f1f5f9' }}>
                  ST-DBSCAN Spatio-Temporal Deduplication Completed!
                </strong>
                <div style={{ fontSize: '0.8rem', color: '#6ee7b7' }}>
                  {analysisReport.rawDetectionsCount} raw observations clustered into{' '}
                  <strong>{analysisReport.incidentsCount} unique incident(s)</strong> &bull;{' '}
                  {analysisReport.dedupReductionPercent}% duplicate noise reduction
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {analysisReport.sessionId && (
                <Link
                  to={`/sessions/${analysisReport.sessionId}`}
                  className="btn btn-primary"
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
                >
                  <Eye size={14} /> View Session Detail
                </Link>
              )}
              <button
                onClick={() => window.print()}
                className="btn"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#0284c7', color: '#fff' }}
              >
                <FileText size={14} /> Print / Save PDF
              </button>
              <button
                onClick={() => exportToJSON(analysisReport, `incidents_report_${Date.now()}.json`)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Download size={14} /> Export JSON
              </button>
              <button
                onClick={() => exportToCSV(analysisReport.incidents, `incidents_${Date.now()}.csv`)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Download size={14} /> Export CSV
              </button>
              <button
                onClick={() => exportToGeoJSON(analysisReport.routePoints, analysisReport.incidents, `incidents_gis_${Date.now()}.geojson`)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Download size={14} /> Export GeoJSON
              </button>
            </div>
          </div>

          {/* Summary Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <div className="card" style={{ borderLeft: '4px solid #0284c7', padding: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.7rem' }}>
                <span>TOTAL DISTANCE</span>
                <Navigation size={16} color="#0284c7" />
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '0.2rem' }}>
                {analysisReport.totalDistanceKm} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>km</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#0284c7' }}>{analysisReport.totalDistanceMeters}m</div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #8b5cf6', padding: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.7rem' }}>
                <span>RAW DETECTIONS</span>
                <Eye size={16} color="#8b5cf6" />
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '0.2rem' }}>
                {analysisReport.rawDetectionsCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#7c3aed' }}>Prior to clustering</div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #10b981', padding: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.7rem' }}>
                <span>CONSOLIDATED INCIDENTS</span>
                <GitMerge size={16} color="#10b981" />
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '0.2rem' }}>
                {analysisReport.incidentsCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#059669' }}>ST-DBSCAN merged</div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #ef4444', padding: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.7rem' }}>
                <span>POTHOLE INCIDENTS</span>
                <span style={{ color: '#ef4444', fontWeight: 800 }}>⬤</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444', marginTop: '0.2rem' }}>
                {analysisReport.incidents.filter((i) => (i.hazard_type || i.class || '').toLowerCase().includes('pothole')).length}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Crimson markers</div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #d97706', padding: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.7rem' }}>
                <span>CRACK INCIDENTS</span>
                <span style={{ color: '#d97706', fontWeight: 800 }}>⚡</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '0.2rem' }}>
                {analysisReport.incidents.filter((i) => (i.hazard_type || i.class || '').toLowerCase().includes('crack')).length}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Amber markers</div>
            </div>
          </div>

          {/* Executive Summary Banner */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              borderRadius: '8px',
              padding: '0.85rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Sparkles size={18} color="#0284c7" />
              <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>
                Road Defect Summary:{' '}
                <strong style={{ color: '#ef4444' }}>{analysisReport.potholesCount} Potholes</strong>,{' '}
                <strong style={{ color: '#d97706' }}>{analysisReport.cracksCount} Cracks</strong>
                {analysisReport.otherHazardsCount > 0 && `, ${analysisReport.otherHazardsCount} Other Hazards`}
                {' '}identified along <strong style={{ color: '#0284c7' }}>{analysisReport.totalDistanceKm} km</strong> ({analysisReport.totalDistanceMeters} m) of roadway.
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              ST-DBSCAN Deduplication:{' '}
              <strong style={{ color: '#059669' }}>{analysisReport.dedupReductionPercent}%</strong> (Filtered {Math.max(0, analysisReport.rawDetectionsCount - analysisReport.incidentsCount)} duplicate frame observations)
            </div>
          </div>

          {/* Zero Defects State */}
          {analysisReport.incidentsCount === 0 && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '8px',
                padding: '1.5rem',
                textAlign: 'center',
              }}
            >
              <CheckCircle size={32} color="#10b981" style={{ margin: '0 auto 0.5rem' }} />
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                No Potholes Detected
              </div>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.3rem 0 0' }}>
                Computer vision analysis of all sampled road frames confirmed smooth surface conditions with 0 structural road hazards.
              </p>
            </div>
          )}

          {/* Route Map with Incidents */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Compass size={18} color="#0284c7" />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Municipal Incident GIS Map (ST-DBSCAN Deduplicated)
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#ef4444' }}>
                  ⬤ Pothole Incident
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#d97706' }}>
                  ⚡ Road Crack Incident
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#0284c7' }}>
                  ━ Route Track ({analysisReport.totalDistanceKm} km)
                </span>
              </div>
            </div>

            <RouteDefectsMap
              routeCoordinates={analysisReport.routePoints}
              defects={analysisReport.incidents}
              startPoint={analysisReport.routePoints[0]}
              endPoint={analysisReport.routePoints[analysisReport.routePoints.length - 1]}
              height="400px"
            />
          </div>

          {/* Annotated Sample Frames Gallery (Computer Vision Bounding Boxes) */}
          {analysisReport.annotatedSamples && analysisReport.annotatedSamples.length > 0 && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Eye size={18} color="#0284c7" />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Annotated Sample Frames (Real Computer Vision Bounding Boxes)
                  </h3>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {analysisReport.annotatedSamples.length} Sample Frame{analysisReport.annotatedSamples.length > 1 ? 's' : ''} Extracted
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                {analysisReport.annotatedSamples.map((sample, idx) => {
                  const isCrack = (sample.class || '').toLowerCase().includes('crack');
                  return (
                    <div
                      key={idx}
                      style={{
                        background: '#ffffff',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div style={{ position: 'relative', height: '160px', background: '#000' }}>
                        <img
                          src={resolveMediaUrl(sample.thumbnail_path)}
                          alt={`Hazard frame at ${sample.video_offset_s || sample.timestamp_s || 0}s`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            background: isCrack ? 'rgba(217, 119, 6, 0.95)' : 'rgba(220, 38, 38, 0.95)',
                            color: '#fff',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '3px 7px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                          }}
                        >
                          {isCrack ? '⚡ Road Crack' : '⬤ Pothole'}
                        </span>
                        <span
                          style={{
                            position: 'absolute',
                            bottom: '8px',
                            right: '8px',
                            background: 'rgba(15, 23, 42, 0.85)',
                            color: '#38bdf8',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          Conf: {Math.round((sample.confidence || 0) * 100)}%
                        </span>
                      </div>
                      <div style={{ padding: '0.65rem 0.85rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', background: '#f8fafc' }}>
                        <span>Time: <strong style={{ color: '#0f172a' }}>{sample.video_offset_s || sample.timestamp_s || 0}s</strong></span>
                        <span>Chainage: <strong style={{ color: '#0284c7' }}>{sample.chainage_m || 0}m</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabs for Deduplicated Incidents vs Raw Detections */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setActiveResultsTab('incidents')}
                  className="btn"
                  style={{
                    padding: '0.4rem 0.8rem',
                    fontSize: '0.8rem',
                    background: activeResultsTab === 'incidents' ? '#0284c7' : '#f1f5f9',
                    color: activeResultsTab === 'incidents' ? '#fff' : '#64748b',
                  }}
                >
                  Consolidated Incidents ({analysisReport.incidents.length})
                </button>
                <button
                  onClick={() => setActiveResultsTab('raw_detections')}
                  className="btn"
                  style={{
                    padding: '0.4rem 0.8rem',
                    fontSize: '0.8rem',
                    background: activeResultsTab === 'raw_detections' ? '#0284c7' : '#f1f5f9',
                    color: activeResultsTab === 'raw_detections' ? '#fff' : '#64748b',
                  }}
                >
                  Raw Detections Before Dedup ({analysisReport.rawDetections.length})
                </button>
              </div>

              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {activeResultsTab === 'incidents'
                  ? 'Grouped within \u2264 5m and \u2264 10s'
                  : 'Individual camera frames prior to clustering'}
              </span>
            </div>

            {/* TAB 1: CONSOLIDATED INCIDENTS */}
            {activeResultsTab === 'incidents' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '0.6rem' }}>Incident Code</th>
                      <th style={{ padding: '0.6rem' }}>Hazard Type</th>
                      <th style={{ padding: '0.6rem' }}>Video Time</th>
                      <th style={{ padding: '0.6rem' }}>Detections Merged</th>
                      <th style={{ padding: '0.6rem' }}>Max Confidence</th>
                      <th style={{ padding: '0.6rem' }}>Damage Dimensions</th>
                      <th style={{ padding: '0.6rem' }}>Chainage</th>
                      <th style={{ padding: '0.6rem' }}>Centroid GPS</th>
                      <th style={{ padding: '0.6rem' }}>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisReport.incidents.length === 0 && (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                          <CheckCircle size={24} color="#10b981" style={{ margin: '0 auto 0.5rem' }} />
                          <div style={{ color: '#0f172a', fontWeight: 600 }}>No potholes detected</div>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No structural anomalies recorded in database</span>
                        </td>
                      </tr>
                    )}
                    {analysisReport.incidents.map((inc) => {
                      const isCrack = (inc.hazard_type || inc.class || '').toLowerCase().includes('crack');
                      const latStr = typeof (inc.latitude ?? inc.lat) === 'number' ? (inc.latitude ?? inc.lat).toFixed(5) : '0.00000';
                      const lonStr = typeof (inc.longitude ?? inc.lng ?? inc.lon) === 'number' ? (inc.longitude ?? inc.lng ?? inc.lon).toFixed(5) : '0.00000';
                      const dimText = inc.estimated_width_m !== undefined && inc.estimated_length_m !== undefined
                        ? `${inc.estimated_width_m}m × ${inc.estimated_length_m}m (${inc.estimated_area_m2 || 0} m²)`
                        : (inc.avg_width_cm ? `${inc.avg_width_cm} cm × ${inc.avg_length_cm} cm` : 'N/A');

                      return (
                        <tr key={inc.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#ffffff' }}>
                          <td style={{ padding: '0.6rem', fontWeight: 700, color: '#0284c7' }}>{inc.incident_code || `INC-${inc.id}`}</td>
                          <td style={{ padding: '0.6rem' }}>
                            <span
                              style={{
                                background: isCrack ? '#fef3c7' : '#fee2e2',
                                color: isCrack ? '#b45309' : '#dc2626',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                              }}
                            >
                              {isCrack ? '⚡ Road Crack' : '⬤ Pothole'}
                            </span>
                          </td>
                          <td style={{ padding: '0.6rem', color: '#475569' }}>
                            {inc.video_timestamp || `${inc.video_offset_s ?? 0}s`}
                          </td>
                          <td style={{ padding: '0.6rem', color: '#0f172a' }}>
                            <span style={{ background: '#f1f5f9', color: '#0f172a', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                              {inc.detection_count || 1} frame{(inc.detection_count || 1) > 1 ? 's' : ''}
                            </span>
                          </td>
                          <td style={{ padding: '0.6rem', color: '#059669', fontWeight: 600 }}>
                            {Math.round((inc.confidence || inc.max_confidence || 0) * 100)}%
                          </td>
                          <td style={{ padding: '0.6rem', color: '#475569' }}>
                            {dimText}
                          </td>
                          <td style={{ padding: '0.6rem', fontWeight: 700, color: '#0284c7' }}>
                            {inc.chainageLabel || `${inc.chainage_m || 0} m`}
                          </td>
                          <td style={{ padding: '0.6rem', color: '#64748b', fontFamily: 'monospace' }}>
                            {latStr}, {lonStr}
                          </td>
                          <td style={{ padding: '0.6rem' }}>
                            <span
                              style={{
                                background: (inc.severity || 'MEDIUM').toUpperCase() === 'CRITICAL' ? '#ef4444' : (inc.severity || 'MEDIUM').toUpperCase() === 'HIGH' ? '#f59e0b' : '#3b82f6',
                                color: '#fff',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '3px',
                              }}
                            >
                              {(inc.severity || 'MEDIUM').toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 2: RAW DETECTIONS */}
            {activeResultsTab === 'raw_detections' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '0.6rem' }}>Det #</th>
                      <th style={{ padding: '0.6rem' }}>Class</th>
                      <th style={{ padding: '0.6rem' }}>Confidence</th>
                      <th style={{ padding: '0.6rem' }}>Timestamp</th>
                      <th style={{ padding: '0.6rem' }}>Chainage</th>
                      <th style={{ padding: '0.6rem' }}>Coordinates</th>
                      <th style={{ padding: '0.6rem' }}>Dimensions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisReport.rawDetections.map((d) => {
                      const dLatStr = typeof (d.lat ?? d.latitude) === 'number' ? (d.lat ?? d.latitude).toFixed(5) : '0.00000';
                      const dLonStr = typeof (d.lon ?? d.lng ?? d.longitude) === 'number' ? (d.lon ?? d.lng ?? d.longitude).toFixed(5) : '0.00000';
                      const dDimStr = d.estimated_dimensions
                        ? `${d.estimated_dimensions.width_m}m × ${d.estimated_dimensions.length_m}m`
                        : (d.width_cm ? `${d.width_cm} cm × ${d.length_cm} cm` : 'N/A');

                      return (
                        <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#ffffff' }}>
                          <td style={{ padding: '0.6rem', color: '#64748b' }}>{d.id}</td>
                          <td style={{ padding: '0.6rem', color: '#0f172a' }}>{d.class}</td>
                          <td style={{ padding: '0.6rem', color: '#059669' }}>{Math.round((d.confidence || 0) * 100)}%</td>
                          <td style={{ padding: '0.6rem', color: '#475569' }}>{d.video_offset_s ?? d.timestamp_seconds ?? 0}s</td>
                          <td style={{ padding: '0.6rem', color: '#0284c7' }}>{d.chainageLabel || `${d.chainage_m || 0} m`}</td>
                          <td style={{ padding: '0.6rem', color: '#64748b', fontFamily: 'monospace' }}>
                            {dLatStr}, {dLonStr}
                          </td>
                          <td style={{ padding: '0.6rem', color: '#475569' }}>
                            {dDimStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => navigate('/incidents')} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
                View Municipal Incident Center &rarr;
              </button>
              <button onClick={() => navigate('/analytics')} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
                View City Analytics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          VIDEO UPLOAD & CONFIGURATION FORM
         ======================================================== */}
      {!analysisReport && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1.5rem' }}>
          {/* Left Column: Video Ingestion Box */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              1. Video File Ingestion
            </h2>

            <div
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: '10px',
                padding: '2rem 1.5rem',
                textAlign: 'center',
                background: '#f8fafc',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
              }}
              onClick={() => document.getElementById('video-input').click()}
            >
              <UploadCloud size={40} color="#0284c7" />
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                  {file ? file.name : 'Upload Road Video (MP4 / MOV / WebM)'}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Recorded via smartphone camera or dashboard mount (up to 100MB)
                </span>
              </div>
              {file && (
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#0284c7' }}>
                  <span>Size: {(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                  <span>&bull;</span>
                  <span>Duration: ~{videoDuration}s</span>
                </div>
              )}
              <input
                id="video-input"
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                style={{ display: 'none' }}
                onChange={handleVideoFileChange}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>OR USE BUILT-IN DEMO</span>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            </div>

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleRunDemoVideo}
              className="btn btn-demo"
              style={{ padding: '0.85rem', width: '100%', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <Sparkles size={18} />
              Run With Built-in Demo Video (Pune Route 01)
            </button>

            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#334155', marginBottom: '0.3rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Sliders size={14} /> Sampling Interval:
                </span>
                <strong style={{ color: '#0284c7' }}>{intervalSec}s (~{(1 / intervalSec).toFixed(1)} fps)</strong>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.5"
                step="0.1"
                value={intervalSec}
                onChange={(e) => setIntervalSec(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.3rem' }}>
                Samples ~3-5 fps to accurately detect hazards without duplicate computation.
              </div>
            </div>

            <button
              type="button"
              disabled={!file || isProcessing}
              onClick={handleUploadAndAnalyze}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.85rem', fontSize: '0.9rem', marginTop: 'auto' }}
            >
              {isProcessing ? 'Processing 5-Step Pipeline...' : 'Upload Video & Run AI Pipeline'}
            </button>
          </div>

          {/* Right Column: Distance Source Selection */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                2. Distance Source Resolution (Priority 1-4)
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                The pipeline resolves distance and attaches coordinates in strict priority order:
              </span>
            </div>

            {/* Source 1: Embedded GPS Metadata */}
            <div
              onClick={() => setSelectedSourceType('embedded')}
              style={{
                border: selectedSourceType === 'embedded' ? '1px solid #0284c7' : '1px solid #e2e8f0',
                background: selectedSourceType === 'embedded' ? '#f0f9ff' : '#ffffff',
                padding: '0.75rem',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                  <input
                    type="radio"
                    name="distance_source"
                    value="embedded"
                    checked={selectedSourceType === 'embedded'}
                    onChange={() => setSelectedSourceType('embedded')}
                  />
                  <span>1. Embedded GPS Metadata in Video</span>
                </label>
                <span style={{ fontSize: '0.65rem', background: '#0284c7', color: '#fff', padding: '1px 6px', borderRadius: '3px' }}>
                  PRIORITY 1
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.3rem 0 0 1.5rem' }}>
                Extracts MP4 udta / ISO 6709 coordinate location or GoPro GPMF metadata.
              </p>
            </div>

            {/* Source 2: Sidecar Track File */}
            <div
              onClick={() => setSelectedSourceType('sidecar')}
              style={{
                border: selectedSourceType === 'sidecar' ? '1px solid #0284c7' : '1px solid #e2e8f0',
                background: selectedSourceType === 'sidecar' ? '#f0f9ff' : '#ffffff',
                padding: '0.75rem',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                  <input
                    type="radio"
                    name="distance_source"
                    value="sidecar"
                    checked={selectedSourceType === 'sidecar'}
                    onChange={() => setSelectedSourceType('sidecar')}
                  />
                  <span>2. Sidecar Track File (.gpx, .srt, .nmea, .csv)</span>
                </label>
                <span style={{ fontSize: '0.65rem', background: '#0284c7', color: '#fff', padding: '1px 6px', borderRadius: '3px' }}>
                  PRIORITY 2
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.3rem 0 0 1.5rem' }}>
                Upload GPX/SRT/CSV with timestamps. Synchronizes track time to video time.
              </p>

              {selectedSourceType === 'sidecar' && (
                <div style={{ margin: '0.5rem 0 0 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      id="sidecar-input"
                      type="file"
                      accept=".gpx,.csv,.srt,.nmea,.log"
                      style={{ display: 'none' }}
                      onChange={handleSidecarFileChange}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        document.getElementById('sidecar-input').click();
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <FileSpreadsheet size={14} /> Browse Track File
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadDemoGpx();
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', color: '#0284c7' }}
                    >
                      Use Sample GPX
                    </button>
                  </div>
                  {sidecarTrack && (
                    <div style={{ color: '#059669', fontSize: '0.75rem', fontWeight: 600 }}>
                      ✓ Track Loaded: {sidecarFileName} ({sidecarTrack.points.length} waypoints)
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Source 3: Map Fallback */}
            <div
              onClick={() => setSelectedSourceType('map')}
              style={{
                border: selectedSourceType === 'map' ? '1px solid #0284c7' : '1px solid #e2e8f0',
                background: selectedSourceType === 'map' ? '#f0f9ff' : '#ffffff',
                padding: '0.75rem',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                  <input
                    type="radio"
                    name="distance_source"
                    value="map"
                    checked={selectedSourceType === 'map'}
                    onChange={() => setSelectedSourceType('map')}
                  />
                  <span>3. Map Fallback (Tap START & END on Map)</span>
                </label>
                <span style={{ fontSize: '0.65rem', background: '#3b82f6', color: '#fff', padding: '1px 6px', borderRadius: '3px' }}>
                  PRIORITY 3
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.3rem 0 0 1.5rem' }}>
                Pick START and END points; computes road distance via public OSRM + Haversine.
              </p>

              {selectedSourceType === 'map' && (
                <div style={{ margin: '0.5rem 0 0 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMapPickingMode('start');
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                    >
                      Set START
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMapPickingMode('end');
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                    >
                      Set END
                    </button>
                  </div>
                  <div style={{ height: '170px', borderRadius: '6px', overflow: 'hidden' }}>
                    <RouteDefectsMap
                      routeCoordinates={osrmRouteData?.coordinates || [mapStartPoint, mapEndPoint]}
                      startPoint={mapStartPoint}
                      endPoint={mapEndPoint}
                      pickingMode={mapPickingMode}
                      onPickPoint={handlePickMapPoint}
                      height="170px"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Source 4: Manual Fallback */}
            <div
              onClick={() => setSelectedSourceType('manual')}
              style={{
                border: selectedSourceType === 'manual' ? '1px solid #d97706' : '1px solid #e2e8f0',
                background: selectedSourceType === 'manual' ? '#fffbeb' : '#ffffff',
                padding: '0.75rem',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                  <input
                    type="radio"
                    name="distance_source"
                    value="manual"
                    checked={selectedSourceType === 'manual'}
                    onChange={() => setSelectedSourceType('manual')}
                  />
                  <span>4. Manual Fallback (Speed &times; Duration)</span>
                </label>
                <span style={{ fontSize: '0.65rem', background: '#d97706', color: '#fff', padding: '1px 6px', borderRadius: '3px' }}>
                  PRIORITY 4 [ESTIMATED]
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.3rem 0 0 1.5rem' }}>
                User specifies average vehicle speed or known road length.
              </p>

              {selectedSourceType === 'manual' && (
                <div style={{ margin: '0.5rem 0 0 1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#64748b' }}>Average Speed (km/h)</label>
                    <input
                      type="number"
                      value={manualSpeedKmh}
                      onChange={(e) => setManualSpeedKmh(e.target.value)}
                      style={{ width: '100%', padding: '0.35rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#0f172a', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#64748b' }}>Or Road Length (meters)</label>
                    <input
                      type="number"
                      placeholder="e.g. 500"
                      value={manualKnownLengthM}
                      onChange={(e) => setManualKnownLengthM(e.target.value)}
                      style={{ width: '100%', padding: '0.35rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#0f172a', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Upload;
