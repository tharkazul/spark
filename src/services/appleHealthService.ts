import { Platform } from 'react-native';
import { translate as tr } from '../locales/i18n';
import { requireOptionalNativeModule } from 'expo';
import type ReactNativeWorkouts from 'react-native-workouts';
import type {
  ActivityType,
  AuthorizationStatus,
  CustomWorkoutConfig,
  DateComponents,
  IntervalBlock,
  IntervalStep,
  LocationType,
  WorkoutAlert,
  WorkoutGoal,
  WorkoutPlan,
  WorkoutStep as KitWorkoutStep,
} from 'react-native-workouts';
import { PlannedWorkout, WorkoutStep } from '../types/plan';
import { zonesApi, ZoneBandDto } from './apiServices';

type WorkoutKitModule = typeof ReactNativeWorkouts;

let cachedModule: WorkoutKitModule | null | undefined;

/**
 * The native module is Apple-only, so `requireNativeModule` throws on Android
 * and in any client that was built without it. Resolving it lazily keeps a
 * missing module from taking down whichever screen imported this file.
 */
function getWorkoutKit(): WorkoutKitModule | null {
  if (cachedModule !== undefined) return cachedModule;

  if (Platform.OS !== 'ios') {
    cachedModule = null;
    return cachedModule;
  }

  try {
    const nativeModule = requireOptionalNativeModule('ReactNativeWorkouts');
    if (nativeModule) {
      cachedModule = (require('react-native-workouts').default as WorkoutKitModule) ?? (nativeModule as WorkoutKitModule);
    } else {
      cachedModule = null;
    }
  } catch (err) {
    cachedModule = null;
  }
  return cachedModule;
}

export interface HealthKitSyncResult {
  success: boolean;
  message: string;
  /** Set when the workout reached the Watch but some targets had to be dropped. */
  degraded?: boolean;
  scheduledId?: string;
  syncedCount?: number;
}

/**
 * WorkoutKit ships in iOS 17. `isAvailable` is a native constant that is false on
 * the Simulator and on devices where Health data is unavailable, so scheduling is
 * only ever attempted when both hold.
 */
export function isWorkoutKitSupported(): boolean {
  if (Platform.OS !== 'ios') return false;
  if (parseInt(String(Platform.Version), 10) < 17) return false;
  return getWorkoutKit()?.isAvailable === true;
}

/** Kept under the old name because callers across the app still import it. */
export const isHealthKitSupported = isWorkoutKitSupported;

export async function getWorkoutKitAuthorizationStatus(): Promise<AuthorizationStatus> {
  const kit = getWorkoutKit();
  if (!kit || !isWorkoutKitSupported()) return 'unknown';
  try {
    return await kit.getAuthorizationStatus();
  } catch (err) {
    console.log('[WorkoutKit] getAuthorizationStatus failed:', describeError(err));
    return 'unknown';
  }
}

/**
 * Prompts for the WorkoutKit scheduling permission. Note this is *not* the Health
 * app permission sheet: the athlete grants and revokes it in the Watch app on the
 * iPhone, under rooka.
 */
export async function requestWorkoutKitAuthorization(): Promise<AuthorizationStatus> {
  const kit = getWorkoutKit();
  if (!kit || !isWorkoutKitSupported()) return 'unknown';
  try {
    return await kit.requestAuthorization();
  } catch (err) {
    console.log('[WorkoutKit] requestAuthorization failed:', describeError(err));
    return 'unknown';
  }
}

/** Back-compat wrapper for callers that only want a yes/no. */
export async function requestAppleHealthPermissions(): Promise<boolean> {
  return await requestFullHealthKitPermissions();
}

/**
 * Pushes a planned workout into the Workout app on the athlete's Apple Watch.
 *
 * WorkoutKit rejects goals and alerts that the chosen activity does not support
 * (power on a run, pace on a swim, and so on). Rather than failing the whole push
 * for one bad target, an unsupported build is retried once with the alerts
 * stripped, and the caller is told the targets were dropped.
 */
export async function deployWorkoutToAppleWatch(workout: PlannedWorkout): Promise<HealthKitSyncResult> {
  if (Platform.OS !== 'ios') {
    return { success: false, message: tr('appleHealthMsgs.watchIphoneOnly') };
  }
  if (parseInt(String(Platform.Version), 10) < 17) {
    return { success: false, message: tr('appleHealthMsgs.watchNeedsIos17') };
  }
  const kit = getWorkoutKit();
  if (!kit) {
    return {
      success: false,
      message: tr('appleHealthMsgs.watchNotInBuild'),
    };
  }
  if (kit.isAvailable !== true) {
    return {
      success: false,
      message: tr('appleHealthMsgs.healthUnavailableWatch'),
    };
  }

  let status = await getWorkoutKitAuthorizationStatus();
  if (status === 'notDetermined' || status === 'unknown') {
    status = await requestWorkoutKitAuthorization();
  }
  if (status !== 'authorized') {
    return { success: false, message: getWorkoutKitDeniedMessage() };
  }

  const config = buildCustomWorkoutConfig(workout, await fetchOwnHrZones(workout.sport));
  if (!config) {
    return {
      success: false,
      message: tr('appleHealthMsgs.cannotSendSport', { sport: workout.sport }),
    };
  }

  const date = toDateComponents(workout.date);
  const rawId = workout.id != null ? String(workout.id).trim() : '';
  const hasRealId = rawId !== '' && rawId !== '1' && rawId !== 'undefined' && rawId !== 'null';
  const workoutKey = hasRealId
    ? `${workout.date}:${rawId}`
    : `${workout.date}:${workout.sport}:${workout.description || workout.title || ''}`;
  await makeRoomOnWatch(workoutKey);

  try {
    return await schedule(config, date, false, workoutKey);
  } catch (err) {
    if (!isValidationError(err)) {
      return { success: false, message: describeError(err) };
    }
    // Second pass without alerts: the structure and durations still make it over.
    try {
      return await schedule(stripAlerts(config), date, true, workoutKey);
    } catch (retryErr) {
      return { success: false, message: describeError(retryErr) };
    }
  }
}

/**
 * Pushes all upcoming non-rest workouts (today through +7 days) from a plan list
 * to the Apple Watch when WorkoutKit is authorized.
 */
