import React from 'react';
import { ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Chip } from '../ui/Chip';

interface QuickSuggestionsProps {
  suggestions?: string[];
  onSelectSuggestion: (text: string) => void;
}

const LOCAL_FALLBACKS = [
  'Adapt today',
  "I'm tired",
  'Move to tomorrow',
  'What should I eat?',
];

export const QuickSuggestions: React.FC<QuickSuggestionsProps> = ({
  suggestions,
  onSelectSuggestion,
}) => {
  const list = suggestions && suggestions.length > 0 ? suggestions : LOCAL_FALLBACKS;

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
