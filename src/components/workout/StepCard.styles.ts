import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  // Shadow lives here. No overflow. Solid background is mandatory:
  // iOS derives the shadow from the layer's alpha channel, so a
  // transparent background produces no shadow.
  shadowHost: {
    marginVertical: 6,
    borderRadius: 16,
  },
  // Clipping lives here.
  clip: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  handleColumn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(100, 116, 139, 0.1)',
  },
  content: {
    flex: 1,
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  dropLine: {
    flex: 1,
    marginVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FF5F3B',
    backgroundColor: 'rgba(255, 95, 59, 0.08)',
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
