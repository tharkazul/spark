/**
 * Which muscles an exercise works, for the exercise info sheet's body map.
 *
 * Matched on keywords in the exercise name, so it covers the Garmin catalogue
 * and the free-text names the coach writes ("Bulgarian Split Squat", "Farmers
 * Carry"). First matching rule wins; order goes from specific to general.
 */
export type MuscleRegion =
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'hips'
  | 'core'
  | 'obliques'
  | 'lower_back'
  | 'chest'
  | 'shoulders'
  | 'rear_delts'
  | 'traps'
  | 'lats'
  | 'biceps'
  | 'triceps'
  | 'forearms';

export interface ExerciseMuscles {
  primary: MuscleRegion[];
  secondary: MuscleRegion[];
}

const RULES: { match: RegExp; primary: MuscleRegion[]; secondary: MuscleRegion[] }[] = [
  { match: /split\s*squat|bulgarian|lunge|step[\s-]*up/i, primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core', 'hips'] },
  { match: /front\s*squat|goblet/i, primary: ['quads'], secondary: ['glutes', 'core'] },
  { match: /squat|leg\s*press|wall\s*ball|thruster/i, primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core'] },
  { match: /romanian|rdl|stiff|good\s*morning|single[\s-]*leg\s*deadlift/i, primary: ['hamstrings', 'glutes'], secondary: ['lower_back', 'core'] },
  { match: /deadlift|kettlebell\s*swing|\bswing\b/i, primary: ['hamstrings', 'glutes', 'lower_back'], secondary: ['quads', 'traps', 'forearms'] },
  { match: /hip\s*thrust|glute\s*bridge|bridge|hip\s*raise/i, primary: ['glutes'], secondary: ['hamstrings', 'core'] },
  { match: /nordic|leg\s*curl|hamstring/i, primary: ['hamstrings'], secondary: ['calves'] },
  { match: /calf|heel\s*raise|pogo|skipping|jump\s*rope/i, primary: ['calves'], secondary: [] },
  { match: /clam|abduct|monster\s*walk|band\s*walk|lateral\s*walk|side\s*plank\s*hip/i, primary: ['hips', 'glutes'], secondary: [] },
  { match: /farmer|carry|suitcase/i, primary: ['forearms', 'traps', 'core'], secondary: ['glutes', 'quads'] },
  { match: /sled|prowler/i, primary: ['quads', 'glutes'], secondary: ['calves', 'core'] },
  { match: /burpee/i, primary: ['quads', 'chest'], secondary: ['core', 'shoulders', 'triceps'] },
  { match: /ski\s*erg|skierg/i, primary: ['lats', 'triceps'], secondary: ['core', 'glutes'] },
  { match: /row(?!ing\s*machine)|pull[\s-]*up|chin[\s-]*up|lat\s*pull|pulldown/i, primary: ['lats'], secondary: ['biceps', 'rear_delts', 'forearms'] },
  { match: /rowing|erg/i, primary: ['lats', 'quads'], secondary: ['glutes', 'core', 'biceps'] },
  { match: /bench|push[\s-]*up|press[\s-]*up|chest\s*press|fly|dip/i, primary: ['chest', 'triceps'], secondary: ['shoulders', 'core'] },
  { match: /overhead|shoulder\s*press|military|lateral\s*raise|front\s*raise|arnold/i, primary: ['shoulders'], secondary: ['triceps', 'traps', 'core'] },
  { match: /face\s*pull|rear\s*delt|reverse\s*fly|y[\s-]*t[\s-]*w|band\s*pull[\s-]*apart/i, primary: ['rear_delts', 'traps'], secondary: [] },
  { match: /shrug/i, primary: ['traps'], secondary: ['forearms'] },
  { match: /curl/i, primary: ['biceps'], secondary: ['forearms'] },
  { match: /tricep|skull|pushdown|kickback/i, primary: ['triceps'], secondary: [] },
  { match: /side\s*plank|pallof|russian\s*twist|woodchop|oblique|copenhagen/i, primary: ['obliques', 'core'], secondary: ['hips'] },
  { match: /bird[\s-]*dog|superman|back\s*extension|hyperextension/i, primary: ['lower_back'], secondary: ['glutes', 'core'] },
  { match: /plank|dead\s*bug|crunch|sit[\s-]*up|hollow|leg\s*raise|ab\s*wheel|rollout|mountain\s*climber/i, primary: ['core'], secondary: ['obliques', 'shoulders'] },
  { match: /box\s*jump|jump\s*squat|broad\s*jump|bound/i, primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings'] },
];

/** Body-map part ids (both sides) for each region. */
const REGION_PARTS: Record<MuscleRegion, string[]> = {
  quads: ['quads_left', 'quads_right'],
  hamstrings: ['hamstrings_left', 'hamstrings_right'],
  glutes: ['glutes_left', 'glutes_right'],
  calves: ['calves_left', 'calves_right'],
  hips: ['hips_left', 'hips_right'],
  core: ['abs_left', 'abs_right'],
  obliques: ['obliques_left', 'obliques_right'],
  lower_back: ['lower_back_left', 'lower_back_right'],
  chest: ['chest_left', 'chest_right'],
  shoulders: ['shoulder_left', 'shoulder_right'],
  rear_delts: ['rear_delt_left', 'rear_delt_right'],
  traps: ['traps_left', 'traps_right'],
  lats: ['lats_left', 'lats_right'],
  biceps: ['biceps_left', 'biceps_right'],
  triceps: ['triceps_left', 'triceps_right'],
  forearms: ['forearm_left', 'forearm_right'],
};

const BACK_REGIONS = new Set<MuscleRegion>(['hamstrings', 'glutes', 'calves', 'lower_back', 'rear_delts', 'traps', 'lats', 'triceps']);

export function musclesForExercise(name?: string | null): ExerciseMuscles | null {
  if (!name) return null;
  const rule = RULES.find((r) => r.match.test(name));
  return rule ? { primary: rule.primary, secondary: rule.secondary } : null;
}

/** Map of body-map part id -> 'primary' | 'secondary'. */
export function highlightPartsFor(muscles: ExerciseMuscles): Record<string, 'primary' | 'secondary'> {
  const out: Record<string, 'primary' | 'secondary'> = {};
  for (const r of muscles.secondary) for (const p of REGION_PARTS[r]) out[p] = 'secondary';
  for (const r of muscles.primary) for (const p of REGION_PARTS[r]) out[p] = 'primary';
  return out;
}

/** Which side of the body shows most of the primary muscles. */
export function bestViewFor(muscles: ExerciseMuscles): 'front' | 'back' {
  const back = muscles.primary.filter((r) => BACK_REGIONS.has(r)).length;
  return back > muscles.primary.length / 2 ? 'back' : 'front';
}
