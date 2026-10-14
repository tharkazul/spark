import React from 'react';
import { View } from 'react-native';
import { CoachPersonaSettings } from '../CoachPersonaSettings';
import { CoachMemoryCard } from './CoachMemoryCard';

export const CoachTab: React.FC = () => {
  return (
    <View className="gap-y-4 pb-8">
      {/* COACH PERSONA, VOICE TONE & ATHLETE BACKGROUND CONTEXT */}
      <CoachPersonaSettings />

      {/* WHAT THE COACH KNOWS: facts and baseline numbers, editable */}
      <CoachMemoryCard />
    </View>
  );
};

export default CoachTab;
