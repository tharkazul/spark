import React from 'react';
import { ScrollView, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../context/LanguageContext';

interface QuickSuggestionsProps {
  onSelectSuggestion: (text: string) => void;
}

export const QuickSuggestions: React.FC<QuickSuggestionsProps> = ({ onSelectSuggestion }) => {
  const { t } = useLanguage();

  const DEFAULT_SUGGESTIONS = [
    { label: t('chat.suggested1'), prompt: t('chat.suggested1') },
    { label: t('chat.suggested2'), prompt: t('chat.suggested2') },
    { label: t('chat.suggested3'), prompt: t('chat.suggested3') },
  ];

  return (
    <View className="py-2 px-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      >
        <View className="flex-row items-center mr-1">
          <Ionicons name="bulb-outline" size={16} color="#FF5A1F" />
          <Text className="text-theme-accent text-xs font-bold ml-1 uppercase tracking-wider">{t('chat.suggestedQuestions')}</Text>
        </View>
        {DEFAULT_SUGGESTIONS.map((item, idx) => (
          <TouchableOpacity
            key={`sugg-${idx}`}
            onPress={() => onSelectSuggestion(item.prompt)}
            className="px-3.5 py-1.5 rounded-full bg-theme-card border border-theme-border flex-row items-center active:bg-theme-accent/20"
          >
            <Text className="text-theme-text text-xs font-medium">{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

