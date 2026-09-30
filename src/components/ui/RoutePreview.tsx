import React, { useMemo } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/hooks/use-theme';
import { decodePolyline, Coordinate } from '../../utils/polyline';

export interface RoutePreviewProps {
  polyline?: string | null;
  coordinates?: Coordinate[];
  height?: number;
  strokeWidth?: number;
  strokeColor?: string;
  className?: string;
}

export const RoutePreview: React.FC<RoutePreviewProps> = ({
  polyline,
  coordinates: rawCoords,
  height = 120,
  strokeWidth = 3,
  strokeColor,
  className = '',
}) => {
  const theme = useTheme();
  const [containerWidth, setContainerWidth] = React.useState<number>(0);

  const coords = useMemo(() => {
    if (rawCoords && rawCoords.length > 1) return rawCoords;
    if (polyline) return decodePolyline(polyline);
    return [];
  }, [rawCoords, polyline]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - containerWidth) > 1) {
      setContainerWidth(w);
    }
  };

  const pathData = useMemo(() => {
    if (!coords || coords.length < 2 || containerWidth <= 0) return null;

    // Subsample to max 100 points for silky smooth rendering
    const maxPoints = 100;
    const step = Math.max(1, Math.floor(coords.length / maxPoints));
    const sampled: Coordinate[] = [];
    for (let i = 0; i < coords.length; i += step) {
      sampled.push(coords[i]);
    }
    if (sampled[sampled.length - 1] !== coords[coords.length - 1]) {
      sampled.push(coords[coords.length - 1]);
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const pt of sampled) {
      if (pt.latitude < minLat) minLat = pt.latitude;
      if (pt.latitude > maxLat) maxLat = pt.latitude;
      if (pt.longitude < minLng) minLng = pt.longitude;
      if (pt.longitude > maxLng) maxLng = pt.longitude;
    }

    const latDelta = maxLat - minLat;
    const lngDelta = maxLng - minLng;
    if (latDelta === 0 && lngDelta === 0) return null;

    const pad = 16;
    const availW = Math.max(10, containerWidth - pad * 2);
    const availH = Math.max(10, height - pad * 2);

    // Mercator approximation for aspect ratio: cos(lat)
    const midLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const cosLat = Math.cos(midLatRad) || 1;
    const geoW = lngDelta * cosLat;
    const geoH = latDelta;

    const scale = Math.min(availW / (geoW || 0.0001), availH / (geoH || 0.0001));
    const routeW = geoW * scale;
    const routeH = geoH * scale;

    const offsetX = pad + (availW - routeW) / 2;
    const offsetY = pad + (availH - routeH) / 2;

    let d = '';
    for (let i = 0; i < sampled.length; i++) {
      const pt = sampled[i];
      const x = offsetX + (pt.longitude - minLng) * cosLat * scale;
      // Latitude increases upward, but SVG y increases downward:
      const y = offsetY + (maxLat - pt.latitude) * scale;

      const xStr = x.toFixed(1);
      const yStr = y.toFixed(1);

      if (i === 0) {
        d += `M ${xStr} ${yStr}`;
      } else {
        d += ` L ${xStr} ${yStr}`;
      }
    }

    return d;
  }, [coords, containerWidth, height]);

  if (!coords || coords.length < 2) return null;

  const color = strokeColor || theme.tint;

  return (
    <View
      onLayout={onLayout}
      style={{ height }}
      className={`w-full overflow-hidden items-center justify-center ${className}`}
    >
      {pathData && containerWidth > 0 ? (
        <Svg width={containerWidth} height={height}>
          <Path
            d={pathData}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      ) : null}
    </View>
  );
};
