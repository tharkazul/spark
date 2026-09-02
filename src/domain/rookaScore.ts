/**
 * rooka scoring multipliers — the client half of the model.
 *
 * These tables MUST stay identical to `server/services/zones.js`. The workout
 * builder shows the athlete a number before anything is saved, and the server
 * computes the same number afterwards; if the two drift, a workout is planned
 * at one value and recorded at another, which is exactly the bug this replaced.
 */

export const BELOW_Z1_MULTIPLIER = 0.5;

/** Heart rate runs a 5-zone model. */
export const HR_ZONE_MULTIPLIER: Record<number, number> = {
  1: 1.0,
  2: 1.2,
  3: 1.3,
  4: 1.5,
  5: 1.5,
};

/**
 * Power runs Coggan's 7 zones. Zone 4 is threshold and sits with HR zone 3
 * rather than with the hard bucket — the two scales are not aligned by number.
 */
export const POWER_ZONE_MULTIPLIER: Record<number, number> = {
  1: 1.0,
  2: 1.2,
  3: 1.3,
  4: 1.3,
  5: 1.5,
  6: 1.5,
  7: 1.5,
};

export interface ZoneBand {
  zone: number;
  min: number;
  max: number | null;
}

export function hrMultiplier(zone: number | null): number | null {
  if (zone == null) return null;
  if (zone === 0) return BELOW_Z1_MULTIPLIER;
  return HR_ZONE_MULTIPLIER[zone] ?? 1.0;
}

export function powerMultiplier(zone: number | null): number | null {
  if (zone == null) return null;
  if (zone === 0) return BELOW_Z1_MULTIPLIER;
  return POWER_ZONE_MULTIPLIER[zone] ?? 1.0;
}

/** Which zone a measured value falls into; 0 means below zone 1. */
export function zoneOf(value?: number | null, zones?: ZoneBand[] | null): number | null {
  const v = Number(value);
  if (!v || v <= 0 || !zones || zones.length === 0) return null;
  const sorted = [...zones].sort((a, b) => a.zone - b.zone);
  if (v < sorted[0].min) return 0;
  for (const z of sorted) {
    const upper = z.max == null ? Infinity : z.max;
    if (v >= z.min && v < upper) return z.zone;
  }
  return sorted[sorted.length - 1].zone;
}

/** The harder of the two signals wins. */
export function effortMultiplier(hrZone: number | null, powerZone: number | null): number | null {
  const candidates = [hrMultiplier(hrZone), powerMultiplier(powerZone)].filter(
    (m): m is number => m != null
  );
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

/** The multiplier a planned step earns from the zone it targets. */
export function stepMultiplier(
  targetType?: string,
  zone?: number | null,
  targetValue?: string | number | null,
  powerZones?: ZoneBand[] | null
): number {
  const z = Number(zone) || null;

  if (targetType === 'heart.rate.zone' || targetType === 'pace.zone' || targetType === 'speed.zone') {
    return hrMultiplier(z ?? 2) ?? 1.0;
  }
  if (targetType === 'power.zone') {
    return powerMultiplier(z ?? 2) ?? 1.0;
  }
  if (targetType === 'power.exact') {
    const watts = parseFloat(String(targetValue ?? '').replace(/[^0-9.]/g, ''));
    const resolved = zoneOf(watts, powerZones);
    return powerMultiplier(resolved) ?? 1.3;
  }
  if (targetType === 'pace.exact') return 1.3;
  // Untargeted work is easy aerobic.
  return 1.0;
}

/** Default zone tables, mirroring the server's seeds. */
export function buildHrZones(maxHr?: number | null): ZoneBand[] | null {
  if (!maxHr || maxHr <= 0) return null;
  const bands = [
    [1, 0.5, 0.6],
    [2, 0.6, 0.7],
    [3, 0.7, 0.8],
    [4, 0.8, 0.9],
    [5, 0.9, 1.0],
  ];
  return bands.map(([zone, lo, hi]) => ({
    zone,
    min: Math.round(maxHr * lo),
    max: Math.round(maxHr * hi),
  }));
}

export function buildPowerZones(ftp?: number | null): ZoneBand[] | null {
  if (!ftp || ftp <= 0) return null;
  const bands: [number, number, number | null][] = [
    [1, 0.0, 0.55],
    [2, 0.55, 0.75],
    [3, 0.75, 0.9],
    [4, 0.9, 1.05],
    [5, 1.05, 1.2],
    [6, 1.2, 1.5],
    [7, 1.5, null],
  ];
  return bands.map(([zone, lo, hi]) => ({
    zone,
    min: Math.round(ftp * lo),
    max: hi == null ? null : Math.round(ftp * hi),
  }));
}

/** 220 - age. */
export function maxHrFromAge(age?: number | null): number | null {
  const a = Number(age);
  if (!a || a <= 0 || a > 120) return null;
  return Math.round(220 - a);
}

export function ageFromDateOfBirth(dob?: string | null, now: Date = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age > 0 && age < 120 ? age : null;
}
