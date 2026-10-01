/**
 * Centralized formatting utilities adhering to the Rooka UI/UX Improvement Spec.
 * All functions accept an optional language code and use Intl for locale-aware formatting.
 */

function parseDateInput(date: string | Date): Date {
  if (date instanceof Date) return date;
  if (typeof date === 'string') {
    // If it's a date-only string like "YYYY-MM-DD", treat it in local timezone components
    const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1], 10);
      const month = parseInt(dateMatch[2], 10) - 1;
      const day = parseInt(dateMatch[3], 10);
      return new Date(year, month, day);
    }
    return new Date(date);
  }
  return new Date();
}

/**
 * Returns "Today", "Yesterday", "Tomorrow", or formatted like "Mon 28 Sep"
 */
export function formatRelativeDay(dateInput: string | Date, locale: string = 'en'): string {
  const date = parseDateInput(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // Localized relative labels
  const relativeLabels: Record<string, { today: string; yesterday: string; tomorrow: string }> = {
    en: { today: 'Today', yesterday: 'Yesterday', tomorrow: 'Tomorrow' },
    nl: { today: 'Vandaag', yesterday: 'Gisteren', tomorrow: 'Morgen' },
    de: { today: 'Heute', yesterday: 'Gestern', tomorrow: 'Morgen' },
    es: { today: 'Hoy', yesterday: 'Ayer', tomorrow: 'Mañana' },
    fr: { today: "Aujourd'hui", yesterday: 'Hier', tomorrow: 'Demain' },
  };

  const labels = relativeLabels[locale] || relativeLabels.en;

  if (diffDays === 0) return labels.today;
  if (diffDays === -1) return labels.yesterday;
  if (diffDays === 1) return labels.tomorrow;

  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return formatter.format(date);
  } catch {
    return date.toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }
}

/**
 * Returns formatted relative day with time, e.g. "Today, 07:52" or "Mon 28 Sep, 19:10"
 */
