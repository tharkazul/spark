import React from 'react';
import { Text } from 'react-native';

/**
 * "Garmin <device model>" (or just "Garmin") right under the title of a view with
 * Garmin data in it. Garmin's brand rules require it next to the title of every view
 * of that data (activity list, detail, feed, health cards), never tucked away in a
 * footnote. For workouts the server builds the text (garmin_attribution) and sends
 * none for workouts without Garmin data.
 */
export function GarminAttribution({ label, className = '' }: { label?: string | null; className?: string }) {
  if (!label) return null;
  return (
    <Text className={`text-xs font-medium text-theme-muted ${className}`} numberOfLines={1}>
      {label}
    </Text>
  );
}

/**
 * "Garmin" when a workout with Garmin data (garmin_attribution) started within the last
 * `days` days, else null. For views worked out from workouts, such as fitness, fatigue
 * and muscle load: Garmin's rules want Garmin named as a contributing source there too.
 */
export function garminActivityLabel(
  activities: ({ garmin_attribution?: string | null; start_date?: string | null } | null | undefined)[],
  days: number
): string | null {
  const since = Date.now() - days * 24 * 3600 * 1000;
  return activities.some((a) => a?.garmin_attribution && new Date(a.start_date || 0).getTime() >= since) ? 'Garmin' : null;
}

/** "Garmin" when any of these biometrics days has Garmin data in it (biometrics.from_garmin), else null. */
export function garminHealthLabel(days: ({ from_garmin?: number | boolean | null } | null | undefined)[]): string | null {
  return days.some((d) => d && d.from_garmin) ? 'Garmin' : null;
}
