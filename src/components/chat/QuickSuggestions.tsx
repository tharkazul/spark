import React from 'react';
import { ScrollView, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuickSuggestionsProps {
  onSelectSuggestion: (text: string) => void;
}

const DEFAULT_SUGGESTIONS = [
  { label: "Adjust tomorrow's run", prompt: "Can we adjust tomorrow's run to be a bit lighter?" },
  { label: "Log Niggle", prompt: "I want to log a niggle in my right calf." },
  { label: "Plan next week", prompt: "Can you help plan my workouts for next week?" },
  { label: "Check readiness", prompt: "How is my recovery and readiness looking today?" },
  { label: "Strength session", prompt: "Suggest a 30-min core & stability strength session." },
];

export const QuickSuggestions: React.FC<QuickSuggestionsProps> = ({ onSelectSuggestion }) => {
  return (
    <View className="py-2 px-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      >
        <View className="flex-row items-center mr-1">
          <Ionicons name="bulb-outline" size={16} color="#00E5FF" />
          <Text className="text-theme-accent text-xs font-bold ml-1 uppercase tracking-wider">SUGGESTIONS:</Text>
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
