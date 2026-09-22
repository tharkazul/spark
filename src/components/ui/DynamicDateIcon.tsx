import React from 'react';
import { View, Text, Platform } from 'react-native';

interface DynamicDateIconProps {
  color: string;
  size?: number;
}

export function DynamicDateIcon({ color, size = 22 }: DynamicDateIconProps) {
  const todayNum = new Date().getDate();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        borderWidth: 1.8,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Top Header Bar Line */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4.5,
          backgroundColor: color,
        }}
      />
      {/* Dynamic Date Number */}
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: '900',
          color: color,
          textAlign: 'center',
          marginTop: 3,
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          includeFontPadding: false,
        }}
      >
        {todayNum}
      </Text>
    </View>
  );
}