export async function syncUpcomingWorkoutsToAppleWatch(
  workouts: PlannedWorkout[]
): Promise<{ syncedCount: number; errors: string[] }> {
  if (!isWorkoutKitSupported()) return { syncedCount: 0, errors: [] };
  const status = await getWorkoutKitAuthorizationStatus();
  if (status !== 'authorized') return { syncedCount: 0, errors: [] };

  const now = new Date();
  const todayStr = localDateKey(now);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 7);
  const horizonStr = localDateKey(horizon);

  const upcoming = (workouts || []).filter((w) => {
    const sport = String(w.sport || (w as any).type || '').toUpperCase();
    if (!sport || sport === 'REST') return false;
    if ((w as any).isCompleted) return false;
    const d = String(w.date || '').slice(0, 10);
    return d >= todayStr && d <= horizonStr;
  });

  let syncedCount = 0;
  const errors: string[] = [];
  for (const w of upcoming) {
    const res = await deployWorkoutToAppleWatch({
      ...w,
      sport: String(w.sport || (w as any).type || 'RUN').toUpperCase(),
      description: w.description || w.title || `${w.sport || 'RUN'} Workout`,
    });
    if (res.success) {
      syncedCount++;
    } else if (res.message) {
      errors.push(res.message);
    }
  }
  return { syncedCount, errors };
}

/**
 * Opens Apple's own workout preview sheet so the athlete can eyeball the session
 * (and add it to the Watch) before it is scheduled.
 */
export async function previewWorkoutOnAppleWatch(workout: PlannedWorkout): Promise<HealthKitSyncResult> {
  if (!isWorkoutKitSupported()) {
    return { success: false, message: tr('appleHealthMsgs.previewNeedsIos17') };
  }

  const config = buildCustomWorkoutConfig(workout, await fetchOwnHrZones(workout.sport));
  if (!config) {
    return { success: false, message: tr('appleHealthMsgs.cannotPreviewSport', { sport: workout.sport }) };
  }

  const kit = getWorkoutKit();
  if (!kit) return { success: false, message: tr('appleHealthMsgs.previewNotInBuild') };

  let plan: WorkoutPlan | null = null;
  try {
    plan = await kit.createCustomWorkoutPlan(config);
    await plan.preview();
    return { success: true, message: tr('appleHealthMsgs.previewOpened') };
  } catch (err) {
    return { success: false, message: describeError(err) };
  } finally {
    plan?.release();
  }
}

export const getWorkoutKitDeniedMessage = (): string => tr('appleHealthMsgs.workoutKitDenied');

// -----------------------------------------------------------------------------
// rooka steps -> WorkoutKit CustomWorkout
// -----------------------------------------------------------------------------

/**
 * A WorkoutKit CustomWorkout is a single optional warmup, a list of interval
 * blocks, and a single optional cooldown — not the flat list rooka stores. A
 * rooka `repeat` step becomes a block with iterations; every other step becomes a
 * one-iteration block of its own.
 */
export function buildCustomWorkoutConfig(
  workout: PlannedWorkout,
  hrZones: ZoneBandDto[] | null = null,
): CustomWorkoutConfig | null {
  const activity = getAppleActivity(workout.sport);
  if (!activity) return null;

  const steps = parseSteps(workout);
  const { activityType, locationType } = activity;

  let warmup: KitWorkoutStep | undefined;
  let cooldown: KitWorkoutStep | undefined;
  const blocks: IntervalBlock[] = [];

  for (const step of steps) {
    if (step.type === 'warmup' && !warmup && blocks.length === 0) {
      warmup = toKitStep(step, activityType, hrZones);
      continue;
    }

    if (step.type === 'repeat') {
      const nested = (step.steps || []).map((s) => toIntervalStep(s, activityType, hrZones));
      if (nested.length > 0) {
        blocks.push({ iterations: Math.max(1, step.iterations || 1), steps: nested });
      }
      continue;
    }

    blocks.push({ iterations: 1, steps: [toIntervalStep(step, activityType, hrZones)] });
  }

  // Only the trailing cooldown can move into the cooldown slot; an early one has
  // to stay in the blocks so the order the coach wrote is preserved.
  const last = blocks[blocks.length - 1];
  if (last && last.iterations === 1 && last.steps.length === 1) {
    const lastSource = steps[steps.length - 1];
    if (lastSource && lastSource.type === 'cooldown') {
      cooldown = { goal: last.steps[0].goal, alert: last.steps[0].alert };
      blocks.pop();
    }
  }

  if (blocks.length === 0) {
    // WorkoutKit needs something to run; fall back to the planned duration.
    blocks.push({
      iterations: 1,
      steps: [{ purpose: 'work', goal: { type: 'time', value: estimateMinutes(workout), unit: 'minutes' } }],
    });
  }

  return {
    activityType,
    locationType,
    displayName: workout.description || workout.title || `${workout.sport} Workout`,
    warmup,
    blocks,
    cooldown,
  };
}

function toIntervalStep(step: WorkoutStep, activityType: ActivityType, hrZones: ZoneBandDto[] | null): IntervalStep {
  const kit = toKitStep(step, activityType, hrZones);
  return {
    purpose: step.type === 'recovery' || step.type === 'rest' ? 'recovery' : 'work',
    goal: kit.goal,
    alert: kit.alert,
  };
}

function toKitStep(step: WorkoutStep, activityType: ActivityType, hrZones: ZoneBandDto[] | null): KitWorkoutStep {
  // Warmup steps are meant for ramping up from resting heart rate.
  // Attaching a strict heart rate zone alert to a warmup causes Apple Watch to chime
  // and vocalize "Below Zone" every 20 seconds while the athlete is still cold.
  const isColdWarmup = step.type === 'warmup' && step.target_type === 'heart.rate.zone';
  const alert = isColdWarmup ? undefined : toAlert(step, activityType, hrZones);
  return { goal: toGoal(step), alert };
}

/**
 * rooka's units, matching the Garmin exporter on the server: `time` is minutes,
 * `time_sec` is seconds, `distance` is metres and `distance_km` is kilometres.
 */
function toGoal(step: WorkoutStep): WorkoutGoal {
  const value = step.condition_value;
  if (!value || value <= 0) return { type: 'open' };

  switch (step.condition_type) {
    case 'time':
      return { type: 'time', value, unit: 'minutes' };
    case 'time_sec':
      return { type: 'time', value, unit: 'seconds' };
    case 'distance':
      return { type: 'distance', value, unit: 'meters' };
    case 'distance_km':
      return { type: 'distance', value, unit: 'kilometers' };
    // WorkoutKit has no rep goal. An open step lets the athlete work through the
    // set and tap to advance, which is the closest honest equivalent.
    case 'reps':
      return { type: 'open' };
    default:
      return { type: 'time', value, unit: 'minutes' };
  }
}

