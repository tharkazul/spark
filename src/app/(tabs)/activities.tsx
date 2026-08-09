import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../components/ui/Card';
import { Ionicons } from '@expo/vector-icons';

import { useActivities } from '../../context/ActivityStore';
import { useLanguage } from '../../context/LanguageContext';

export default function ActivitiesScreen() {
  const { activities, loading, refreshActivities } = useActivities();
  const { t } = useLanguage();

  const formattedActivities = activities.map((act) => ({
    id: String(act.id),
    title: act.name,
    type: act.sport_type,
    distance: `${act.distance_km} km`,
    duration: `${act.moving_time_min} mins`,
    date: act.start_date,
  }));

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      <View className="px-4 my-6">
        <Text className="text-theme-text text-3xl font-bold">{t('activities.title')}</Text>
        <Text className="text-theme-muted text-sm mt-1">{t('activities.subtitle')}</Text>
      </View>


      <FlatList
        data={formattedActivities}
        keyExtractor={item => item.id}
        refreshing={loading}
        onRefresh={refreshActivities}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <Card className="mb-4">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-full bg-theme-accent/20 items-center justify-center mr-3">
                <Ionicons 
                  name={item.type === 'Run' ? 'walk' : 'bicycle'} 
                  size={20} 
                  color="#FF5A1F" 
                />
              </View>
              <View>
                <Text className="text-theme-text font-bold text-lg">{item.title}</Text>
                <Text className="text-theme-muted text-xs">{item.date}</Text>
              </View>
            </View>
            
            <View className="flex-row justify-between bg-theme-bg p-3 rounded-xl">
              <View>
                <Text className="text-theme-muted text-xs font-bold uppercase mb-1">Distance</Text>
                <Text className="text-theme-text font-bold">{item.distance}</Text>
              </View>
              <View>
                <Text className="text-theme-muted text-xs font-bold uppercase mb-1">Time</Text>
                <Text className="text-theme-text font-bold">{item.duration}</Text>
              </View>
              <View>
                <Text className="text-theme-muted text-xs font-bold uppercase mb-1">Pace</Text>
                <Text className="text-theme-text font-bold">{item.type === 'Run' ? '5:07/km' : '20 km/h'}</Text>
              </View>
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
