import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLanguage, Language } from '../context/LanguageContext';
import { useColorScheme } from 'nativewind';

interface LanguageSelectorProps {
  compact?: boolean;
}

const OPTIONS: { id: Language; label: string; flag: string }[] = [
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { id: 'es', label: 'Español', flag: '🇪🇸' },
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
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
              <Text style={styles.compactFlag}>{opt.flag}</Text>
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
                  ? '#FF5F3B'
                  : isDark
                  ? 'rgba(30, 41, 59, 0.7)'
                  : '#F1F5F9',
                borderColor: active
                  ? '#FF5F3B'
                  : isDark
                  ? 'rgba(51, 65, 85, 0.6)'
                  : 'rgba(226, 232, 240, 0.8)',
              },
            ]}
          >
            <Text style={styles.optionFlag}>{opt.flag}</Text>
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
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 9999,
    flexWrap: 'wrap',
    gap: 4,
  },
  compactButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeButton: {
    backgroundColor: '#FF5F3B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  compactFlag: {
    fontSize: 10,
  },
  compactText: {
    fontSize: 10,
    fontWeight: '700',
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
    gap: 8,
    borderWidth: 1,
  },
  optionFlag: {
    fontSize: 14,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
});