/**
 * WorkoutKit validates alerts against the activity, so only the combinations it
 * accepts are offered: heart rate anywhere, pace on foot sports, power and speed
 * on the bike.
 */
function toAlert(step: WorkoutStep, activityType: ActivityType, hrZones: ZoneBandDto[] | null): WorkoutAlert | undefined {
  const onFoot = activityType === 'running' || activityType === 'walking' || activityType === 'hiking';
  const onBike = activityType === 'cycling';

  switch (step.target_type) {
    case 'heart.rate.zone': {
      const zone = Number(step.zone);
      if (!Number.isFinite(zone) || zone < 1 || zone > 5) return undefined;
      // The athlete's own bpm range when the profile has one; otherwise the
      // zone number, which the Watch resolves against its own zones.
      const band = hrZones?.find((z) => Number(z.zone) === zone);
      if (band && band.min > 0 && band.max != null && band.max > band.min) {
        return { type: 'heartRate', min: band.min, max: band.max };
      }
      return { type: 'heartRate', zone };
    }

    case 'pace.exact':
    case 'pace.zone': {
      if (!onFoot) return undefined;
      const minPerKm = parsePaceMinutes(step.target_value);
      if (!minPerKm) return undefined;
      // ±5%, matching the band the Garmin exporter builds around an exact pace.
      return { type: 'pace', min: minPerKm * 0.95, max: minPerKm * 1.05, unit: 'minutesPerKilometer' };
    }

    case 'power.exact':
    case 'power.zone': {
      if (!onBike) return undefined;
      const watts = parseNumeric(step.target_value);
      if (!watts) return undefined;
      return { type: 'power', min: watts * 0.9, max: watts * 1.1 };
    }

    case 'speed.exact':
    case 'speed.zone': {
      if (!onBike) return undefined;
      const kph = parseNumeric(step.target_value);
      if (!kph) return undefined;
      return { type: 'speed', min: kph * 0.95, max: kph * 1.05, unit: 'kilometersPerHour' };
    }

    default:
      return undefined;
  }
}

/**
 * The HR table in effect for this sport (its own, else 'default'), but only when
 * the athlete or coach set it. A 'derived' table is the same age-based estimate
 * the Watch already makes, so it is no reason to override the Watch's zones.
 * Mirrors resolveWatchHrZones on the server, which does this for Garmin.
 */
async function fetchOwnHrZones(sport: string): Promise<ZoneBandDto[] | null> {
  try {
    const { tables } = await zonesApi.get(sport);
    const hr = (tables || []).filter((t) => t.kind === 'hr');
    const table = hr.find((t) => t.sport === sport) || hr.find((t) => t.sport === 'default');
    return table && table.source !== 'derived' ? table.zones : null;
  } catch {
    // Offline or signed out: zone numbers still get a usable workout onto the Watch.
    return null;
  }
}

function getAppleActivity(sport: string): { activityType: ActivityType; locationType: LocationType } | null {
  switch ((sport || '').trim().toUpperCase()) {
    case 'RUN':
    case 'RUNNING':
    case 'TRAIL_RUN':
    case 'TRAIL RUN':
      return { activityType: 'running', locationType: 'outdoor' };
    case 'TREADMILL':
    case 'INDOOR_RUN':
      return { activityType: 'running', locationType: 'indoor' };
    case 'BIKE':
    case 'CYCLING':
    case 'RIDE':
      return { activityType: 'cycling', locationType: 'outdoor' };
    case 'VIRTUAL_RIDE':
    case 'INDOOR_BIKE':
    case 'SPINNING':
      return { activityType: 'cycling', locationType: 'indoor' };
    // WorkoutKit reads `indoor` as pool swimming, which is what rooka's
    // metre-based swim steps describe.
    case 'SWIM':
    case 'SWIMMING':
      return { activityType: 'swimming', locationType: 'indoor' };
    case 'STRENGTH':
    case 'WEIGHT_TRAINING':
    case 'WEIGHTTRAINING':
    case 'WEIGHTS':
    case 'GYM':
      return { activityType: 'traditionalStrengthTraining', locationType: 'indoor' };
    case 'FUNCTIONAL':
    case 'FUNCTIONAL_STRENGTH':
    case 'CROSSFIT':
      return { activityType: 'functionalStrengthTraining', locationType: 'indoor' };
    case 'HYROX':
    case 'HIIT':
    case 'CARDIO':
    case 'CIRCUIT':
    case 'OTHER':
      return { activityType: 'highIntensityIntervalTraining', locationType: 'indoor' };
    case 'MOBILITY':
    case 'YOGA':
    case 'STRETCH':
    case 'STRETCHING':
    case 'RECOVERY':
      return { activityType: 'yoga', locationType: 'indoor' };
    case 'PILATES':
      return { activityType: 'pilates', locationType: 'indoor' };
    case 'CORE':
      return { activityType: 'coreTraining', locationType: 'indoor' };
    case 'WALK':
    case 'WALKING':
      return { activityType: 'walking', locationType: 'outdoor' };
    case 'HIKE':
    case 'HIKING':
      return { activityType: 'hiking', locationType: 'outdoor' };
    case 'ROW':
    case 'ROWING':
      return { activityType: 'rowing', locationType: 'indoor' };
    case 'ELLIPTICAL':
      return { activityType: 'elliptical', locationType: 'indoor' };
    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Apple lets one app keep this many workouts scheduled. Past the limit
// WorkoutScheduler.schedule silently does nothing, so rooka clears old entries
// first and checks afterwards that the new one is really there.
const WATCH_SCHEDULE_LIMIT = 15;
const WATCH_SCHEDULED_KEY = '@rooka:watch_scheduled_ids'; // rooka workout key -> scheduled plan id

const dateKeyOf = (d: { year?: number; month?: number; day?: number }) =>
  `${d.year ?? 0}-${String(d.month ?? 0).padStart(2, '0')}-${String(d.day ?? 0).padStart(2, '0')}`;

async function readScheduledMap(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(WATCH_SCHEDULED_KEY)) || '{}');
  } catch {
    return {};
  }
}

