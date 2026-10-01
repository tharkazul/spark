import React from 'react';
import { ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Chip } from '../ui/Chip';
import { useLanguage } from '../../context/LanguageContext';

interface QuickSuggestionsProps {
  suggestions?: string[];
  onSelectSuggestion: (text: string) => void;
}

export const QuickSuggestions: React.FC<QuickSuggestionsProps> = ({
  suggestions,
  onSelectSuggestion,
}) => {
  const { t } = useLanguage();
  const localFallbacks = [
    t('coach.adaptToday', 'Adapt today'),
    t('coach.imTired', "I'm tired"),
    t('coach.moveToTomorrow', 'Move to tomorrow'),
    t('coach.whatShouldIEat', 'What should I eat?'),
  ];
  const list = suggestions && suggestions.length > 0 ? suggestions : localFallbacks;

  const handleSelect = (text: string) => {
    Haptics.selectionAsync();
    onSelectSuggestion(text);
  };

  return (
    <View className="h-9 my-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center' }}
      >
        {list.map((item, idx) => (
          <Chip
            key={`quick-sugg-${idx}`}
            variant="neutral"
            size="md"
            label={item}
            onPress={() => handleSelect(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
};
