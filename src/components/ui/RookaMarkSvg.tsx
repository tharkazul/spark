import React from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * The rooka R mark, as vector.
 *
 * Traced from the flat artwork rather than hand-authored: the mark is entirely
 * straight-edged, so the pixel boundary was walked and collapsed back onto its
 * original edges with Douglas-Peucker. 36 points, 98.5% area agreement with the
 * source raster, and visibly crisper than it -- the raster had wobbly, soft
 * edges that the trace straightened out.
 *
 * The viewBox is tight to the ink (aspect 0.659, taller than wide) so callers
 * can size it without fighting dead space. `fill-rule="evenodd"` is what makes
 * the interior counter render as a hole.
 *
 * Legibility floor: clean at 32px, good at 24px, marginal at 20px, and it
 * closes up below that -- the counter and the needle tails simply run out of
 * pixels. That is a property of the drawing, not of this file; a simplified
 * cut would be needed to go smaller.
 */
export function RookaMarkSvg({
  size = 16,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
  // Keep the mark's aspect: height drives, width follows.
  const w = size * 0.6593;
  return (
    <Svg width={w} height={size} viewBox="0 0 65.93 100" fill="none">
      <Path fillRule="evenodd" clipRule="evenodd" fill={color} d="M12.65 38.11 L41.31 25.04 L51.08 21.15 L48.5 39.06 L39.84 49.55 L59.48 64.46 L11.02 93.54 L10.6 93.65 L10.81 93.07 L21.94 79.0 L24.83 77.06 L42.94 65.72 L43.04 65.35 L42.2 64.62 L32.97 58.11 L0.31 100.0 L3.52 87.35 L25.41 52.91 L33.96 38.69 L12.65 38.16 Z M0.26 30.5 L65.93 0.0 L60.52 41.78 L48.56 48.82 L48.45 48.5 L53.96 41.21 L56.64 20.79 L57.69 12.97 L57.59 11.18 L7.09 34.7 L7.09 51.55 L17.32 47.03 L21.05 45.83 L0.31 66.19 L0.0 65.83 L0.26 30.55 Z" />
    </Svg>
  );
}