/** Removes past rooka workouts and the earlier copy of this one, keeping room under Apple's limit. */
async function makeRoomOnWatch(workoutKey: string): Promise<void> {
  const kit = getWorkoutKit();
  if (!kit) return;
  try {
    const scheduled = await kit.getScheduledWorkouts();
    const map = await readScheduledMap();
    const today = localDateKey(new Date());
    const remove = new Set<string>();
    scheduled.forEach((w: any) => {
      if (dateKeyOf(w.date || {}) < today) remove.add(w.id);
    });
    if (map[workoutKey]) remove.add(map[workoutKey]);
    // Still full: drop the ones furthest in the future (the plan will change before then anyway).
    const kept = scheduled.filter((w: any) => !remove.has(w.id)).sort((a: any, b: any) => (dateKeyOf(a.date || {}) < dateKeyOf(b.date || {}) ? -1 : 1));
    while (kept.length >= WATCH_SCHEDULE_LIMIT) remove.add(kept.pop()!.id);
    for (const id of remove) {
      await kit.removeScheduledWorkout(id).catch(() => {});
    }
  } catch (err) {
    console.log('[WorkoutKit] could not tidy scheduled workouts:', describeError(err));
  }
}

async function schedule(
  config: CustomWorkoutConfig,
  date: DateComponents,
  degraded: boolean,
  workoutKey: string,
): Promise<HealthKitSyncResult> {
  const kit = getWorkoutKit();
  if (!kit) throw new Error(tr('appleHealthMsgs.watchSupportUnavailable'));

  let plan: WorkoutPlan | null = null;
  try {
    plan = await kit.createCustomWorkoutPlan(config);
    const result = await plan.scheduleAndSync(date);
    // schedule() never fails out loud; only the scheduler's own list says whether it took.
    const scheduled = await kit.getScheduledWorkouts().catch(() => null);
    if (scheduled && !scheduled.some((w: any) => w.id === result.id)) {
      return { success: false, message: tr('appleHealthMsgs.watchNotAccepted') };
    }
    const map = await readScheduledMap();
    map[workoutKey] = result.id;
    await AsyncStorage.setItem(WATCH_SCHEDULED_KEY, JSON.stringify(map)).catch(() => {});
    return {
      success: true,
      degraded,
      scheduledId: result.id,
      message: degraded
        ? tr('appleHealthMsgs.onWatchDegraded', { name: config.displayName ?? '' })
        : tr('appleHealthMsgs.onWatch', { name: config.displayName ?? '' }),
    };
  } finally {
    plan?.release();
  }
}

function stripAlerts(config: CustomWorkoutConfig): CustomWorkoutConfig {
  return {
    ...config,
    warmup: config.warmup ? { goal: config.warmup.goal } : undefined,
    cooldown: config.cooldown ? { goal: config.cooldown.goal } : undefined,
    blocks: config.blocks.map((block) => ({
      iterations: block.iterations,
      steps: block.steps.map((step) => ({ purpose: step.purpose, goal: step.goal })),
    })),
  };
}

function parseSteps(workout: PlannedWorkout): WorkoutStep[] {
  const raw = workout.steps_json ?? workout.steps;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** WorkoutKit schedules against calendar components, not an instant in time. */
function toDateComponents(dateStr: string): DateComponents {
  const now = new Date();
  const todayObj = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
  const todayKey = dateKeyOf(todayObj);

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  const parsed = match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : todayObj;

  // WorkoutScheduler drops dates in the past. If an athlete explicitly sends an older
  // session to perform today, clamp the date to today.
  const base = dateKeyOf(parsed) < todayKey ? todayObj : parsed;

  // rooka plans days, not clock times. Scheduling at 23:45 (or 23:59 if syncing after
  // 23:44) keeps the workout in the future for the entire training day so it never
  // expires before an afternoon or evening session.
  const isToday = dateKeyOf(base) === todayKey;
  const minute = isToday && now.getHours() === 23 && now.getMinutes() >= 45 ? 59 : 45;
  return { ...base, hour: 23, minute };
}

function estimateMinutes(workout: PlannedWorkout): number {
  const points = workout.target_rooka || workout.rookaPoints || 55;
  return Math.max(5, Math.round((points / 55) * 60));
}

/** rooka stores exact paces as "M:SS" per kilometre, with no unit suffix. */
function parsePaceMinutes(value?: string): number | null {
  if (!value) return null;
  const match = /(\d+)[:.](\d{1,2})/.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) + Number(match[2]) / 60;
  return minutes > 0 ? minutes : null;
}

function parseNumeric(value?: string): number | null {
  if (!value) return null;
  const match = /(\d+(?:\.\d+)?)/.exec(value);
  if (!match) return null;
  const num = Number(match[1]);
  return num > 0 ? num : null;
}

function isValidationError(err: any): boolean {
  const text = `${err?.code || ''} ${err?.name || ''} ${err?.message || ''}`;
  return /ValidationError|Unsupported|InvalidAlert/i.test(text);
}

function describeError(err: any): string {
  // Native WorkoutKit errors are English-only, so always show our own localized message.
  if (err) console.warn('[AppleWatch] send failed:', typeof err === 'string' ? err : err.message || err.code);
  return tr('appleHealthMsgs.sendFailed');
}

// =============================================================================
// Apple HealthKit Reading & Synchronization
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './apiClient';

const LAST_SYNC_KEY = '@rooka:last_apple_health_sync';
const PREFS_KEY = '@rooka:apple_health_sync_preferences';
const TODAY_BIOMETRICS_KEY = '@rooka:today_biometrics_cache';
// Set once the athlete has been through Apple's permission sheet. iOS never says
// whether read access was granted, so this is the only "connected" we can know.
const CONNECTED_KEY = '@rooka:apple_health_connected';

export async function isAppleHealthConnected(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CONNECTED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export interface AppleHealthSyncPreferences {
  syncSleep: boolean;
  syncHeartRate: boolean;
  syncHrv: boolean;
  syncStepsCalories: boolean;
  syncBodyMass: boolean;
  syncVo2Max: boolean;
  syncWorkouts: boolean;
}

export const DEFAULT_APPLE_HEALTH_PREFS: AppleHealthSyncPreferences = {
  syncSleep: true,
  syncHeartRate: true,
  syncHrv: true,
  syncStepsCalories: true,
  syncBodyMass: true,
  syncVo2Max: true,
  syncWorkouts: true,
};

export async function getAppleHealthPreferences(): Promise<AppleHealthSyncPreferences> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) {
      return { ...DEFAULT_APPLE_HEALTH_PREFS, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_APPLE_HEALTH_PREFS;
}

export async function saveAppleHealthPreferences(prefs: AppleHealthSyncPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('[AppleHealthService] Failed to save preferences:', err);
  }
}

export interface AppleHealthDailyBiometrics {
  date: string; // YYYY-MM-DD
  resting_hr?: number | null;
  avg_hr?: number | null;
  min_hr?: number | null;
  max_hr?: number | null;
  hrv_sdnn?: number | null;
  sleep_minutes?: number | null;
  sleep_deep_minutes?: number | null;
  sleep_rem_minutes?: number | null;
  sleep_core_minutes?: number | null;
  sleep_awake_minutes?: number | null;
  steps?: number | null;
  active_calories?: number | null;
  weight_kg?: number | null;
  body_fat_percent?: number | null;
  vo2_max?: number | null;
}

