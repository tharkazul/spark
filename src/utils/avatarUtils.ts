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

/**
 * Display name of the athlete's coach. The three standard personas have fixed human names
 * (Benjamin, Leon, Elyanna); a custom coach (Rooka+) uses the name the athlete gave it.
 * Mirrors resolveCoachName() in server/services/coachPersona.js.
 */
export function getCoachDisplayName(user?: Pick<UserProfile, 'coach_tone' | 'coach_name'> | null): string {
  const tone = (user?.coach_tone || '').toLowerCase();
  const isCustom = tone.includes('custom') || tone.includes('configure own coach');
  if (isCustom) {
    const name = (user?.coach_name || '').trim();
    return name && name.toLowerCase() !== 'rooka' ? name : 'Coach';
  }
  if (tone.includes('cheerleader')) return 'Elyanna';
  if (tone.includes('strict')) return 'Leon';
  return 'Benjamin';
}

/**
 * Resolves a profile picture path (relative like /uploads/profiles/... or full URL)
 * into an absolute URL that React Native Image can load.
 */
export function getFullProfilePhotoUrl(path?: string | null): string | null {
  if (!path || typeof path !== 'string' || !path.trim()) return null;
  const trimmed = path.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('file://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  return `${API_BASE_URL}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

/**
 * Resolves a chat image path (data:, file://, relative /api/images/chat/...) into an
 * absolute URL that React Native Image can load, appending authentication token if required.
 */
export function resolveChatImageUrl(path?: string | null, token?: string | null): string {
  if (!path || typeof path !== 'string' || !path.trim()) return '';
  const trimmed = path.trim();
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://')
  ) {
    return trimmed;
  }
  let fullUrl = trimmed;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    fullUrl = `${API_BASE_URL}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
  }
  if (token && fullUrl.includes('/api/images/chat/') && !fullUrl.includes('token=')) {
    const sep = fullUrl.includes('?') ? '&' : '?';
    fullUrl = `${fullUrl}${sep}token=${encodeURIComponent(token)}`;
  }
  return fullUrl;
}

export interface AvatarTint {
  bg: string;
  text: string;
  hex: string;
}

export const BRAND_AVATAR_TINTS: AvatarTint[] = [
  { bg: 'bg-sky-500', text: 'text-white', hex: '#0EA5E9' },
  { bg: 'bg-emerald-500', text: 'text-white', hex: '#10B981' },
  { bg: 'bg-amber-500', text: 'text-white', hex: '#F59E0B' },
  { bg: 'bg-violet-500', text: 'text-white', hex: '#8B5CF6' },
  { bg: 'bg-rose-500', text: 'text-white', hex: '#F43F5E' },
  { bg: 'bg-indigo-500', text: 'text-white', hex: '#6366F1' },
];

export function getUserAvatarTint(userId?: string | number | null): AvatarTint {
  if (!userId) return BRAND_AVATAR_TINTS[0];
  const str = String(userId);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % BRAND_AVATAR_TINTS.length;
  return BRAND_AVATAR_TINTS[index];
}

