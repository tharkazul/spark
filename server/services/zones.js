/**
 * Training zones and Rooka scoring.
 *
 * One model, used for both sides of the comparison:
 *   - a PLANNED workout scores from the zones its steps target
 *   - a COMPLETED activity scores from the zones its averages fall into
 *
 * Before this, planned targets were a number the LLM invented and actuals were
 * `minutes x (1 + an HR bonus)`. The two never shared a scale, which is why a
 * 45-minute ride could be planned at 30 and completed at 28 while the workout
 * builder said 54 for the same session.
 *
 *   Rooka = sum over steps of ( minutes x multiplier(effort) )
 *
 * Effort is the HARDER of the heart-rate zone and the power zone, so a ride
 * recorded with power but no HR still scores correctly, and vice versa.
 */

// Multipliers by zone. Heart rate runs on a 5-zone model and power on Coggan's
// 7, so the two scales are mapped onto one effort ladder rather than compared
// by zone number. Power Z4 (threshold) sits with HR Z3 rather than with the
// hard bucket — physiologically that is where it belongs.
const BELOW_Z1_MULTIPLIER = 0.5;

const HR_ZONE_MULTIPLIER = { 1: 1.0, 2: 1.2, 3: 1.3, 4: 1.5, 5: 1.5 };
const POWER_ZONE_MULTIPLIER = { 1: 1.0, 2: 1.2, 3: 1.3, 4: 1.3, 5: 1.5, 6: 1.5, 7: 1.5 };

// Percentage-of-maximum bands used to seed a new athlete's tables.
const HR_DEFAULT_BANDS = [
  { zone: 1, lo: 0.5, hi: 0.6 },
  { zone: 2, lo: 0.6, hi: 0.7 },
  { zone: 3, lo: 0.7, hi: 0.8 },
  { zone: 4, lo: 0.8, hi: 0.9 },
  { zone: 5, lo: 0.9, hi: 1.0 },
];

const POWER_DEFAULT_BANDS = [
  { zone: 1, lo: 0.0, hi: 0.55 },
  { zone: 2, lo: 0.55, hi: 0.75 },
  { zone: 3, lo: 0.75, hi: 0.9 },
  { zone: 4, lo: 0.9, hi: 1.05 },
  { zone: 5, lo: 1.05, hi: 1.2 },
  { zone: 6, lo: 1.2, hi: 1.5 },
  { zone: 7, lo: 1.5, hi: 99 },
];

/** 220 - age. Coarse, but it is the standard field athletes can actually answer. */
function maxHrFromAge(age) {
  const a = Number(age);
  if (!a || a <= 0 || a > 120) return null;
  return Math.round(220 - a);
}

function ageFromDateOfBirth(dob, now = new Date()) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age > 0 && age < 120 ? age : null;
}

function buildHrZones(maxHr) {
  if (!maxHr || maxHr <= 0) return null;
  return HR_DEFAULT_BANDS.map((b) => ({
    zone: b.zone,
    min: Math.round(maxHr * b.lo),
    max: Math.round(maxHr * b.hi),
  }));
}

function buildPowerZones(ftp) {
  if (!ftp || ftp <= 0) return null;
  return POWER_DEFAULT_BANDS.map((b) => ({
    zone: b.zone,
    min: Math.round(ftp * b.lo),
    max: b.hi >= 99 ? null : Math.round(ftp * b.hi),
  }));
}

/**
 * Which zone a measured value falls into.
 * Returns 0 for "below zone 1", or null when there is no table or no value.
 */
function zoneOf(value, zones) {
  const v = Number(value);
  if (!v || v <= 0 || !Array.isArray(zones) || zones.length === 0) return null;
  const sorted = [...zones].sort((a, b) => a.zone - b.zone);
  if (v < sorted[0].min) return 0;
  for (const z of sorted) {
    const upper = z.max == null ? Infinity : z.max;
    if (v >= z.min && v < upper) return z.zone;
  }
  return sorted[sorted.length - 1].zone;
}

function hrMultiplier(zone) {
  if (zone == null) return null;
  if (zone === 0) return BELOW_Z1_MULTIPLIER;
  return HR_ZONE_MULTIPLIER[zone] ?? 1.0;
}

function powerMultiplier(zone) {
  if (zone == null) return null;
  if (zone === 0) return BELOW_Z1_MULTIPLIER;
  return POWER_ZONE_MULTIPLIER[zone] ?? 1.0;
}

/**
 * The harder of the two signals wins. Comparing multipliers rather than zone
 * numbers is deliberate: HR zone 4 and power zone 4 are not the same effort.
 */
