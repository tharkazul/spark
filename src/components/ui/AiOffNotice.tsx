import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { confirmEnableAi } from '../../utils/aiConsent';

interface AiOffNoticeProps {
  /** Explains which feature is unavailable while AI processing is off. */
  message: string;
  className?: string;
}

/** Stands in for an AI feature while the athlete hasn't allowed AI processing. */
export const AiOffNotice: React.FC<AiOffNoticeProps> = ({ message, className = '' }) => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { setAiConsent } = useUser();

  return (
    <View className={`bg-theme-card rounded-[20px] px-4 py-3 border border-theme-border flex-row items-center gap-3 ${className}`}>
      <Ionicons name="sparkles-outline" size={18} color={theme.textSecondary} />
      <Text className="flex-1 text-xs text-theme-muted font-medium leading-4">{message}</Text>
      <TouchableOpacity
        onPress={() => confirmEnableAi(t, setAiConsent)}
        activeOpacity={0.8}
        className="bg-theme-accent-strong px-3.5 py-2 rounded-full"
      >
        <Text className="text-xs font-extrabold text-white">{t('aiConsent.turnOn')}</Text>
      </TouchableOpacity>
    </View>
  );
};