export interface AppleHealthWorkoutData {
  external_id: string;
  source: string;
  sport_type: string;
  name: string;
  start_date: string;
  end_date?: string;
  duration_min: number;
  distance_km?: number | null;
  elevation_m?: number | null;
  avg_heartrate?: number | null;
  max_heartrate?: number | null;
  calories?: number | null;
}

export interface HealthKitSyncSummary {
  success: boolean;
  message: string;
  /** Days with data per type, read from the phone (not rows written on the server). */
  found?: { sleep: number; steps: number; hrv: number; restingHr: number; weight: number; workouts: number };
  biometricsSynced?: number;
  workoutsSynced?: number;
  lastSyncDate?: string;
}

/**
 * Checks if Apple HealthKit is available on the current device.
 */
export function isHealthKitAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    const HealthKit = require('@kingstinct/react-native-healthkit').default;
    return HealthKit?.isHealthDataAvailable?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * Prompts the athlete with Apple's official Health permission sheet
 * to authorize reading the user's enabled health metrics.
 */
export async function requestFullHealthKitPermissions(customPrefs?: Partial<AppleHealthSyncPreferences>): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const HealthKitModule = require('@kingstinct/react-native-healthkit');
    const HealthKit = HealthKitModule.default || HealthKitModule;
    const { HKQuantityTypeIdentifier, HKCategoryTypeIdentifier, WorkoutTypeIdentifier } = HealthKitModule;

    const prefs = { ...(await getAppleHealthPreferences()), ...(customPrefs || {}) };
    const readTypes: any[] = [];

    if (prefs.syncHeartRate) {
      readTypes.push(HKQuantityTypeIdentifier?.heartRate || 'HKQuantityTypeIdentifierHeartRate');
      readTypes.push(HKQuantityTypeIdentifier?.restingHeartRate || 'HKQuantityTypeIdentifierRestingHeartRate');
    }
    if (prefs.syncHrv) {
      readTypes.push(HKQuantityTypeIdentifier?.heartRateVariabilitySDNN || 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN');
    }
    if (prefs.syncStepsCalories) {
      readTypes.push(HKQuantityTypeIdentifier?.stepCount || 'HKQuantityTypeIdentifierStepCount');
      readTypes.push(HKQuantityTypeIdentifier?.activeEnergyBurned || 'HKQuantityTypeIdentifierActiveEnergyBurned');
      readTypes.push(HKQuantityTypeIdentifier?.distanceWalkingRunning || 'HKQuantityTypeIdentifierDistanceWalkingRunning');
      readTypes.push(HKQuantityTypeIdentifier?.distanceCycling || 'HKQuantityTypeIdentifierDistanceCycling');
      readTypes.push(HKQuantityTypeIdentifier?.distanceSwimming || 'HKQuantityTypeIdentifierDistanceSwimming');
    }
    if (prefs.syncSleep) {
      readTypes.push(HKCategoryTypeIdentifier?.sleepAnalysis || 'HKCategoryTypeIdentifierSleepAnalysis');
    }
    if (prefs.syncBodyMass) {
      readTypes.push(HKQuantityTypeIdentifier?.bodyMass || 'HKQuantityTypeIdentifierBodyMass');
      readTypes.push(HKQuantityTypeIdentifier?.bodyFatPercentage || 'HKQuantityTypeIdentifierBodyFatPercentage');
    }
    if (prefs.syncVo2Max) {
      readTypes.push(HKQuantityTypeIdentifier?.vo2Max || 'HKQuantityTypeIdentifierVO2Max');
    }
    if (prefs.syncWorkouts) {
      readTypes.push(WorkoutTypeIdentifier || 'HKWorkoutTypeIdentifier');
    }

    const validReadTypes = readTypes.filter(Boolean);
    if (validReadTypes.length === 0) {
      return true;
    }

    if (typeof HealthKit.requestAuthorization === 'function') {
      await HealthKit.requestAuthorization({
        toRead: validReadTypes,
      });
    }
    await AsyncStorage.setItem(CONNECTED_KEY, 'true').catch(() => {});

    return true;
  } catch (err: any) {
    console.warn('[AppleHealthService] requestFullHealthKitPermissions error:', err?.message || err);
    return false;
  }
}

/** YYYY-MM-DD in the phone's own timezone (toISOString would give the UTC day). */
const localDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ASLEEP_VALUES = new Set<any>([1, 3, 4, 5, 'asleep', 'asleepUnspecified', 'asleepCore', 'asleepDeep', 'asleepREM']);

