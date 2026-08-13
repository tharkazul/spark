import { WorkoutStep } from '../types/plan';
import { matchGarminExerciseClient, GarminExercise } from './garminExercises';

export function generateStepId(): string {
  const rand = Math.random().toString(36).substring(2, 9);
  const time = Date.now().toString(36);
  return `step_${time}_${rand}`;
}

export function enrichStepWithGarmin(step: WorkoutStep): WorkoutStep {
  const updated = { ...step };

  if (updated.exerciseName && !updated.garmin_exercise_name) {
    const matched = matchGarminExerciseClient(updated.exerciseName);
    if (matched) {
      updated.garmin_exercise_name = matched.exercise_name;
      updated.garmin_category_key = matched.category_key;
      updated.garmin_exercise_key = matched.exercise_key;
    }
  }

  if (updated.type === 'repeat' && Array.isArray(updated.steps)) {
    updated.steps = updated.steps.map(enrichStepWithGarmin);
  }

  return updated;
}

export function ensureStepIds(steps: WorkoutStep[]): WorkoutStep[] {
  return steps.map((step) => {
    const id = step.id || generateStepId();
    let updatedStep: WorkoutStep = {
      ...step,
      id,
    };

    updatedStep = enrichStepWithGarmin(updatedStep);

    if (updatedStep.type === 'repeat' && Array.isArray(updatedStep.steps)) {
      updatedStep.steps = ensureStepIds(updatedStep.steps);
    }

    return updatedStep;
  });
}

export function parseStepsJson(rawSteps?: string | WorkoutStep[] | null): WorkoutStep[] {
  if (!rawSteps) {
    return [];
  }

  let parsed: WorkoutStep[] = [];

  if (typeof rawSteps === 'string') {
    const trimmed = rawSteps.trim();
    if (!trimmed || trimmed === '[]') {
      return [];
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      console.warn('[steps.ts] Failed to parse steps_json string:', err);
      return [];
    }
  } else if (Array.isArray(rawSteps)) {
    parsed = rawSteps;
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return ensureStepIds(parsed);
}

export function serializeStepsJson(steps: WorkoutStep[]): string {
  if (!Array.isArray(steps) || steps.length === 0) {
    return '[]';
  }
  return JSON.stringify(steps);
}

export function createStep(
  type: WorkoutStep['type'] = 'interval',
  overrides?: Partial<WorkoutStep>
): WorkoutStep {
  const baseStep: WorkoutStep = {
    id: generateStepId(),
    type,
    condition_type: type === 'rest' ? 'time_sec' : 'time',
    condition_value: type === 'rest' ? 60 : 10,
    target_type: 'no.target',
  };

  if (type === 'repeat') {
    baseStep.iterations = 4;
    baseStep.steps = [
      createStep('interval', { condition_value: 3, target_type: 'heart.rate.zone', zone: 4 }),
      createStep('recovery', { condition_value: 1, target_type: 'heart.rate.zone', zone: 1 }),
    ];
  }

  return enrichStepWithGarmin({
    ...baseStep,
    ...overrides,
  });
}

export function addStep(steps: WorkoutStep[], newStep: WorkoutStep, parentId?: string): WorkoutStep[] {
  const normalizedNewStep = ensureStepIds([newStep])[0];

  if (!parentId) {
    return [...steps, normalizedNewStep];
  }

  return steps.map((step) => {
    if (step.id === parentId && step.type === 'repeat') {
      return {
        ...step,
        steps: [...(step.steps || []), normalizedNewStep],
      };
    }
    if (step.steps && step.steps.length > 0) {
      return {
        ...step,
        steps: addStep(step.steps, normalizedNewStep, parentId),
      };
    }
    return step;
  });
}

export function updateStep(
  steps: WorkoutStep[],
  stepId: string,
  updates: Partial<WorkoutStep>
): WorkoutStep[] {
  return steps.map((step) => {
    if (step.id === stepId) {
      const updated = enrichStepWithGarmin({ ...step, ...updates });
      if (updated.type === 'repeat' && Array.isArray(updated.steps)) {
        updated.steps = ensureStepIds(updated.steps);
      }
      return updated;
    }

    if (step.steps && step.steps.length > 0) {
      return {
        ...step,
        steps: updateStep(step.steps, stepId, updates),
      };
    }

    return step;
  });
}

export function removeStep(steps: WorkoutStep[], stepId: string): WorkoutStep[] {
  return steps
    .filter((step) => step.id !== stepId)
    .map((step) => {
      if (step.steps && step.steps.length > 0) {
        return {
          ...step,
          steps: removeStep(step.steps, stepId),
        };
      }
      return step;
    });
}

export function duplicateStep(steps: WorkoutStep[], stepId: string): WorkoutStep[] {
  const result: WorkoutStep[] = [];

  for (const step of steps) {
    result.push(step);
    if (step.id === stepId) {
      const clone = JSON.parse(JSON.stringify(step));
      delete clone.id;
      if (clone.type === 'repeat' && Array.isArray(clone.steps)) {
        const stripIds = (arr: WorkoutStep[]) => {
          arr.forEach((s) => {
            delete s.id;
            if (s.steps) stripIds(s.steps);
          });
        };
        stripIds(clone.steps);
      }
      const [duped] = ensureStepIds([clone]);
      result.push(duped);
    } else if (step.steps && step.steps.length > 0) {
      step.steps = duplicateStep(step.steps, stepId);
    }
  }

  return result;
}
