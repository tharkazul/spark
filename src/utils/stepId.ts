import { WorkoutStep } from '../types/plan';

export const makeStepId = () =>
  `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Backfills IDs on plans saved before this migration. Run ONCE at load. */
export function ensureStepIds(steps: WorkoutStep[]): WorkoutStep[] {
  return steps.map((s) => ({
    ...s,
    id: s.id ?? makeStepId(),
    steps: s.steps ? ensureStepIds(s.steps) : undefined,
  }));
}