/** Total minutes covered by a set of intervals, overlaps counted once (Watch + Garmin + iPhone). */
function mergedMinutes(intervals: [number, number][]): number {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [a, b] of sorted) {
    if (a > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    } else if (b > curEnd) {
      curEnd = b;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total / 60000;
}

/**
 * Fetches daily biometric & recovery data (HR, HRV, Sleep, Steps, Calories, Weight, VO2Max)
 * for the past N days from Apple Health according to user preferences.
 *
 * - Days are the phone's local calendar days.
 * - Sleep for a day is the sleep that ended between 18:00 the evening before and
 *   18:00 that day, so each night is counted once, on the morning you wake up.
 * - Steps and active energy use Apple's daily totals, which count overlapping
 *   iPhone and Watch samples once.
 * - Weight, body fat and VO2 max are only set on days with an actual measurement.
 */
export async function fetchHealthKitBiometrics(
  daysBack = 7,
  customPrefs?: AppleHealthSyncPreferences
): Promise<AppleHealthDailyBiometrics[]> {
  if (Platform.OS !== 'ios') return [];
  try {
    const HealthKit = require('@kingstinct/react-native-healthkit').default;
    const prefs = customPrefs || (await getAppleHealthPreferences());
    const results: AppleHealthDailyBiometrics[] = [];

    // Units are explicit: without one HealthKit answers in the phone's preferred unit (pounds, say).
    const latestInDay = async (typeId: string, unit: string, startDate: Date, endDate: Date) => {
      const samples = await HealthKit.queryQuantitySamples(typeId, { filter: { date: { startDate, endDate } }, limit: 1, ascending: false, unit });
      return samples && samples.length > 0 ? samples[0] : null;
    };
    const dayTotal = async (typeId: string, unit: string, startDate: Date, endDate: Date) => {
      const stats = await HealthKit.queryStatisticsForQuantity(typeId, ['cumulativeSum'], { filter: { date: { startDate, endDate } }, unit });
      return stats?.sumQuantity?.quantity ?? null;
    };

    const now = new Date();
    for (let i = 0; i < daysBack; i++) {
      const startOfDay = new Date(now);
      startOfDay.setDate(startOfDay.getDate() - i);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setHours(23, 59, 59, 999);
      const overnightStart = new Date(startOfDay);
      overnightStart.setHours(-6); // 18:00 the evening before (matches sleep window)
      const entry: AppleHealthDailyBiometrics = { date: localDateKey(startOfDay) };

      if (prefs.syncHeartRate) {
        try {
          let latest = await latestInDay('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', startOfDay, endOfDay);
          if (!latest) {
            latest = await latestInDay('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', overnightStart, endOfDay);
          }
          if (latest) entry.resting_hr = Math.round(latest.quantity);
        } catch {}
        try {
          const stats = await HealthKit.queryStatisticsForQuantity(
            'HKQuantityTypeIdentifierHeartRate',
            ['discreteAverage', 'discreteMin', 'discreteMax'],
            { filter: { date: { startDate: startOfDay, endDate: endOfDay } }, unit: 'count/min' }
          );
          if (stats?.averageQuantity?.quantity) {
            entry.avg_hr = Math.round(stats.averageQuantity.quantity);
            entry.min_hr = Math.round(stats.minimumQuantity?.quantity ?? stats.averageQuantity.quantity);
            entry.max_hr = Math.round(stats.maximumQuantity?.quantity ?? stats.averageQuantity.quantity);
          }
        } catch {}
      }

      if (prefs.syncHrv) {
        try {
          const stats = await HealthKit.queryStatisticsForQuantity(
            'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
            ['discreteAverage'],
            { filter: { date: { startDate: overnightStart, endDate: endOfDay } }, unit: 'ms' }
          );
          const avg = stats?.averageQuantity?.quantity;
          if (avg) {
            entry.hrv_sdnn = Math.round(avg * 10) / 10;
          } else {
            const latestHrv = await latestInDay('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms', overnightStart, endOfDay);
            if (latestHrv) entry.hrv_sdnn = Math.round(latestHrv.quantity * 10) / 10;
          }
        } catch {}
      }

      if (prefs.syncStepsCalories) {
        try {
          const steps = await dayTotal('HKQuantityTypeIdentifierStepCount', 'count', startOfDay, endOfDay);
          if (steps) entry.steps = Math.round(steps);
        } catch {}
        try {
          const kcal = await dayTotal('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', startOfDay, endOfDay);
          if (kcal) entry.active_calories = Math.round(kcal);
        } catch {}
      }

      if (prefs.syncSleep) {
        try {
          const windowStart = new Date(startOfDay);
          windowStart.setHours(-6); // 18:00 the evening before
          const windowEnd = new Date(startOfDay);
          windowEnd.setHours(18);
          const samples = await HealthKit.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
            filter: { date: { startDate: windowStart, endDate: windowEnd } },
            limit: 0,
          });
          // A sample belongs to the night it ends in.
          const night = (samples || []).filter((x: any) => {
            const end = new Date(x.endDate).getTime();
            return end > windowStart.getTime() && end <= windowEnd.getTime();
          });
          const span = (x: any): [number, number] => [new Date(x.startDate).getTime(), new Date(x.endDate).getTime()];
          const ofValue = (...values: any[]) => night.filter((x: any) => values.includes(x.value)).map(span);

          const asleep = night.filter((x: any) => ASLEEP_VALUES.has(x.value)).map(span);
          // Time in bed only counts when nothing recorded actual sleep (an iPhone without a watch).
          const totalAsleep = asleep.length > 0 ? mergedMinutes(asleep) : mergedMinutes(ofValue(0, 'inBed'));
          if (totalAsleep > 0) {
            entry.sleep_minutes = Math.round(totalAsleep);
            entry.sleep_deep_minutes = Math.round(mergedMinutes(ofValue(4, 'asleepDeep')));
            entry.sleep_rem_minutes = Math.round(mergedMinutes(ofValue(5, 'asleepREM')));
            entry.sleep_core_minutes = Math.round(mergedMinutes(ofValue(3, 'asleepCore')));
            entry.sleep_awake_minutes = Math.round(mergedMinutes(ofValue(2, 'awake')));
          }
        } catch {}
      }

      if (prefs.syncBodyMass) {
        try {
          const w = await latestInDay('HKQuantityTypeIdentifierBodyMass', 'kg', startOfDay, endOfDay);
          if (w) entry.weight_kg = Math.round(w.quantity * 10) / 10;
        } catch {}
        try {
          const f = await latestInDay('HKQuantityTypeIdentifierBodyFatPercentage', '%', startOfDay, endOfDay);
          if (f) entry.body_fat_percent = Math.round(f.quantity * 1000) / 10;
        } catch {}
      }

      if (prefs.syncVo2Max) {
        try {
          const v = await latestInDay('HKQuantityTypeIdentifierVO2Max', 'ml/(kg*min)', startOfDay, endOfDay);
          if (v) entry.vo2_max = Math.round(v.quantity * 10) / 10;
        } catch {}
      }

      results.push(entry);
    }

    return results;
  } catch (err: any) {
    console.warn('[AppleHealthService] fetchHealthKitBiometrics error:', err?.message || err);
    return [];
  }
}

/**
 * Fetches completed workouts from Apple HealthKit (including Garmin, Apple Watch, Strava).
 */
export async function fetchHealthKitWorkouts(daysBack = 14): Promise<AppleHealthWorkoutData[]> {
  if (Platform.OS !== 'ios') return [];
  try {
    const HealthKit = require('@kingstinct/react-native-healthkit').default;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);

    const workoutSamples = await HealthKit.queryWorkoutSamples({
      filter: { date: { startDate: fromDate } },
      limit: 100,
    });

    if (!Array.isArray(workoutSamples) || workoutSamples.length === 0) {
      return [];
    }

    return workoutSamples.map((w: any) => {
      const sport = mapHKActivityTypeToSport(w.workoutActivityType);
      const durationMin = Math.round((w.duration || (new Date(w.endDate).getTime() - new Date(w.startDate).getTime()) / 1000) / 60);
      const distanceKm = w.totalDistance ? Math.round((w.totalDistance / 1000) * 100) / 100 : null;
      const calories = w.totalEnergyBurned ? Math.round(w.totalEnergyBurned) : null;
      const sourceName = w.sourceRevision?.source?.name || 'Apple Health';

      return {
        external_id: w.uuid || `hk_${new Date(w.startDate).getTime()}`,
        source: sourceName,
        sport_type: sport,
        name: `${sport} (${sourceName})`,
        start_date: new Date(w.startDate).toISOString(),
        end_date: w.endDate ? new Date(w.endDate).toISOString() : undefined,
        duration_min: Math.max(1, durationMin),
        distance_km: distanceKm,
        elevation_m: w.totalElevationAscent
          ? Math.round(
              typeof w.totalElevationAscent === 'number'
                ? w.totalElevationAscent
                : typeof w.totalElevationAscent?.quantity === 'number'
                ? w.totalElevationAscent.quantity
                : 0
            ) || null
          : null,
        avg_heartrate: null,
        calories,
      };
    });
  } catch (err: any) {
    console.warn('[AppleHealthService] fetchHealthKitWorkouts error:', err?.message || err);
    return [];
  }
}

