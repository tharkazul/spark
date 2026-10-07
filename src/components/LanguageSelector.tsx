import { BrandColors } from '@/constants/theme';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLanguage, Language } from '../context/LanguageContext';
import { useColorScheme } from 'nativewind';

interface LanguageSelectorProps {
  compact?: boolean;
}

const OPTIONS: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'nl', label: 'Nederlands' },
  { id: 'de', label: 'Deutsch' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
];

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ compact = false }) => {
  const { language, setLanguage } = useLanguage();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (compact) {
    return (
      <View
        style={[
          styles.compactContainer,
          { backgroundColor: isDark ? 'rgba(39, 39, 42, 0.8)' : '#F3F4F6' },
        ]}
      >
        {OPTIONS.map((opt) => {
          const active = language === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => setLanguage(opt.id)}
              activeOpacity={0.7}
              style={[
                styles.compactButton,
                active && styles.activeButton,
              ]}
            >
              <Text
                style={[
                  styles.compactText,
                  { color: active ? '#FFFFFF' : isDark ? '#A1A1AA' : '#4B5563' },
                ]}
              >
                {opt.id.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.fullContainer}>
      {OPTIONS.map((opt) => {
        const active = language === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            onPress={() => setLanguage(opt.id)}
            activeOpacity={0.7}
            style={[
              styles.optionButton,
              {
                backgroundColor: active
                  ? BrandColors.primary
                  : isDark
                  ? 'rgba(30, 41, 59, 0.7)'
                  : '#F1F5F9',
                borderColor: active
                  ? BrandColors.primary
                  : isDark
                  ? 'rgba(51, 65, 85, 0.6)'
                  : 'rgba(226, 232, 240, 0.8)',
              },
            ]}
          >
            <Text
              style={[
                styles.optionLabel,
                { color: active ? '#FFFFFF' : isDark ? '#F8FAFC' : '#0F172A' },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  // Full-width segmented control: each option takes an equal share of the row,
  // so five languages always fit without overflowing the card.
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    padding: 3,
    borderRadius: 9999,
    gap: 2,
  },
  compactButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeButton: {
    backgroundColor: BrandColors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  compactText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  fullContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    // These used to size to their label, so five chips of five different word
    // lengths wrapped 2-then-3 with a ragged right edge. Basis + grow tiles
    // them three-up, then two-up, with each row flush to the container.
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 0,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
});
