import React, { useContext } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { WorkoutStep } from '../../types/plan';
import { CARD_COLORS } from './StepCard.styles';
import { ExerciseInfoContext } from './ExerciseInfoSheet';
import { useLanguage } from '@/context/LanguageContext';

type T = (key: string, params?: any) => string;

const isRestStep = (s: WorkoutStep) => s.type === 'recovery' || s.type === 'rest';

/** "20 reps", "5 min", "45 s", "1000 m". */
function amountText(step: WorkoutStep, isStrength: boolean, t: T): string {
  const v = step.condition_value;
  if (v === undefined || v === null || (v as any) === '') return '';
  switch (step.condition_type || (isStrength ? 'reps' : 'time')) {
    case 'reps':
      return t('stepRead.reps', { count: v });
    case 'time_sec':
      return t('stepRead.sec', { count: v });
    case 'distance':
      return t('stepRead.metres', { count: v });
    case 'distance_km':
      return t('stepRead.km', { count: v });
    default:
      return t('stepRead.min', { count: v });
  }
}

/** What to aim for: "20 kg", "HR Zone 2", "Pace: 1:55". Nothing for an open target. */
function targetText(step: WorkoutStep, t: T): string {
  switch (step.target_type) {
    case 'weight':
      return step.weight ? `${step.weight} kg` : '';
    case 'heart.rate.zone':
      return t('stepCard.hrZone', { zone: step.zone || 2 });
    case 'power.zone':
      return t('stepCard.powerZone', { zone: step.zone || 2 });
    case 'pace.zone':
      return t('stepCard.paceZone', { zone: step.zone || 2 });
    case 'speed.zone':
      return t('stepCard.speedZone', { zone: step.zone || 2 });
    case 'pace.exact':
      return step.target_value ? t('stepCard.paceValue', { value: step.target_value }) : '';
    case 'power.exact':
      return step.target_value ? t('stepCard.powerValue', { value: step.target_value }) : '';
    default:
      return '';
  }
}

const joinParts = (parts: string[]) => parts.filter(Boolean).join(' · ');

function InfoButton({ name }: { name?: string }) {
  const showExerciseInfo = useContext(ExerciseInfoContext);
  const { t } = useLanguage();
  if (!showExerciseInfo || !name || name.trim().length <= 2) return null;
  return (
    <TouchableOpacity
      onPress={() => showExerciseInfo(name.trim())}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={t('exercise.infoA11y', { name })}
      className="w-9 h-9 rounded-full bg-theme-accent/10 items-center justify-center"
    >
      <Ionicons name="information-circle-outline" size={20} color="#0EA5E9" />
    </TouchableOpacity>
  );
}

/** One line of a round: "Deadbugs" with "20 reps · 20 kg" beneath, or "Rest · 45 s". */
function ReadRow({ step, isStrength, t }: { step: WorkoutStep; isStrength: boolean; t: T }) {
  const amount = amountText(step, isStrength, t);
  const target = targetText(step, t);
  if (isRestStep(step)) {
    return (
      <Text className="text-base text-theme-muted font-semibold">
        {joinParts([t(`stepRead.type_${step.type}`), amount])}
      </Text>
    );
  }
  const name = step.exerciseName?.trim();
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1">
        <Text className="text-lg font-bold text-theme-text">{name || amount}</Text>
        {(name ? joinParts([amount, target]) : target) ? (
          <Text className="text-base text-theme-muted font-semibold mt-0.5">{name ? joinParts([amount, target]) : target}</Text>
        ) : null}
      </View>
      <InfoButton name={name} />
    </View>
  );
}

/**
 * A step as it reads mid-session: the exercise in large type with what to do beneath it
 * ("Deadbugs" / "3 × 20 reps · 45 s rest"), instead of the editor's greyed-out inputs.
 */
export function StepReadCard({ step, isStrength }: { step: WorkoutStep; isStrength: boolean }) {
  const { t } = useLanguage();
  const colorConfig = CARD_COLORS[step.type as keyof typeof CARD_COLORS] || CARD_COLORS.default;
  const rounds = step.iterations || 1;
  const children = step.steps || [];
  const work = children.filter((s) => !isRestStep(s));
  const rest = children.filter(isRestStep);

  let body: React.ReactNode;
  let label = t(`stepRead.type_${step.type}`);

  if (step.type === 'repeat' && work.length === 1 && rest.length <= 1) {
    // The common block: one exercise, done N times with a rest between.
    const w = work[0];
    const name = w.exerciseName?.trim();
    const amount = amountText(w, isStrength, t);
    const restText = rest[0] ? t('stepRead.restAfter', { value: amountText(rest[0], isStrength, t) }) : '';
    const sets = amount ? `${rounds} × ${amount}` : t('stepRead.rounds', { count: rounds });
    label = t(`stepRead.type_${w.type}`);
    body = (
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-xl font-bold text-theme-text">{name || sets}</Text>
          <Text className="text-base text-theme-muted font-semibold mt-0.5">
            {joinParts([name ? sets : '', targetText(w, t), restText])}
          </Text>
        </View>
        <InfoButton name={name} />
      </View>
    );
  } else if (step.type === 'repeat') {
    label = t('stepRead.rounds', { count: rounds });
    body = (
      <View className="gap-y-2.5">
        {children.map((sub, i) => (
          <ReadRow key={sub.id || i} step={sub} isStrength={isStrength} t={t} />
        ))}
      </View>
    );
  } else {
    body = <ReadRow step={step} isStrength={isStrength} t={t} />;
  }

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ marginBottom: 8 }}>
      <View className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden flex-row">
        <View className="w-1.5" style={{ backgroundColor: colorConfig.bar }} />
        <View className="flex-1 px-4 py-3.5">
          <Text className="text-[11px] font-extrabold uppercase tracking-wider mb-1" style={{ color: colorConfig.bar }}>
            {label}
          </Text>
          {body}
        </View>
      </View>
    </Animated.View>
  );
}
