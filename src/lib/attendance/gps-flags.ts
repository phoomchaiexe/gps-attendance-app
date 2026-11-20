// Heuristics that flag (never reject) a check-in whose GPS readings look like a mock location.
// Every value comes from the student's phone, so a determined spoofer can still fake jitter;
// these rules catch common pin-dropping apps without punishing real, noisy GPS.

export type GpsSample = { latitude: number; longitude: number; accuracy: number; timestamp: number };

// The phone takes a fresh reading every READ_INTERVAL_MS for READ_MIN_MS (longer if no fix has
// arrived yet), keeping up to MAX_SAMPLES.
export const READ_MIN_MS = 6000;
export const READ_INTERVAL_MS = 1500;
export const READ_MAX_MS = 20000;
export const MAX_SAMPLES = 10;

// A precise fix always jitters slightly between readings; coarse Wi-Fi/cell fixes can legitimately
// repeat, so "too still" and duplicate-coordinate checks only apply to precise readings.
export const PRECISE_ACCURACY_METERS = 20;
const MIN_SAMPLES_FOR_STILLNESS = 3;
const MIN_REAL_ACCURACY_METERS = 1;
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;

export const FLAG_STILL = 'พิกัดนิ่งผิดปกติ';
export const FLAG_ACCURACY = 'ความแม่นยำดีเกินจริง';
export const FLAG_CLOCK = 'เวลาพิกัดไม่ตรงกับเซิร์ฟเวอร์';
// Raised by submit_attendance in SQL, which can see other students' records in the same session.
export const FLAG_DUPLICATE = 'พิกัดซ้ำกับนักศึกษาคนอื่น';

export function gpsFlags(samples: GpsSample[], serverNow: number): string[] {
 if (!samples.length) return [];
 const flags: string[] = [];
 const last = samples[samples.length - 1];
 // Repeated readings are counted even when the browser re-serves the same cached fix: an active,
 // precise GPS delivers new fixes about once a second, so one frozen for the whole read is suspicious.
 const precise = samples.every(s => s.accuracy <= PRECISE_ACCURACY_METERS);
 if (precise && samples.length >= MIN_SAMPLES_FOR_STILLNESS && samples.every(s => s.latitude === last.latitude && s.longitude === last.longitude)) flags.push(FLAG_STILL);
 if (samples.some(s => s.accuracy < MIN_REAL_ACCURACY_METERS)) flags.push(FLAG_ACCURACY);
 if (Math.abs(serverNow - last.timestamp) > MAX_CLOCK_SKEW_MS) flags.push(FLAG_CLOCK);
 return flags;
}
