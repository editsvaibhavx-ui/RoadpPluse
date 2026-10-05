/**
 * Unit Tests for ST-DBSCAN Spatio-Temporal Deduplication Engine
 * Verifies:
 * 1. Haversine distance in meters
 * 2. Known spatial & temporal clusters collapse into 1 incident
 * 3. Same-class separation (pothole and crack at exact same spot do not merge)
 * 4. Time-window separation (detections > eps2 apart form separate incidents)
 * 5. Noise handling (singletons are preserved as incidents, not dropped)
 * 6. Empty input handling (returns empty without crashing)
 */

import { haversineDistanceMeters, runSTDBSCAN, synthesizeIncidents } from './stdbscan.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failed++;
  }
}

console.log('--- RUNNING ST-DBSCAN UNIT TESTS ---\n');

// 1. Haversine Distance in Meters
console.log('1. Haversine Metric Distance:');
const d1 = haversineDistanceMeters(18.5204, 73.8567, 18.5204, 73.8567);
assert(d1 === 0, 'Identical coordinates return 0 meters');

// 0.000045 degrees lat is ~5.0 meters
const d2 = haversineDistanceMeters(18.5204, 73.8567, 18.520445, 73.8567);
assert(d2 >= 4.5 && d2 <= 5.5, `Small displacement is ~5m (actual: ${d2}m)`);

// 2. Known Spatial & Temporal Clusters Collapse into 1 Incident
console.log('\n2. Known Clusters (Same Pothole across 4 video frames):');
const framesOfSamePothole = [
  { id: 'd1', hazard_type: 'pothole', confidence: 0.91, latitude: 18.520400, longitude: 73.856700, timestamp_seconds: 2.0 },
  { id: 'd2', hazard_type: 'pothole', confidence: 0.94, latitude: 18.520410, longitude: 73.856705, timestamp_seconds: 2.5 },
  { id: 'd3', hazard_type: 'pothole', confidence: 0.96, latitude: 18.520420, longitude: 73.856710, timestamp_seconds: 3.0 },
  { id: 'd4', hazard_type: 'pothole', confidence: 0.92, latitude: 18.520425, longitude: 73.856715, timestamp_seconds: 3.5 },
];

const clusterRes = runSTDBSCAN(framesOfSamePothole, { eps1: 5.0, eps2: 10.0, minPts: 2 });
assert(clusterRes.clusters.length === 1, `4 consecutive detections form exactly 1 cluster (found: ${clusterRes.clusters.length})`);
assert(clusterRes.clusters[0].length === 4, `Cluster contains all 4 detections`);

const incidents = synthesizeIncidents(clusterRes.clusters, clusterRes.noise);
assert(incidents.length === 1, `Synthesized exactly 1 incident`);
assert(incidents[0].detection_count === 4, `Incident records detection_count = 4`);
assert(incidents[0].confidence === 0.96, `Incident takes maximum confidence (0.96)`);

// 3. Same-Class Separation (Pothole vs Road Crack at same location & time)
console.log('\n3. Same-Class Separation:');
const mixedHazards = [
  { id: 'p1', hazard_type: 'pothole', confidence: 0.90, latitude: 18.520400, longitude: 73.856700, timestamp_seconds: 5.0 },
  { id: 'p2', hazard_type: 'pothole', confidence: 0.92, latitude: 18.520405, longitude: 73.856705, timestamp_seconds: 5.5 },
  { id: 'c1', hazard_type: 'road crack', confidence: 0.88, latitude: 18.520400, longitude: 73.856700, timestamp_seconds: 5.0 },
  { id: 'c2', hazard_type: 'road crack', confidence: 0.89, latitude: 18.520405, longitude: 73.856705, timestamp_seconds: 5.5 },
];

const mixedRes = runSTDBSCAN(mixedHazards, { eps1: 5.0, eps2: 10.0, minPts: 2 });
assert(mixedRes.clusters.length === 2, `Forms 2 separate clusters for different hazard classes (found: ${mixedRes.clusters.length})`);

const mixedIncidents = synthesizeIncidents(mixedRes.clusters, mixedRes.noise);
const classes = mixedIncidents.map((i) => i.hazard_type);
assert(classes.includes('pothole') && classes.includes('road crack'), 'Preserved both distinct classes');

// 4. Time-Window Separation (Same location, but 30 seconds apart > eps2 of 10s)
console.log('\n4. Time-Window Separation:');
const timeSeparated = [
  { id: 't1', hazard_type: 'pothole', confidence: 0.90, latitude: 18.520400, longitude: 73.856700, timestamp_seconds: 0.0 },
  { id: 't2', hazard_type: 'pothole', confidence: 0.91, latitude: 18.520405, longitude: 73.856705, timestamp_seconds: 1.0 },
  // Pass 2: 30 seconds later
  { id: 't3', hazard_type: 'pothole', confidence: 0.92, latitude: 18.520400, longitude: 73.856700, timestamp_seconds: 30.0 },
  { id: 't4', hazard_type: 'pothole', confidence: 0.93, latitude: 18.520405, longitude: 73.856705, timestamp_seconds: 31.0 },
];

const timeRes = runSTDBSCAN(timeSeparated, { eps1: 5.0, eps2: 10.0, minPts: 2 });
assert(timeRes.clusters.length === 2, `Separates into 2 clusters because dt=30s > eps2=10s (found: ${timeRes.clusters.length})`);

// 5. Noise Handling (Singletons preserved as incidents, not dropped silently)
console.log('\n5. Noise / Singleton Handling:');
const withNoise = [
  // Cluster of 2
  { id: 'n1', hazard_type: 'pothole', confidence: 0.90, latitude: 18.520400, longitude: 73.856700, timestamp_seconds: 5.0 },
  { id: 'n2', hazard_type: 'pothole', confidence: 0.91, latitude: 18.520405, longitude: 73.856705, timestamp_seconds: 5.5 },
  // Isolated single detection 500m away
  { id: 'single1', hazard_type: 'pothole', confidence: 0.85, latitude: 18.525000, longitude: 73.860000, timestamp_seconds: 50.0 },
];

const noiseRes = runSTDBSCAN(withNoise, { eps1: 5.0, eps2: 10.0, minPts: 2 });
assert(noiseRes.clusters.length === 1, 'Found 1 dense cluster');
assert(noiseRes.noise.length === 1, 'Found 1 noise singleton point');

const allSynthesized = synthesizeIncidents(noiseRes.clusters, noiseRes.noise);
assert(allSynthesized.length === 2, `Synthesizes both cluster and singleton (total: ${allSynthesized.length})`);
assert(allSynthesized.some((i) => i.is_singleton === true), 'Singleton is explicitly marked with is_singleton: true');

// 6. Empty Input Edge Case
console.log('\n6. Empty Input Edge Case:');
const emptyRes = runSTDBSCAN([]);
assert(emptyRes.clusters.length === 0 && emptyRes.noise.length === 0, 'Empty input returns 0 clusters and 0 noise');
const emptyIncidents = synthesizeIncidents([], []);
assert(emptyIncidents.length === 0, 'Synthesizes empty incident array without errors');

console.log(`\n========================================`);
console.log(`ST-DBSCAN RESULTS: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
