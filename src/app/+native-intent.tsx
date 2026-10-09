/**
 * Custom intent middleware for Expo Router.
 * Sanitizes incoming deep link paths, handles legacy or triple-slash schemes (e.g. rooka:///),
 * and routes them to appropriate screens.
 */
export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (!path || path === '/' || path === '///' || path === '//') {
    return '/(tabs)/coach';
  }

  // If path begins with multiple slashes (e.g. "///profile"), sanitize to "/profile"
  if (path.startsWith('//')) {
    const cleaned = path.replace(/^\/+/, '/');
    return cleaned === '/' ? '/(tabs)/coach' : cleaned;
  }

  return path;
}
