import { Platform } from 'react-native';
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
    return { success: false, message: 'Apple Watch sync is only available on iPhone.' };
  }
  if (parseInt(String(Platform.Version), 10) < 17) {
    return { success: false, message: 'Sending workouts to Apple Watch needs iOS 17 or newer.' };
  }
  const kit = getWorkoutKit();
  if (!kit) {
    return {
      success: false,
      message:
        'This build of rooka does not include Apple Watch support. Reinstall the latest build and try again.',
    };
  }
  if (kit.isAvailable !== true) {
    return {
      success: false,
      message: 'Apple Health is unavailable on this device, so workouts cannot be sent to a Watch.',
    };
  }

  let status = await getWorkoutKitAuthorizationStatus();
  if (status === 'notDetermined' || status === 'unknown') {
    status = await requestWorkoutKitAuthorization();
  }
  if (status !== 'authorized') {
    return { success: false, message: WORKOUT_KIT_DENIED_MESSAGE };
  }

  const config = buildCustomWorkoutConfig(workout);
  if (!config) {
    return {
      success: false,
      message: `rooka cannot send "${workout.sport}" sessions to Apple Watch.`,
    };
  }

  const date = toDateComponents(workout.date);

  try {
    return await schedule(config, date, false);
  } catch (err) {
    if (!isValidationError(err)) {
      return { success: false, message: describeError(err) };
    }
    // Second pass without alerts: the structure and durations still make it over.
    try {
      return await schedule(stripAlerts(config), date, true);
    } catch (retryErr) {
      return { success: false, message: describeError(retryErr) };
    }
  }
}

/**
 * Opens Apple's own workout preview sheet so the athlete can eyeball the session
 * (and add it to the Watch) before it is scheduled.
 */
export async function previewWorkoutOnAppleWatch(workout: PlannedWorkout): Promise<HealthKitSyncResult> {
  if (!isWorkoutKitSupported()) {
    return { success: false, message: 'Apple Watch preview needs an iPhone on iOS 17 or newer.' };
  }

  const config = buildCustomWorkoutConfig(workout);
  if (!config) {
    return { success: false, message: `rooka cannot preview "${workout.sport}" sessions on Apple Watch.` };
  }

  const kit = getWorkoutKit();
  if (!kit) return { success: false, message: 'Apple Watch preview is unavailable in this build.' };

  let plan: WorkoutPlan | null = null;
  try {
    plan = await kit.createCustomWorkoutPlan(config);
    await plan.preview();
    return { success: true, message: 'Preview opened.' };
  } catch (err) {
    return { success: false, message: describeError(err) };
  } finally {
    plan?.release();
  }
}

export const WORKOUT_KIT_DENIED_MESSAGE =
  'rooka is not allowed to schedule workouts yet. Open the Watch app on your iPhone, tap rooka, and turn on workout scheduling.';

// -----------------------------------------------------------------------------
// rooka steps -> WorkoutKit CustomWorkout
// -----------------------------------------------------------------------------

/**
 * A WorkoutKit CustomWorkout is a single optional warmup, a list of interval
 * blocks, and a single optional cooldown — not the flat list rooka stores. A
 * rooka `repeat` step becomes a block with iterations; every other step becomes a
 * one-iteration block of its own.
 */
