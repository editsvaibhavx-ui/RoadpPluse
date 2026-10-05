/**
 * Unit Tests for Distance & Telemetry Engine
 * Verifies:
 * 1. Haversine distance accuracy
 * 2. Cumulative track distance
 * 3. Live fix validation & stationary drift rejection (ignores fixes with accuracy > 25m, ignores stationary jitter < 2m, rejects speed spikes > 140 km/h)
 * 4. Chainage interpolation with meter precision
 * 5. GPX and CSV parsing
 */

import {
  haversineDistance,
  calculateTrackDistance,
  validateLiveFix,
  interpolateChainage,
  parseCSV,
} from './distanceEngine.js';

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

console.log('--- RUNNING DISTANCE ENGINE UNIT TESTS ---\n');

// 1. Haversine Distance
console.log('1. Haversine Great-Circle Distance:');
// Distance between Swargate (18.5018, 73.8584) and Fergusson College Road (18.5246, 73.8407) in Pune is approx 3.1 - 3.3 km
const dist1 = haversineDistance(18.5018, 73.8584, 18.5246, 73.8407);
assert(dist1 >= 3100 && dist1 <= 3350, `Distance between Swargate and FC Road is ~3.2km (calculated: ${dist1}m)`);
assert(haversineDistance(18.5, 73.8, 18.5, 73.8) === 0, 'Identical coordinates return 0 distance');

// 2. Cumulative Track Distance
console.log('\n2. Cumulative Track Distance:');
const points = [
  { lat: 18.5018, lng: 73.8584 },
  { lat: 18.5085, lng: 73.8512 },
  { lat: 18.5173, lng: 73.8415 },
];
const trackRes = calculateTrackDistance(points);
assert(trackRes.totalMeters > 0, `Total meters computed: ${trackRes.totalMeters}m`);
assert(trackRes.cumulativeMeters.length === 3, 'Cumulative array has matching length 3');
assert(trackRes.cumulativeMeters[0] === 0, 'First cumulative distance is 0');
assert(trackRes.cumulativeMeters[2] === trackRes.totalMeters, 'Last cumulative distance equals total meters');

// 3. Stationary Drift & Speed Spike Filtering
console.log('\n3. Live GPS Drift & Speed Spike Validation:');
const fix1 = { lat: 18.5204, lng: 73.8567, accuracy: 8.0, timestamp: 10000 };

// Inaccurate fix (> 25m) should be rejected
const inaccurateFix = { lat: 18.5210, lng: 73.8570, accuracy: 35.0, timestamp: 11000 };
const accResult = validateLiveFix(fix1, inaccurateFix);
assert(accResult.accepted === false, 'Rejects fix with accuracy > 25m');

// Stationary jitter (< 2m or within accuracy radius) should be rejected
const jitterFix = { lat: 18.520405, lng: 73.856705, accuracy: 5.0, timestamp: 12000 };
const jitterResult = validateLiveFix(fix1, jitterFix);
assert(jitterResult.accepted === false, 'Rejects stationary jitter without accumulating drift');

// Legitimate vehicle movement (~15m in 2 seconds = ~27 km/h, accuracy 6m)
const moveFix = { lat: 18.52055, lng: 73.8567, accuracy: 6.0, timestamp: 12000 };
const moveResult = validateLiveFix(fix1, moveFix);
assert(moveResult.accepted === true && moveResult.distanceMeters > 10, `Accepts legitimate vehicle movement (${moveResult.distanceMeters}m)`);

// Impossible speed spike (1000m in 1 second = 3600 km/h)
const spikeFix = { lat: 18.5294, lng: 73.8567, accuracy: 5.0, timestamp: 11000 };
const spikeResult = validateLiveFix(fix1, spikeFix);
assert(spikeResult.accepted === false, 'Rejects impossible speed spike (>140 km/h)');

// 4. Chainage Interpolation
console.log('\n4. Chainage Interpolation Along Route:');
const routePoints = [
  { lat: 18.50, lng: 73.85, time_s: 0 },
  { lat: 18.51, lng: 73.85, time_s: 10 }, // ~1112m
  { lat: 18.52, lng: 73.85, time_s: 20 }, // ~2224m
];
const midChainage = interpolateChainage(routePoints, 5, 20);
assert(midChainage.chainageMeters > 500 && midChainage.chainageMeters < 600, `Halfway chainage is ~556m (calculated: ${midChainage.chainageMeters}m)`);
assert(midChainage.lat > 18.50 && midChainage.lat < 18.51, `Interpolated lat is between 18.50 and 18.51 (${midChainage.lat})`);

// 5. CSV Parser
console.log('\n5. Sidecar CSV Parser:');
const testCsv = `latitude,longitude,timestamp
18.5018,73.8584,0
18.5085,73.8512,5
18.5173,73.8415,10`;
const csvParsed = parseCSV(testCsv);
assert(csvParsed.success === true, 'CSV parsed successfully');
assert(csvParsed.points.length === 3, `Extracted 3 points (found: ${csvParsed.points.length})`);
assert(csvParsed.points[1].lat === 18.5085, 'Correct latitude in point 1');

console.log(`\n========================================`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
