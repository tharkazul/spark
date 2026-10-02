import React from 'react';
import { View } from 'react-native';
import { CoachPersonaSettings } from '../CoachPersonaSettings';

export const CoachTab: React.FC = () => {
  return (
    <View className="gap-y-4 pb-8">
      {/* COACH PERSONA, VOICE TONE & ATHLETE BACKGROUND CONTEXT */}
      <CoachPersonaSettings />
    </View>
  );
};

export default CoachTab;
