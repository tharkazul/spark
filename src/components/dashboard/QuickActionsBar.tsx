import React from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuickActionsBarProps {
  onLogActivity: () => void;
  onLifeHappens: () => void;
  onLogWeight: () => void;
  onNiggleCheck: () => void;
}

export const QuickActionsBar: React.FC<QuickActionsBarProps> = ({
  onLogActivity,
  onLifeHappens,
  onLogWeight,
  onNiggleCheck,
}) => {
    const theme = useTheme();
  return (
    <View className="mb-4">
      <Text className="text-xs font-bold text-theme-muted mb-2 px-1">
        Quick Actions
      </Text>
      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={onLogActivity}
          className="flex-1 bg-theme-card rounded-xl p-2.5 items-center justify-center shadow-sm active:bg-theme-accent/10"
        >
          <Ionicons name="add-circle-outline" size={18} color={theme.tint} />
          <Text className="text-xs font-bold text-theme-text mt-1 text-center" numberOfLines={1}>
            + Activity
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onLifeHappens}
          className="flex-1 bg-theme-card rounded-xl p-2.5 items-center justify-center shadow-sm active:bg-theme-accent/10"
        >
          <Ionicons name="umbrella-outline" size={18} color="#a855f7" />
          <Text className="text-xs font-bold text-theme-text mt-1 text-center" numberOfLines={1}>
            Life Happens
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onLogWeight}
          className="flex-1 bg-theme-card rounded-xl p-2.5 items-center justify-center shadow-sm active:bg-theme-accent/10"
        >
          <Ionicons name="fitness-outline" size={18} color="#10b981" />
          <Text className="text-xs font-bold text-theme-text mt-1 text-center" numberOfLines={1}>
            Weight
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onNiggleCheck}
          className="flex-1 bg-theme-card rounded-xl p-2.5 items-center justify-center shadow-sm active:bg-theme-accent/10"
        >
          <Ionicons name="medkit-outline" size={18} color="#ef4444" />
          <Text className="text-xs font-bold text-theme-text mt-1 text-center" numberOfLines={1}>
            Niggle
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