/**
 * Maps Apple HKWorkoutActivityType integer or string to standard Rooka sport names.
 */
function mapHKActivityTypeToSport(typeId: number | string): string {
  // HKWorkoutActivityType raw values. Running is 37: it was missing here, so every
  // Apple Watch run arrived as "Cardio" and could not be matched to its Strava copy.
  const numeric = typeof typeId === 'number' ? typeId : parseInt(String(typeId), 10);
  switch (numeric) {
    case 37: // running
      return 'Run';
    case 13: // cycling
      return 'Bike';
    case 46: // swimming
      return 'Swim';
    case 20: // functionalStrengthTraining
    case 50: // traditionalStrengthTraining
    case 59: // coreTraining
      return 'Strength';
    case 52: // walking
    case 24: // hiking
      return 'Walk';
    case 57: // yoga
    case 62: // flexibility
    case 66: // pilates
    case 29: // mindAndBody
      return 'Mobility';
    default:
      return 'Cardio'; // rowing, HIIT, elliptical, multisport, ...
  }
}

/**
 * Pulls all recent biometrics and workouts from Apple Health and syncs them to the backend server.
 */
export async function syncAppleHealthData(daysBack = 7): Promise<HealthKitSyncSummary> {
  if (Platform.OS !== 'ios') {
    return { success: false, message: tr('appleHealthMsgs.syncIosOnly') };
  }

  // Before the permission sheet every read comes back empty, so a sync would only
  // send blank days (and used to make the app look connected when it wasn't).
  if (!(await isAppleHealthConnected())) {
    return { success: false, message: tr('appleHealthMsgs.notConnected') };
  }

  try {
    const prefs = await getAppleHealthPreferences();
    const biometricsPromise = fetchHealthKitBiometrics(daysBack, prefs);
    const workoutsPromise = prefs.syncWorkouts ? fetchHealthKitWorkouts(Math.max(daysBack, 14)) : Promise.resolve([]);

    const [biometrics, workouts] = await Promise.all([biometricsPromise, workoutsPromise]);

    // Cache today's biometrics locally for instant UI access
    const todayStr = localDateKey(new Date());
    const todayItem = biometrics.find((b) => b.date === todayStr);
    if (todayItem) {
      await AsyncStorage.setItem(TODAY_BIOMETRICS_KEY, JSON.stringify(todayItem));
    }

    const res = await apiClient<{
      success: boolean;
      message?: string;
      biometricsSynced?: number;
      workoutsSynced?: number;
    }>('/api/healthkit/sync', {
      method: 'POST',
      body: JSON.stringify({ biometrics, workouts }),
    });

    const nowISO = new Date().toISOString();
    await AsyncStorage.setItem(LAST_SYNC_KEY, nowISO);

    const count = (pick: (b: AppleHealthDailyBiometrics) => unknown) => biometrics.filter((b) => Boolean(pick(b))).length;
    return {
      success: true,
      message: res.message || tr('appleHealthMsgs.syncDone'),
      biometricsSynced: res.biometricsSynced ?? biometrics.length,
      workoutsSynced: res.workoutsSynced ?? workouts.length,
      lastSyncDate: nowISO,
      found: {
        sleep: count((b) => b.sleep_minutes),
        steps: count((b) => b.steps),
        hrv: count((b) => b.hrv_sdnn),
        restingHr: count((b) => b.resting_hr),
        weight: count((b) => b.weight_kg),
        workouts: workouts.length,
      },
    };
  } catch (err: any) {
    console.error('[AppleHealthService] Sync failed:', err?.message || err);
    return {
      success: false,
      message: err?.message || tr('appleHealthMsgs.syncFailed'),
    };
  }
}

