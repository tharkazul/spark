import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '../ui/Chip';
import { ProposedWorkoutItem } from '../../types/chat';

interface ProposalCardProps {
  plan: ProposedWorkoutItem[];
  status?: 'pending' | 'accepted' | 'rejected';
  onAccept: () => void;
  onReject: () => void;
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  plan,
  status = 'pending',
  onAccept,
  onReject,
}) => {
  const { t } = useLanguage();
    const theme = useTheme();
  if (!plan || plan.length === 0) return null;

  const isAccepted = status === 'accepted';
  const isRejected = status === 'rejected';

  return (
    <View className="mt-3 p-4 rounded-tile bg-theme-card border border-theme-accent/40 shadow-sm">
      <View className="flex-row items-center mb-3">
        <View className="w-8 h-8 rounded-full bg-theme-accent/20 items-center justify-center mr-2">
          <Ionicons name="calendar-outline" size={18} color={theme.tint} />
        </View>
        <View className="flex-1">
          <Text className="text-theme-text font-bold text-sm font-rajdhani">{t('chatCards.proposalTitle')}</Text>
          <Text className="text-theme-muted text-xs">{plan.length === 1 ? t('chatCards.oneChange') : t('chatCards.nChanges', { count: plan.length })}</Text>
        </View>
      </View>

      <View className="gap-2 mb-3">
        {plan.map((item, idx) => (
          <View key={`prop-item-${idx}`} className="p-2.5 rounded-lg bg-theme-bg/60 flex-row items-center justify-between">
            <View className="flex-1 mr-2">
              <Text className="text-theme-accent font-bold text-xs">{item.date} • {t(`sports.${String(item.sport || '').toLowerCase()}`, item.sport).toUpperCase()}</Text>
              <Text className="text-theme-text text-xs font-medium" numberOfLines={1}>{item.description}</Text>
            </View>
            {item.target_rooka ? (
              <Chip
                variant="points"
                size="sm"
                label={Math.round(item.target_rooka)}
              />
            ) : null}
          </View>
        ))}
      </View>

      {isAccepted ? (
        <View className="flex-row items-center justify-center p-2 rounded-lg bg-semantic-success/20">
          <Ionicons name="checkmark-circle" size={18} color="#10B981" />
          <Text className="text-semantic-success font-bold text-xs ml-2">{t('chatCards.proposalAccepted')}</Text>
        </View>
      ) : isRejected ? (
        <View className="flex-row items-center justify-center p-2 rounded-lg bg-semantic-error/20">
          <Ionicons name="close-circle" size={18} color="#EF4444" />
          <Text className="text-semantic-error font-bold text-xs ml-2">{t('chatCards.proposalRejected')}</Text>
        </View>
      ) : (
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={onReject}
            className="flex-1 py-2.5 rounded-lg bg-theme-bg items-center justify-center"
          >
            <Text className="text-theme-muted font-bold text-xs">{t('chatCards.reject')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onAccept}
            className="flex-1 py-2.5 rounded-lg bg-theme-accent items-center justify-center flex-row gap-1"
          >
            <Ionicons name="checkmark" size={16} color="white" />
            <Text className="text-white font-bold text-xs">{t('chatCards.acceptPlan')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};