function effortMultiplier({ hrZone = null, powerZone = null } = {}) {
  const candidates = [hrMultiplier(hrZone), powerMultiplier(powerZone)].filter(
    (m) => m != null
  );
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

/**
 * Score a completed activity from its averages.
 *
 * `fallbackMultiplier` applies when the athlete has no zone tables yet or the
 * activity carries neither HR nor power — the session still happened, so it
 * scores its minutes at an easy-aerobic weighting rather than zero.
 */
function scoreActivity({
  movingMinutes,
  avgHr = null,
  avgWatts = null,
  hrZones = null,
  powerZones = null,
  fallbackMultiplier = 1.0,
}) {
  const minutes = Number(movingMinutes);
  if (!minutes || minutes <= 0) return 0;

  const multiplier =
    effortMultiplier({
      hrZone: zoneOf(avgHr, hrZones),
      powerZone: zoneOf(avgWatts, powerZones),
    }) ?? fallbackMultiplier;

  return Math.round(minutes * multiplier * 10) / 10;
}

/**
 * Equivalent minutes for a planned step, mirroring the workout builder so the
 * planned and completed sides cannot drift apart.
 */
function stepEquivalentMinutes(step, sport) {
  const val = Number(step.condition_value) || 0;
  const condType = step.condition_type || "time";
  if (condType === "time") return val;
  if (condType === "time_sec") return val / 60;
  if (condType === "distance_km") return val * (sport === "BIKE" || sport === "Bike" ? 2 : 5);
  if (condType === "distance") {
    if (sport === "SWIM" || sport === "Swim") return (val / 100) * 1.8;
    return (val / 1000) * 5;
  }
  if (condType === "reps") return val * 0.05;
  return val;
}

/** The multiplier a planned step earns from the zone it targets. */
function stepMultiplier(step, powerZones = null) {
  const target = step.target_type;
  const zone = Number(step.zone) || null;

  if (target === "heart.rate.zone" || target === "pace.zone" || target === "speed.zone") {
    return hrMultiplier(zone ?? 2);
  }
  if (target === "power.zone") {
    return powerMultiplier(zone ?? 2);
  }
  // An exact wattage can still be placed on the athlete's own power table.
  if (target === "power.exact") {
    const watts = parseFloat(String(step.target_value ?? "").replace(/[^0-9.]/g, ""));
    const z = zoneOf(watts, powerZones);
    return powerMultiplier(z) ?? 1.3;
  }
  if (target === "pace.exact") return 1.3;
  // Untargeted work is easy aerobic by default.
  return 1.0;
}

/** Score a planned workout from its structured steps. */
function scoreSteps(steps, { sport = null, powerZones = null } = {}) {
  if (!Array.isArray(steps) || steps.length === 0) return 0;
  let total = 0;
  for (const step of steps) {
    if (step.type === "repeat") {
      const iterations = Number(step.iterations) || 1;
      let block = 0;
      for (const sub of step.steps || []) {
        block += stepEquivalentMinutes(sub, sport) * stepMultiplier(sub, powerZones);
      }
      total += block * iterations;
    } else {
      total += stepEquivalentMinutes(step, sport) * stepMultiplier(step, powerZones);
    }
  }
  return Math.round(total * 10) / 10;
}

/**
 * The Rooka a planned day is worth.
 *
 * Prefers the structured steps, because that is the only number derived from
 * anything real. `fallback` (whatever the plan generator wrote) is used only
 * when there are no steps to score.
 */
function planDayTargetRooka(day, powerZones = null) {
  let steps = day && day.steps_json;
  if (typeof steps === "string") {
    try { steps = JSON.parse(steps); } catch (_) { steps = null; }
  }
  if (Array.isArray(steps) && steps.length > 0) {
    const scored = scoreSteps(steps, { sport: day.sport, powerZones });
    if (scored > 0) return Math.round(scored);
  }
  const fallback = Number(day && (day.target_rooka ?? day.target_spark));
  return !isNaN(fallback) && fallback > 0 ? Math.round(fallback) : 0;
}

module.exports = {
  BELOW_Z1_MULTIPLIER,
  HR_ZONE_MULTIPLIER,
  POWER_ZONE_MULTIPLIER,
  HR_DEFAULT_BANDS,
  POWER_DEFAULT_BANDS,
  maxHrFromAge,
  ageFromDateOfBirth,
  buildHrZones,
  buildPowerZones,
  zoneOf,
  hrMultiplier,
  powerMultiplier,
  effortMultiplier,
  scoreActivity,
  stepEquivalentMinutes,
  stepMultiplier,
  scoreSteps,
  planDayTargetRooka,
};
