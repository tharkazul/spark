import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';

export type ProfileSubTab = 'profile' | 'goals' | 'connections' | 'account';

interface ProfileSubNavProps {
  activeTab: ProfileSubTab;
  onTabChange: (tab: ProfileSubTab) => void;
  labels: Record<ProfileSubTab, string>;
}

export const ProfileSubNav: React.FC<ProfileSubNavProps> = ({
  activeTab,
  onTabChange,
  labels,
}) => {
  const tabs: ProfileSubTab[] = ['profile', 'goals', 'connections', 'account'];

  const handlePress = (tab: ProfileSubTab) => {
    Haptics.selectionAsync();
    onTabChange(tab);
  };

  return (
    <View className="border-b border-theme-border bg-theme-bg pb-2 mb-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-row"
        contentContainerStyle={{ paddingHorizontal: 4 }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => handlePress(tab)}
              activeOpacity={0.7}
              className={`px-4 py-2.5 mr-2 rounded-xl border ${
                isActive
                  ? 'bg-theme-accent border-theme-accent'
                  : 'bg-theme-card border-theme-border'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  isActive ? 'text-white' : 'text-theme-muted'
                }`}
              >
                {labels[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};
