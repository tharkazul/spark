import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLanguage, Language } from '../context/LanguageContext';

interface LanguageSelectorProps {
  compact?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ compact = false }) => {
  const { language, setLanguage } = useLanguage();

  const options: { id: Language; label: string; flag: string }[] = [
    { id: 'en', label: 'English', flag: '🇬🇧' },
    { id: 'nl', label: 'Nederlands', flag: '🇳🇱' },
    { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { id: 'es', label: 'Español', flag: '🇪🇸' },
    { id: 'fr', label: 'Français', flag: '🇫🇷' },
  ];

  if (compact) {
    return (
      <View className="flex-row items-center bg-gray-100 dark:bg-zinc-800/80 p-1 rounded-full flex-wrap">
        {options.map((opt) => {
          const active = language === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setLanguage(opt.id)}
              className={`px-2 py-0.5 rounded-full flex-row items-center space-x-1 ${
                active ? 'bg-orange-500 shadow-sm' : 'bg-transparent'
              }`}
            >
              <Text className="text-[10px]">{opt.flag}</Text>
              <Text
                className={`text-[10px] font-bold ${
                  active ? 'text-white' : 'text-gray-600 dark:text-zinc-400'
                }`}
              >
                {opt.id.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-2 w-full">
      {options.map((opt) => {
        const active = language === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => setLanguage(opt.id)}
            className={`py-2.5 px-3 rounded-xl flex-row items-center space-x-2 ${
              active
                ? 'bg-theme-accent shadow-sm'
                : 'bg-theme-bg/60 dark:bg-theme-bg/40 border border-theme-border/40'
            }`}
          >
            <Text className="text-sm">{opt.flag}</Text>
            <Text
              className={`text-xs font-bold ${
                active ? 'text-white' : 'text-theme-text font-medium'
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
