import React, { useState, useMemo } from 'react';
import { View, TextInput, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/context/LanguageContext';
import { COMMON_GARMIN_EXERCISES } from '../../domain/garminExercises';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  textColor: string;
  editable?: boolean;
}

export function ExerciseAutocompleteInput({ value, onChangeText, textColor, editable = true }: Props) {
  const { t } = useLanguage();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    if (!editable || !focused || !value || value.length < 3) return [];
    const lower = value.toLowerCase();
    
    // Exact matches or partial matches
    const matches = COMMON_GARMIN_EXERCISES.filter(ex => ex.exercise_name.toLowerCase().includes(lower));
    
    // Sort so items starting with the query are first
    matches.sort((a, b) => {
      const aStarts = a.exercise_name.toLowerCase().startsWith(lower);
      const bStarts = b.exercise_name.toLowerCase().startsWith(lower);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });
    
    return matches.slice(0, 5); // Return top 5 suggestions
  }, [value, focused, editable]);

  return (
    <View className="w-full z-50">
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay blur to allow tap on suggestion
          setTimeout(() => setFocused(false), 200);
        }}
        placeholder={t('stepCard.exercisePlaceholder')}
        placeholderTextColor={theme.textSecondary}
        style={{ color: textColor }}
        className="w-full h-9 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-white/10 rounded-xl px-3 text-xs font-bold"
      />
      
      {suggestions.length > 0 && (
        <View className="mt-1 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {suggestions.map((item, index) => (
            <TouchableOpacity
              key={item.exercise_key}
              onPress={() => {
                onChangeText(item.exercise_name);
                setFocused(false);
              }}
              className={`px-3 py-2 ${index < suggestions.length - 1 ? 'border-b border-slate-100 dark:border-slate-700/50' : ''}`}
            >
              <Text className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {item.exercise_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
