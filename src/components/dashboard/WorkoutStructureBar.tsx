import React from 'react';
import { View } from 'react-native';

export const STEP_COLORS: Record<string, string> = {
  warmup: '#10B981', // emerald green
  interval: '#3B82F6', // blue
  recovery: '#F97316', // orange
  rest: '#F97316',
  cooldown: '#8B5CF6', // purple
};

interface WorkoutStructureBarProps {
  steps?: any[];
  className?: string;
}

export function WorkoutStructureBar({ steps, className }: WorkoutStructureBarProps) {
  if (!Array.isArray(steps) || steps.length === 0) return null;

  // Flatten repeated steps
  const flatSteps: { type: string; mins: number }[] = [];
  steps.forEach((s) => {
    if (s.type === 'repeat' && s.iterations && Array.isArray(s.steps)) {
      const iter = Number(s.iterations) || 1;
      for (let i = 0; i < iter; i++) {
        s.steps.forEach((rs: any) => {
          const val = Number(rs.condition_value) || 1;
          flatSteps.push({ type: rs.type || 'interval', mins: val });
        });
      }
    } else {
      const val = Number(s.condition_value) || 1;
      flatSteps.push({ type: s.type || 'interval', mins: val });
    }
  });

  const total = flatSteps.reduce((acc, curr) => acc + curr.mins, 0) || 1;

  return (
    <View className={`h-2 w-full rounded-full flex-row overflow-hidden bg-theme-inset ${className || 'my-1.5'}`}>
      {flatSteps.map((step, idx) => {
        const pct = Math.max(2, (step.mins / total) * 100);
        const col = STEP_COLORS[step.type?.toLowerCase()] || '#3B82F6';
        return (
          <View
            key={`step-seg-${idx}`}
            style={{ width: `${pct}%`, backgroundColor: col }}
            className="h-full"
          />
        );
      })}
    </View>
  );
}
