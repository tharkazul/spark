import React, { useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { ScrollView, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '../../context/LanguageContext';

interface QuickSuggestionsProps {
  onSelectSuggestion: (text: string) => void;
}

export const QuickSuggestions: React.FC<QuickSuggestionsProps> = ({ onSelectSuggestion }) => {
  const theme = useTheme();
  const { t } = useLanguage();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const DEFAULT_SUGGESTIONS = [
    { label: t('chat.suggested1'), prompt: t('chat.suggested1') },
    { label: t('chat.suggested2'), prompt: t('chat.suggested2') },
    { label: t('chat.suggested3'), prompt: t('chat.suggested3') },
  ];

  const handleSelect = (prompt: string, idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIdx(idx);
    setTimeout(() => {
      onSelectSuggestion(prompt);
    }, 140);
  };

  return (
    <View className="py-2 px-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      >
        <View className="flex-row items-center mr-1">
          <Ionicons name="bulb-outline" size={16} color={theme.tint} />
          <Text className="text-theme-accent text-xs font-bold ml-1">{t('chat.suggestedQuestions')}</Text>
        </View>
        {DEFAULT_SUGGESTIONS.map((item, idx) => {
          const isSelected = selectedIdx === idx;
          return (
            <TouchableOpacity
              key={`sugg-${idx}`}
              onPress={() => handleSelect(item.prompt, idx)}
              activeOpacity={0.8}
              className={`px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5 transition-all ${
                isSelected
                  ? 'bg-semantic-success/20 border border-semantic-success/40'
                  : 'bg-theme-card border border-theme-border/60 active:bg-theme-accent/20'
              }`}
            >
              {isSelected ? (
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              ) : null}
              <Text
                className={`text-xs font-medium ${
                  isSelected ? 'text-semantic-success font-bold' : 'text-theme-text'
                }`}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