export function buildCustomWorkoutConfig(workout: PlannedWorkout): CustomWorkoutConfig | null {
  const activity = getAppleActivity(workout.sport);
  if (!activity) return null;

  const steps = parseSteps(workout);
  const { activityType, locationType } = activity;

  let warmup: KitWorkoutStep | undefined;
  let cooldown: KitWorkoutStep | undefined;
  const blocks: IntervalBlock[] = [];

  for (const step of steps) {
    if (step.type === 'warmup' && !warmup && blocks.length === 0) {
      warmup = toKitStep(step, activityType);
      continue;
    }

    if (step.type === 'repeat') {
      const nested = (step.steps || []).map((s) => toIntervalStep(s, activityType));
      if (nested.length > 0) {
        blocks.push({ iterations: Math.max(1, step.iterations || 1), steps: nested });
      }
      continue;
    }

    blocks.push({ iterations: 1, steps: [toIntervalStep(step, activityType)] });
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

function toIntervalStep(step: WorkoutStep, activityType: ActivityType): IntervalStep {
  const kit = toKitStep(step, activityType);
  return {
    purpose: step.type === 'recovery' || step.type === 'rest' ? 'recovery' : 'work',
    goal: kit.goal,
    alert: kit.alert,
  };
}

function toKitStep(step: WorkoutStep, activityType: ActivityType): KitWorkoutStep {
  // Warmup steps are meant for ramping up from resting heart rate.
  // Attaching a strict heart rate zone alert to a warmup causes Apple Watch to chime
  // and vocalize "Below Zone" every 20 seconds while the athlete is still cold.
  const isColdWarmup = step.type === 'warmup' && step.target_type === 'heart.rate.zone';
  const alert = isColdWarmup ? undefined : toAlert(step, activityType);
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
function toAlert(step: WorkoutStep, activityType: ActivityType): WorkoutAlert | undefined {
  const onFoot = activityType === 'running' || activityType === 'walking' || activityType === 'hiking';
  const onBike = activityType === 'cycling';

  switch (step.target_type) {
    case 'heart.rate.zone': {
      const zone = Number(step.zone);
      if (!Number.isFinite(zone) || zone < 1 || zone > 5) return undefined;
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

function getAppleActivity(sport: string): { activityType: ActivityType; locationType: LocationType } | null {
  switch ((sport || '').toUpperCase()) {
    case 'RUN':
      return { activityType: 'running', locationType: 'outdoor' };
    case 'BIKE':
      return { activityType: 'cycling', locationType: 'outdoor' };
    // WorkoutKit reads `indoor` as pool swimming, which is what rooka's
    // metre-based swim steps describe.
    case 'SWIM':
      return { activityType: 'swimming', locationType: 'indoor' };
    case 'STRENGTH':
      return { activityType: 'traditionalStrengthTraining', locationType: 'indoor' };
    case 'MOBILITY':
      return { activityType: 'yoga', locationType: 'indoor' };
    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function schedule(
  config: CustomWorkoutConfig,
  date: DateComponents,
  degraded: boolean,
): Promise<HealthKitSyncResult> {
  const kit = getWorkoutKit();
  if (!kit) throw new Error('Apple Watch support is unavailable in this build.');

  let plan: WorkoutPlan | null = null;
  try {
    plan = await kit.createCustomWorkoutPlan(config);
    const result = await plan.scheduleAndSync(date);
    return {
      success: true,
      degraded,
      scheduledId: result.id,
      message: degraded
        ? `"${config.displayName}" is on your Apple Watch, but Apple does not support those targets for this sport, so the steps went over without them.`
        : `"${config.displayName}" is on your Apple Watch.`,
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
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  const base = match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : (() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
      })();

  // rooka plans days, not clock times. Scheduling at 06:00 keeps the session at
  // the top of the Watch's Workout list for the whole training day.
  return { ...base, hour: 6, minute: 0 };
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
  if (!err) return 'Something went wrong sending this workout to your Apple Watch.';
  if (typeof err === 'string') return err;
  return err.message || err.code || 'Something went wrong sending this workout to your Apple Watch.';
}

// =============================================================================
// Apple HealthKit Reading & Synchronization
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './apiClient';

const LAST_SYNC_KEY = '@rooka:last_apple_health_sync';
const PREFS_KEY = '@rooka:apple_health_sync_preferences';
const TODAY_BIOMETRICS_KEY = '@rooka:today_biometrics_cache';

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

    return true;
  } catch (err: any) {
    console.warn('[AppleHealthService] requestFullHealthKitPermissions error:', err?.message || err);
    return false;
  }
}

/**
 * Fetches daily biometric & recovery data (HR, HRV, Sleep, Steps, Calories, Weight, VO2Max)
 * for the past N days from Apple Health according to user preferences.
 */
export async function fetchHealthKitBiometrics(
  daysBack = 7,
  customPrefs?: AppleHealthSyncPreferences
): Promise<AppleHealthDailyBiometrics[]> {
  if (Platform.OS !== 'ios') return [];
  try {
    const HealthKit = require('@kingstinct/react-native-healthkit').default;
    const { HKQuantityTypeIdentifier, HKCategoryTypeIdentifier } = require('@kingstinct/react-native-healthkit');

    const prefs = customPrefs || (await getAppleHealthPreferences());
    const biometricsMap = new Map<string, AppleHealthDailyBiometrics>();

    const now = new Date();
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const startOfDay = new Date(d);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(d);
      endOfDay.setHours(23, 59, 59, 999);

      biometricsMap.set(dateStr, {
        date: dateStr,
      });

      // 1. Resting Heart Rate
      if (prefs.syncHeartRate) {
        try {
          const typeId = HKQuantityTypeIdentifier?.restingHeartRate || 'HKQuantityTypeIdentifierRestingHeartRate';
          const restingSamples = await HealthKit.queryQuantitySamples(
            typeId,
            { filter: { date: { startDate: startOfDay, endDate: endOfDay } }, limit: 10 }
          );
          if (restingSamples && restingSamples.length > 0) {
            const latest = restingSamples[restingSamples.length - 1];
            const entry = biometricsMap.get(dateStr)!;
            entry.resting_hr = Math.round(latest.quantity);
          }
        } catch {}
      }

      // 2. Heart Rate Variability (SDNN in ms)
      if (prefs.syncHrv) {
        try {
          const typeId = HKQuantityTypeIdentifier?.heartRateVariabilitySDNN || 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN';
          const hrvSamples = await HealthKit.queryQuantitySamples(
            typeId,
            { filter: { date: { startDate: startOfDay, endDate: endOfDay } }, limit: 20 }
          );
          if (hrvSamples && hrvSamples.length > 0) {
            const sum = hrvSamples.reduce((acc: number, s: any) => acc + s.quantity, 0);
            const entry = biometricsMap.get(dateStr)!;
            entry.hrv_sdnn = Math.round((sum / hrvSamples.length) * 10) / 10;
          }
        } catch {}
      }

      // 3. Heart Rate (Min, Max, Avg)
      if (prefs.syncHeartRate) {
        try {
          const typeId = HKQuantityTypeIdentifier?.heartRate || 'HKQuantityTypeIdentifierHeartRate';
          const hrSamples = await HealthKit.queryQuantitySamples(
            typeId,
            { filter: { date: { startDate: startOfDay, endDate: endOfDay } }, limit: 200 }
          );
          if (hrSamples && hrSamples.length > 0) {
            const quantities = hrSamples.map((s: any) => s.quantity);
            const entry = biometricsMap.get(dateStr)!;
            entry.min_hr = Math.round(Math.min(...quantities));
            entry.max_hr = Math.round(Math.max(...quantities));
            const sum = quantities.reduce((a: number, b: number) => a + b, 0);
            entry.avg_hr = Math.round(sum / quantities.length);
          }
        } catch {}
      }

      // 4. Step Count
      if (prefs.syncStepsCalories) {
        try {
          const typeId = HKQuantityTypeIdentifier?.stepCount || 'HKQuantityTypeIdentifierStepCount';
          const stepSamples = await HealthKit.queryQuantitySamples(
            typeId,
            { filter: { date: { startDate: startOfDay, endDate: endOfDay } }, limit: 200 }
          );
          if (stepSamples && stepSamples.length > 0) {
            const totalSteps = stepSamples.reduce((acc: number, s: any) => acc + s.quantity, 0);
            const entry = biometricsMap.get(dateStr)!;
            entry.steps = Math.round(totalSteps);
          }
        } catch {}

        // 5. Active Energy Burned (Calories)
        try {
          const typeId = HKQuantityTypeIdentifier?.activeEnergyBurned || 'HKQuantityTypeIdentifierActiveEnergyBurned';
          const energySamples = await HealthKit.queryQuantitySamples(
            typeId,
            { filter: { date: { startDate: startOfDay, endDate: endOfDay } }, limit: 200 }
          );
          if (energySamples && energySamples.length > 0) {
            const totalCalories = energySamples.reduce((acc: number, s: any) => acc + s.quantity, 0);
            const entry = biometricsMap.get(dateStr)!;
            entry.active_calories = Math.round(totalCalories);
          }
        } catch {}
      }

      // 6. Sleep Analysis (Evening before to afternoon of that day)
      if (prefs.syncSleep) {
        try {
          const sleepWindowStart = new Date(startOfDay);
          sleepWindowStart.setHours(sleepWindowStart.getHours() - 8); // 16:00 previous day

          const typeId = HKCategoryTypeIdentifier?.sleepAnalysis || 'HKCategoryTypeIdentifierSleepAnalysis';
          const sleepSamples = await HealthKit.queryCategorySamples(
            typeId,
            { filter: { date: { startDate: sleepWindowStart, endDate: endOfDay } }, limit: 100 }
          );

          if (sleepSamples && sleepSamples.length > 0) {
            let deepMins = 0;
            let remMins = 0;
            let coreMins = 0;
            let awakeMins = 0;
            let totalAsleepMins = 0;

            for (const s of sleepSamples) {
              const durationMins = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
              if (durationMins <= 0) continue;

              const val = s.value;
              // HKCategoryValueSleepAnalysis: 4 = Deep, 5 = REM, 3 = Core, 2 = Awake, 1 = Asleep (generic), 0 = InBed
              if (val === 4 || val === 'asleepDeep') {
                deepMins += durationMins;
                totalAsleepMins += durationMins;
              } else if (val === 5 || val === 'asleepREM') {
                remMins += durationMins;
                totalAsleepMins += durationMins;
              } else if (val === 3 || val === 'asleepCore') {
                coreMins += durationMins;
                totalAsleepMins += durationMins;
              } else if (val === 2 || val === 'awake') {
                awakeMins += durationMins;
              } else if (val === 1 || val === 'asleepUnspecified' || val === 'asleep' || val === 0 || val === 'inBed') {
                totalAsleepMins += durationMins;
              }
            }

            const entry = biometricsMap.get(dateStr)!;
            entry.sleep_minutes = Math.round(totalAsleepMins);
            entry.sleep_deep_minutes = Math.round(deepMins);
            entry.sleep_rem_minutes = Math.round(remMins);
            entry.sleep_core_minutes = Math.round(coreMins);
            entry.sleep_awake_minutes = Math.round(awakeMins);
          }
        } catch {}
      }

      // 7. Body Mass / Weight
      if (prefs.syncBodyMass) {
        try {
          const typeId = HKQuantityTypeIdentifier?.bodyMass || 'HKQuantityTypeIdentifierBodyMass';
          const weightSample = await HealthKit.getMostRecentQuantitySample(typeId);
          if (weightSample) {
            const entry = biometricsMap.get(dateStr)!;
            entry.weight_kg = Math.round(weightSample.quantity * 10) / 10;
          }
        } catch {}

        // 8. Body Fat Percentage
        try {
          const typeId = HKQuantityTypeIdentifier?.bodyFatPercentage || 'HKQuantityTypeIdentifierBodyFatPercentage';
          const fatSample = await HealthKit.getMostRecentQuantitySample(typeId);
          if (fatSample) {
            const entry = biometricsMap.get(dateStr)!;
            entry.body_fat_percent = Math.round(fatSample.quantity * 1000) / 10;
          }
        } catch {}
      }

      // 9. VO2 Max
      if (prefs.syncVo2Max) {
        try {
          const typeId = HKQuantityTypeIdentifier?.vo2Max || 'HKQuantityTypeIdentifierVO2Max';
          const vo2Sample = await HealthKit.getMostRecentQuantitySample(typeId);
          if (vo2Sample) {
            const entry = biometricsMap.get(dateStr)!;
            entry.vo2_max = Math.round(vo2Sample.quantity * 10) / 10;
          }
        } catch {}
      }
    }

    return Array.from(biometricsMap.values());
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
  const numeric = typeof typeId === 'number' ? typeId : parseInt(String(typeId), 10);
  switch (numeric) {
    case 1:
    case 52:
      return 'Run';
    case 13:
      return 'Bike';
    case 46:
      return 'Swim';
    case 50:
    case 59:
      return 'Strength';
    case 24:
      return 'Walk';
    case 57:
    case 68:
      return 'Mobility';
    default:
      return 'Cardio';
  }
}

/**
 * Pulls all recent biometrics and workouts from Apple Health and syncs them to the backend server.
 */
export async function syncAppleHealthData(daysBack = 7): Promise<HealthKitSyncSummary> {
  if (Platform.OS !== 'ios') {
    return { success: false, message: 'Apple Health sync is only available on iOS.' };
  }

  try {
    const prefs = await getAppleHealthPreferences();
    const biometricsPromise = fetchHealthKitBiometrics(daysBack, prefs);
    const workoutsPromise = prefs.syncWorkouts ? fetchHealthKitWorkouts(Math.max(daysBack, 14)) : Promise.resolve([]);

    const [biometrics, workouts] = await Promise.all([biometricsPromise, workoutsPromise]);

    // Cache today's biometrics locally for instant UI access
    const todayStr = new Date().toISOString().split('T')[0];
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

    return {
      success: true,
      message: res.message || 'Apple Health sync completed successfully.',
      biometricsSynced: res.biometricsSynced ?? biometrics.length,
      workoutsSynced: res.workoutsSynced ?? workouts.length,
      lastSyncDate: nowISO,
    };
  } catch (err: any) {
    console.error('[AppleHealthService] Sync failed:', err?.message || err);
    return {
      success: false,
      message: err?.message || 'Failed to sync Apple Health data with server.',
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
      const todayStr = new Date().toISOString().split('T')[0];
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
      headline: 'Cardiovascular State: Stable',
      description: 'No biometric data synced yet.',
      actionAdvice: 'Sync Apple Health or Garmin to analyze your autonomic recovery.',
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
  let headline = 'Cardiovascular Engine: Fresh & Primed';
  let description = 'Resting heart rate and autonomic tone (HRV) indicate minimal fatigue and optimal recovery.';
  let actionAdvice = 'Great day for high-intensity training or quality intervals!';

  if (strainScore >= 55) {
    strainLevel = 'high';
    headline = 'Cardiovascular Strain: High';
    description = `Resting HR is elevated${rhrDelta !== null ? ` (+${rhrDelta} bpm vs baseline)` : ''}${currentHrv ? ` and HRV is suppressed (${currentHrv} ms)` : ''}. Your autonomic nervous system is carrying heavy recovery debt.`;
    actionAdvice = 'Prioritize active recovery, light mobility, or an easy Zone 1 walk.';
  } else if (strainScore >= 30) {
    strainLevel = 'elevated';
    headline = 'Cardiovascular Strain: Elevated';
    description = `Resting HR is trending upward${rhrDelta !== null ? ` (+${rhrDelta} bpm vs 7d avg)` : ''}${currentHrv ? `, with HRV at ${currentHrv} ms` : ''}. Central recovery demand is elevated.`;
    actionAdvice = 'Stick to aerobic Zone 2 endurance or reduce total session volume.';
  } else if (strainScore >= 15) {
    strainLevel = 'moderate';
    headline = 'Cardiovascular State: Moderate Recovery';
    description = 'Slight physiological load detected. Cardiovascular markers are mostly stable.';
    actionAdvice = 'Proceed with planned workouts, but monitor heart rate drift during efforts.';
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
    if (!isAvail) return;
    await syncAppleHealthData(3);
  } catch (err) {
    console.log('[AppleHealthService] Background auto-sync skipped/failed:', err);
  }
}

