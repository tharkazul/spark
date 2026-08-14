export function getCoachAvatarSource(coachTone?: string, mood?: string) {
  const tone = coachTone || '';
  const suffix = mood && ['hype', 'disappointed'].includes(mood.toLowerCase()) ? mood.toLowerCase() : 'default';
  
  if (tone.includes('Cheerleader') || tone.includes('cheerleader')) {
    if (suffix === 'hype') return require('../../assets/avatars/cheer-hype.png');
    if (suffix === 'disappointed') return require('../../assets/avatars/cheer-disappointed.png');
    return require('../../assets/avatars/cheer-default.png');
  }
  
  if (tone.includes('Strict') || tone.includes('strict')) {
    if (suffix === 'hype') return require('../../assets/avatars/strict-hype.png');
    if (suffix === 'disappointed') return require('../../assets/avatars/strict-disappointed.png');
    return require('../../assets/avatars/strict-default.png');
  }

  // Default / Empathetic
  if (suffix === 'hype') return require('../../assets/avatars/empathetic-hype.png');
  if (suffix === 'disappointed') return require('../../assets/avatars/empathetic-disappointed.png');
  return require('../../assets/avatars/empathetic-default.png');
}