export function formatRelativeDayAndTime(dateInput: string | Date, locale: string = 'en'): string {
  const dayStr = formatRelativeDay(dateInput, locale);
  if (!dateInput) return dayStr;
  try {
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) {
      const isString = typeof dateInput === 'string';
      if (!isString || dateInput.includes('T') || dateInput.includes(':')) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${dayStr}, ${hh}:${mm}`;
      }
    }
  } catch {}
  return dayStr;
}

/**
 * Formats duration in minutes to e.g. "38 min" or "1 h 05"
 */
export function formatDuration(mins: number): string {
  if (!mins || isNaN(mins) || mins <= 0) return '0 min';
  const totalMins = Math.round(mins);
  if (totalMins < 60) {
    return `${totalMins} min`;
  }
  const hours = Math.floor(totalMins / 60);
  const remainingMins = totalMins % 60;
  return `${hours} h ${remainingMins < 10 ? '0' : ''}${remainingMins}`;
}

/**
 * Formats seconds into clock time e.g. "38:00" or "1:05:12"
 */
export function formatClock(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '00:00';
  const totalSecs = Math.round(seconds);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const mm = mins < 10 ? `0${mins}` : `${mins}`;
  const ss = secs < 10 ? `0${secs}` : `${secs}`;

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Format any number with locale-awareness and fraction digit limits.
 * Uses Intl.NumberFormat to avoid floating point artifacts (e.g. 74.1999999 -> 74.2).
 */
export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
  locale: string = 'en'
): string {
  if (value === null || value === undefined || isNaN(value)) return '0';
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    if (options?.maximumFractionDigits !== undefined) {
      return value.toFixed(options.maximumFractionDigits);
    }
    return String(value);
  }
}

/**
 * Format integer values (XP, points, HR, power, cadence, elevation, etc.)
 */
export function formatInteger(value: number | null | undefined, locale: string = 'en'): string {
  return formatNumber(value, { maximumFractionDigits: 0 }, locale);
}

/**
 * Format body weight: exactly 1 decimal place with unit "74.2 kg"
 */
export function formatWeight(kg: number | null | undefined, locale: string = 'en'): string {
  if (kg === null || kg === undefined || isNaN(kg)) return '--\u00A0kg';
  const formatted = formatNumber(kg, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, locale);
  return `${formatted}\u00A0kg`;
}

/**
 * Format speed in km/h: 1 decimal place e.g. "28.4 km/h"
 */
export function formatSpeed(kmh: number | null | undefined, locale: string = 'en'): string {
  if (kmh === null || kmh === undefined || isNaN(kmh) || kmh <= 0) return '0.0\u00A0km/h';
  const formatted = formatNumber(kmh, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, locale);
  return `${formatted}\u00A0km/h`;
}

/**
 * Formats kilometers to 1 decimal place with locale decimal separator: "6.4 km"
 */
export function formatDistance(km: number, locale: string = 'en'): string {
  if (km === undefined || km === null || isNaN(km)) return '0.0\u00A0km';
  try {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(km);
    return `${formatted}\u00A0km`;
  } catch {
    return `${km.toFixed(1)}\u00A0km`;
  }
}

/**
 * Formats pace in min/km into "5:54 /km"
 */
export function formatPace(minPerKm: number): string {
  if (!minPerKm || isNaN(minPerKm) || minPerKm <= 0 || !isFinite(minPerKm)) {
    return '--:--\u00A0/km';
  }
  const totalSecs = Math.round(minPerKm * 60);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const ss = secs < 10 ? `0${secs}` : `${secs}`;
  return `${mins}:${ss}\u00A0/km`;
}

/**
 * Formats swim pace in seconds per 100m into e.g. "1:45 /100 m"
 */
export function formatSwimPace(totalSecsPer100m: number): string {
  if (!totalSecsPer100m || isNaN(totalSecsPer100m) || totalSecsPer100m <= 0 || !isFinite(totalSecsPer100m)) {
    return '--:--\u00A0/100\u00A0m';
  }
  const totalSecs = Math.round(totalSecsPer100m);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const ss = secs < 10 ? `0${secs}` : `${secs}`;
  return `${mins}:${ss}\u00A0/100\u00A0m`;
}

/**
 * Handles basic pluralization e.g. "1 quest", "2 quests"
 */
export function pluralize(noun: string, count: number, locale: string = 'en'): string {
  const c = Math.round(count);
  if (locale === 'nl') {
    if (noun === 'quest') return `${c} ${c === 1 ? 'quest' : 'quests'}`;
    if (noun === 'workout') return `${c} ${c === 1 ? 'workout' : 'workouts'}`;
    if (noun === 'day') return `${c} ${c === 1 ? 'dag' : 'dagen'}`;
    if (noun === 'comment') return `${c} ${c === 1 ? 'reactie' : 'reacties'}`;
    return `${c} ${noun}${c === 1 ? '' : 's'}`;
  }
  if (locale === 'de') {
    if (noun === 'quest') return `${c} ${c === 1 ? 'Quest' : 'Quests'}`;
    if (noun === 'workout') return `${c} ${c === 1 ? 'Workout' : 'Workouts'}`;
    if (noun === 'day') return `${c} ${c === 1 ? 'Tag' : 'Tage'}`;
    if (noun === 'comment') return `${c} ${c === 1 ? 'Kommentar' : 'Kommentare'}`;
    return `${c} ${noun}${c === 1 ? '' : 's'}`;
  }
  // English default
  return `${c} ${noun}${c === 1 ? '' : 's'}`;
}

/**
 * Calculates planned workout duration in minutes safely without mistaking
 * distance annotations (like 200m warmup) for minutes.
 */
export function calculateWorkoutDurationMinutes(workout: any): number {
  if (!workout) return 45;

  // 1. Direct planned duration if provided
  if (typeof workout.duration === 'number' && workout.duration > 0) {
    return Math.round(workout.duration);
  }
  if (typeof workout.duration_minutes === 'number' && workout.duration_minutes > 0) {
    return Math.round(workout.duration_minutes);
  }
  if (typeof workout.duration === 'string') {
    const dMatch = workout.duration.match(/^(\d+)\s*(?:min|mins|minute|minutes)?$/i);
    if (dMatch) return parseInt(dMatch[1], 10);
  }

  // 2. Title matching: e.g. "30-Min EVF & Pull Technique" or "45 min Tempo"
  const title = workout.title || workout.description || '';
  const titleMatch = title.match(/\b(\d+)\s*(?:-|–|\s)?(?:min|mins|minute|minutes)\b/i);
  if (titleMatch) {
    return parseInt(titleMatch[1], 10);
  }

  // 3. Structured steps calculation (including distance steps e.g. 200m or 1500m swim)
  if (workout.steps_json) {
    try {
      const steps =
        typeof workout.steps_json === 'string'
          ? JSON.parse(workout.steps_json)
          : workout.steps_json;
      if (Array.isArray(steps) && steps.length > 0) {
        let totalMins = 0;
        const sport = String(workout.sport || workout.type || '').toUpperCase();

        const parseSteps = (sArr: any[]) => {
          if (!Array.isArray(sArr)) return;
          for (const s of sArr) {
            if (s.type === 'repeat' && s.iterations && Array.isArray(s.steps)) {
              let iterMins = 0;
              for (const rs of s.steps) {
                const cVal = Number(rs.condition_value) || 0;
                if (rs.condition_type === 'time_sec') {
                  iterMins += cVal / 60;
                } else if (rs.condition_type === 'time') {
                  iterMins += cVal > 180 && cVal % 30 === 0 ? cVal / 60 : cVal;
                } else if (rs.condition_type === 'distance') {
                  if (sport === 'SWIM') iterMins += (cVal / 100) * 1.8;
                  else if (sport === 'BIKE' || sport === 'RIDE') iterMins += (cVal / 1000) * 2;
                  else iterMins += (cVal / 1000) * 5; // RUN
                } else if (rs.condition_type === 'distance_km') {
                  if (sport === 'BIKE' || sport === 'RIDE') iterMins += cVal * 2;
                  else iterMins += cVal * 5;
                }
              }
              totalMins += iterMins * (Number(s.iterations) || 1);
            } else {
              const cVal = Number(s.condition_value) || 0;
              if (s.condition_type === 'time_sec') {
                totalMins += cVal / 60;
              } else if (s.condition_type === 'time') {
                totalMins += cVal > 180 && cVal % 30 === 0 ? cVal / 60 : cVal;
              } else if (s.condition_type === 'distance') {
                if (sport === 'SWIM') totalMins += (cVal / 100) * 1.8;
                else if (sport === 'BIKE' || sport === 'RIDE') totalMins += (cVal / 1000) * 2;
                else totalMins += (cVal / 1000) * 5; // RUN
              } else if (s.condition_type === 'distance_km') {
                if (sport === 'BIKE' || sport === 'RIDE') totalMins += cVal * 2;
                else totalMins += cVal * 5;
              } else if (s.steps && Array.isArray(s.steps)) {
                parseSteps(s.steps);
              }
            }
          }
        };
        parseSteps(steps);
        if (totalMins > 0) return Math.round(totalMins);
      }
    } catch (e) {}
  }

  // 4. Details / notes matching: look for explicit "30 min" or "30 mins", NOT meters like "200m"
  const details = workout.details || workout.notes || '';
  if (details) {
    const detailsMatch = details.match(/\b(\d+)\s*(?:min|mins|minute|minutes)\b/i);
    if (detailsMatch) {
      return parseInt(detailsMatch[1], 10);
    }
  }

  return 45;
}

/**
 * Replaces every YYYY-MM-DD pattern in a text string with localized relative date
 */
export function humanizeIsoDates(text: string, locale: string = 'en'): string {
  if (!text) return '';
  return text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (match) => {
    return formatRelativeDay(match, locale);
  });
}