export async function getLastAppleHealthSyncTime(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

export async function getCachedTodayBiometrics(): Promise<AppleHealthDailyBiometrics | null> {
  try {
    const raw = await AsyncStorage.getItem(TODAY_BIOMETRICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const todayStr = localDateKey(new Date());
      if (parsed.date === todayStr) {
        return parsed;
      }
    }
  } catch {}
  return null;
}

export async function fetchTodayBiometricsFromServer(): Promise<AppleHealthDailyBiometrics | null> {
  try {
    const res = await apiClient<{ success: boolean; biometrics?: AppleHealthDailyBiometrics | null }>(
      '/api/healthkit/today'
    );
    if (res.success && res.biometrics) {
      await AsyncStorage.setItem(TODAY_BIOMETRICS_KEY, JSON.stringify(res.biometrics));
      return res.biometrics;
    }
  } catch (err) {
    // Fallback to cache if server is offline
    return getCachedTodayBiometrics();
  }
  return getCachedTodayBiometrics();
}

const RECENT_BIOMETRICS_KEY = '@rooka:recent_biometrics_cache';

export async function fetchRecentBiometricsFromServer(limit = 7): Promise<AppleHealthDailyBiometrics[]> {
  try {
    const res = await apiClient<{ success: boolean; biometrics?: AppleHealthDailyBiometrics[] }>(
      `/api/healthkit/recent?limit=${limit}`
    );
    if (res.success && Array.isArray(res.biometrics)) {
      await AsyncStorage.setItem(RECENT_BIOMETRICS_KEY, JSON.stringify(res.biometrics));
      return res.biometrics;
    }
  } catch (err) {
    try {
      const cached = await AsyncStorage.getItem(RECENT_BIOMETRICS_KEY);
      if (cached) return JSON.parse(cached);
    } catch {}
  }
  return [];
}

export interface CardiovascularStrainResult {
  strainLevel: 'none' | 'moderate' | 'elevated' | 'high';
  strainScore: number; // 0 - 100
  restingHr: number | null;
  avgRhr: number | null;
  rhrDelta: number | null;
  rhrStatus: 'optimal' | 'normal' | 'elevated';
  hrv: number | null;
  avgHrv: number | null;
  hrvDelta: number | null;
  hrvStatus: 'prime' | 'balanced' | 'suppressed';
  sleepMinutes: number | null;
  headline: string;
  description: string;
  actionAdvice: string;
}

export function computeCardiovascularStrain(
  today: AppleHealthDailyBiometrics | null | undefined,
  recent: AppleHealthDailyBiometrics[] = []
): CardiovascularStrainResult {
  if (!today) {
    return {
      strainLevel: 'none',
      strainScore: 0,
      restingHr: null,
      avgRhr: null,
      rhrDelta: null,
      rhrStatus: 'normal',
      hrv: null,
      avgHrv: null,
      hrvDelta: null,
      hrvStatus: 'balanced',
      sleepMinutes: null,
      headline: tr('cardioStrain.stableHeadline'),
      description: tr('cardioStrain.noDataDesc'),
      actionAdvice: tr('cardioStrain.noDataAdvice'),
    };
  }

  // 1. Calculate 7-Day Baseline RHR & HRV
  const pastDays = recent.filter((r) => r.date !== today.date);
  const rhrSamples = pastDays.map((r) => r.resting_hr).filter((v): v is number => typeof v === 'number' && v > 0);
  const hrvSamples = pastDays.map((r) => r.hrv_sdnn).filter((v): v is number => typeof v === 'number' && v > 0);

  const avgRhr = rhrSamples.length > 0 ? Math.round((rhrSamples.reduce((a, b) => a + b, 0) / rhrSamples.length) * 10) / 10 : null;
  const avgHrv = hrvSamples.length > 0 ? Math.round((hrvSamples.reduce((a, b) => a + b, 0) / hrvSamples.length) * 10) / 10 : null;

  const currentRhr = today.resting_hr ?? null;
  const currentHrv = today.hrv_sdnn ?? null;
  const sleepMinutes = today.sleep_minutes ?? null;

  const rhrDelta = currentRhr && avgRhr ? Math.round((currentRhr - avgRhr) * 10) / 10 : null;
  const hrvDelta = currentHrv && avgHrv ? Math.round((currentHrv - avgHrv) * 10) / 10 : null;

  // 2. Score Strain (0 = fresh/optimal, 100 = high systemic fatigue)
  let strainScore = 0;

  // Resting HR analysis
  let rhrStatus: 'optimal' | 'normal' | 'elevated' = 'normal';
  if (currentRhr) {
    if (rhrDelta !== null && rhrDelta >= 5) {
      strainScore += 45;
      rhrStatus = 'elevated';
    } else if (rhrDelta !== null && rhrDelta >= 2.5) {
      strainScore += 25;
      rhrStatus = 'elevated';
    } else if (currentRhr > 74) {
      strainScore += 35;
      rhrStatus = 'elevated';
    } else if (currentRhr > 68) {
      strainScore += 15;
    } else if (currentRhr < 54) {
      rhrStatus = 'optimal';
    }
  }

  // HRV analysis
  let hrvStatus: 'prime' | 'balanced' | 'suppressed' = 'balanced';
  if (currentHrv) {
    if (hrvDelta !== null && hrvDelta <= -12) {
      strainScore += 40;
      hrvStatus = 'suppressed';
    } else if (hrvDelta !== null && hrvDelta <= -6) {
      strainScore += 20;
      hrvStatus = 'suppressed';
    } else if (currentHrv < 30) {
      strainScore += 35;
      hrvStatus = 'suppressed';
    } else if (currentHrv < 40) {
      strainScore += 15;
    } else if (currentHrv >= 55) {
      hrvStatus = 'prime';
    }
  }

  // Sleep deficit contribution
  if (sleepMinutes && sleepMinutes > 0) {
    const sleepHours = sleepMinutes / 60;
    if (sleepHours < 5.2) {
      strainScore += 25;
    } else if (sleepHours < 6.2) {
      strainScore += 10;
    }
  }

  strainScore = Math.min(100, Math.max(0, Math.round(strainScore)));

  let strainLevel: 'none' | 'moderate' | 'elevated' | 'high' = 'none';
  let headline = tr('cardioStrain.freshHeadline');
  let description = tr('cardioStrain.freshDesc');
  let actionAdvice = tr('cardioStrain.freshAdvice');

  if (strainScore >= 55) {
    strainLevel = 'high';
    headline = tr('cardioStrain.highHeadline');
    description = tr('cardioStrain.highDesc', {
      rhr: rhrDelta !== null ? tr('cardioStrain.rhrVsBaseline', { delta: rhrDelta }) : '',
      hrv: currentHrv ? tr('cardioStrain.hrvSuppressed', { hrv: currentHrv }) : '',
    });
    actionAdvice = tr('cardioStrain.highAdvice');
  } else if (strainScore >= 30) {
    strainLevel = 'elevated';
    headline = tr('cardioStrain.elevatedHeadline');
    description = tr('cardioStrain.elevatedDesc', {
      rhr: rhrDelta !== null ? tr('cardioStrain.rhrVs7d', { delta: rhrDelta }) : '',
      hrv: currentHrv ? tr('cardioStrain.hrvAt', { hrv: currentHrv }) : '',
    });
    actionAdvice = tr('cardioStrain.elevatedAdvice');
  } else if (strainScore >= 15) {
    strainLevel = 'moderate';
    headline = tr('cardioStrain.moderateHeadline');
    description = tr('cardioStrain.moderateDesc');
    actionAdvice = tr('cardioStrain.moderateAdvice');
  }

  return {
    strainLevel,
    strainScore,
    restingHr: currentRhr,
    avgRhr,
    rhrDelta,
    rhrStatus,
    hrv: currentHrv,
    avgHrv,
    hrvDelta,
    hrvStatus,
    sleepMinutes,
    headline,
    description,
    actionAdvice,
  };
}

let lastForegroundSyncTimestamp = 0;
export async function autoSyncAppleHealthOnForeground(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const now = Date.now();
  // 15-minute throttle (900,000 ms)
  if (now - lastForegroundSyncTimestamp < 15 * 60 * 1000) return;
  lastForegroundSyncTimestamp = now;

  try {
    const isAvail = isHealthKitAvailable();
    if (!isAvail || !(await isAppleHealthConnected())) return;
    await syncAppleHealthData(8);
  } catch (err) {
    console.log('[AppleHealthService] Background auto-sync skipped/failed:', err);
  }
}

