/**
 * Coach display names.
 *
 * The three standard personas have fixed human names; a custom coach (Rooka+) uses the name the
 * athlete gave it. "Rooka" is the brand/points name, so it is never used as a coach name.
 * Mirrors getCoachDisplayName() in src/utils/avatarUtils.ts.
 */
function resolveCoachName(user) {
  const tone = String((user && user.coach_tone) || '').toLowerCase();
  const isCustom = tone.includes('custom') || tone.includes('configure own coach');
  if (isCustom) {
    const name = String((user && user.coach_name) || '').trim();
    return name && name.toLowerCase() !== 'rooka' ? name : 'Coach';
  }
  if (tone.includes('cheerleader')) return 'Elyanna';
  if (tone.includes('strict')) return 'Leon';
  return 'Benjamin';
}

/**
 * Added to every coach prompt: athletes see plain words, never training-science abbreviations.
 */
const PLAIN_LANGUAGE_RULE =
  'When writing to the athlete, never use the abbreviations CTL, ATL, TSB, PMC or HRV. ' +
  'Say "fitness" (instead of CTL), "fatigue" (instead of ATL), "form" (instead of TSB) and "heart rate variability" (instead of HRV).';

module.exports = { resolveCoachName, PLAIN_LANGUAGE_RULE };
