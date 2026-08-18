import { API_BASE_URL } from '../constants/api';
import { UserProfile } from '../types/user';

export function getCoachAvatarSource(
  coachTone?: string,
  mood?: string,
  user?: UserProfile | null
) {
  const tone = coachTone || user?.coach_tone || '';
  const suffix = mood && ['hype', 'disappointed'].includes(mood.toLowerCase()) ? mood.toLowerCase() : 'default';

  // If user is in custom coach persona mode, check for custom uploaded avatars
  const isCustom = tone.toLowerCase().includes('custom') || tone.toLowerCase().includes('configure own coach');

  if (isCustom && user) {
    let customPath = user.coach_avatar_neutral;
    if (suffix === 'hype') customPath = user.coach_avatar_hype || user.coach_avatar_neutral;
    if (suffix === 'disappointed') customPath = user.coach_avatar_disappointed || user.coach_avatar_neutral;

    if (customPath) {
      const fullUrl = customPath.startsWith('http')
        ? customPath
        : `${API_BASE_URL}${customPath.startsWith('/') ? customPath : `/${customPath}`}`;
      return { uri: fullUrl };
    }
  }

  // 1. Cheerleader tone
  if (tone.toLowerCase().includes('cheerleader')) {
    if (suffix === 'hype') return require('../../assets/avatars/cheer-hype.png');
    if (suffix === 'disappointed') return require('../../assets/avatars/cheer-disappointed.png');
    return require('../../assets/avatars/cheer-default.png');
  }

  // 2. Strict Data Nerd tone
  if (tone.toLowerCase().includes('strict')) {
    if (suffix === 'hype') return require('../../assets/avatars/strict-hype.png');
    if (suffix === 'disappointed') return require('../../assets/avatars/strict-disappointed.png');
    return require('../../assets/avatars/strict-default.png');
  }

  // 3. Default / Empathetic tone
  if (suffix === 'hype') return require('../../assets/avatars/empathetic-hype.png');
  if (suffix === 'disappointed') return require('../../assets/avatars/empathetic-disappointed.png');
  return require('../../assets/avatars/empathetic-default.png');
}

