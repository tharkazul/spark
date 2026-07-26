import React from 'react';
import { ScrollView, View, Text, Switch, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

export default function ProfileScreen() {
  const { colorScheme, toggleColorScheme } = useColorScheme();

  const renderSettingRow = (icon: keyof typeof Ionicons.glyphMap, title: string, value?: React.ReactNode) => (
    <View className="flex-row items-center py-4 border-b border-theme-border">
      <Ionicons name={icon} size={22} color="#8E8E93" className="mr-4" />
      <Text className="text-theme-text text-base flex-1 ml-3">{title}</Text>
      {value}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
        
        <View className="items-center my-8">
          <View className="w-24 h-24 rounded-full bg-theme-card border-2 border-theme-accent items-center justify-center mb-4">
             <Ionicons name="person" size={40} color="#8E8E93" />
          </View>
          <Text className="text-theme-text text-2xl font-bold">Rutger</Text>
          <Text className="text-theme-accent mt-1">Pro Member</Text>
        </View>

        <Text className="text-theme-muted font-bold text-xs uppercase tracking-wider mb-2 ml-1">Settings</Text>
        <Card className="p-2 mb-6">
          {renderSettingRow('moon', 'Dark Mode', 
            <Switch 
              value={colorScheme === 'dark'} 
              onValueChange={toggleColorScheme}
              trackColor={{ false: '#DDE3E9', true: '#208AEF' }}
            />
          )}
          {renderSettingRow('notifications', 'Push Notifications', 
            <Switch value={true} trackColor={{ false: '#DDE3E9', true: '#208AEF' }} />
          )}
        </Card>

        <Text className="text-theme-muted font-bold text-xs uppercase tracking-wider mb-2 ml-1">Connections</Text>
        <Card className="p-2 mb-6">
          {renderSettingRow('fitness', 'Strava', <Text className="text-theme-accent font-bold">Connected</Text>)}
          {renderSettingRow('watch', 'Garmin', <Text className="text-theme-muted font-bold">Connect</Text>)}
        </Card>

        <TouchableOpacity className="mt-4 items-center">
          <Text className="text-red-500 font-bold text-base">Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
