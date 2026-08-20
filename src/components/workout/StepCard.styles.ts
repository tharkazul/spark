import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  // Shadow lives here. No overflow. Solid background is mandatory:
  // iOS derives the shadow from the layer's alpha channel, so a
  // transparent background produces no shadow.
  shadowHost: {
    marginVertical: 6,
    borderRadius: 16,
  },

});

export const CARD_COLORS = {
  warmup: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)' },
  interval: { bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.3)' },
  recovery: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)' },
  cooldown: { bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)' },
  repeat: { bg: '#F8FAFC', border: '#E2E8F0' },
  default: { bg: '#F8FAFC', border: '#E2E8F0' },
} as const;
