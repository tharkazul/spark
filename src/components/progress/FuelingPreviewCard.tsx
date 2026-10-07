import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { usePhysique } from '../../context/PhysiqueStore';
import { useLanguage } from '../../context/LanguageContext';

interface FuelingPreviewCardProps {
  onOpenNutrition?: () => void;
}

/** Daily fueling & nutrition targets (kcal + macros), shown on Progress → Body. */
export const FuelingPreviewCard: React.FC<FuelingPreviewCardProps> = ({ onOpenNutrition }) => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { nutrition } = usePhysique();

  return (
    <Card className="bg-theme-card p-4">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-x-2">
          <Ionicons name="nutrition-outline" size={16} color={theme.tint} />
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            {t('progress.fuelingNutrition', 'Fueling & Nutrition')}
          </Text>
        </View>
        {onOpenNutrition && (
          <Button
            variant="ghost"
            size="sm"
            label={t('progress.viewPlan', 'View Plan')}
            rightIcon={<Ionicons name="chevron-forward" size={14} color="#0EA5E9" />}
            onPress={onOpenNutrition}
          />
        )}
      </View>

      {nutrition ? (
        <View className="flex-row items-center justify-between bg-theme-inset rounded-inset p-3">
          <View className="items-center flex-1">
            <Text className="text-lg font-bold font-rajdhani text-theme-text">
              {nutrition.carbsTarget || nutrition.proteinTarget || nutrition.fatTarget
                ? Math.round((nutrition.carbsTarget || 0) * 4 + (nutrition.proteinTarget || 0) * 4 + (nutrition.fatTarget || 0) * 9)
                : '—'}
            </Text>
            <Text className="text-[10px] text-theme-muted uppercase font-bold">kcal</Text>
          </View>
          <View className="w-px h-6 bg-theme-border/60" />
          <View className="items-center flex-1">
            <Text className="text-lg font-bold font-rajdhani text-theme-text">
              {nutrition.carbsTarget ? Math.round(nutrition.carbsTarget) : (nutrition.carbs ? Math.round(nutrition.carbs) : '—')}g
            </Text>
            <Text className="text-[10px] text-theme-muted uppercase font-bold">{t('dashboard.carbs', 'Carbs')}</Text>
          </View>
          <View className="w-px h-6 bg-theme-border/60" />
          <View className="items-center flex-1">
            <Text className="text-lg font-bold font-rajdhani text-theme-text">
              {nutrition.proteinTarget ? Math.round(nutrition.proteinTarget) : (nutrition.protein ? Math.round(nutrition.protein) : '—')}g
            </Text>
            <Text className="text-[10px] text-theme-muted uppercase font-bold">{t('dashboard.protein', 'Protein')}</Text>
          </View>
          <View className="w-px h-6 bg-theme-border/60" />
          <View className="items-center flex-1">
            <Text className="text-lg font-bold font-rajdhani text-theme-text">
              {nutrition.fatTarget ? Math.round(nutrition.fatTarget) : (nutrition.fat ? Math.round(nutrition.fat) : '—')}g
            </Text>
            <Text className="text-[10px] text-theme-muted uppercase font-bold">{t('dashboard.fat', 'Fat')}</Text>
          </View>
        </View>
      ) : (
        <View className="bg-theme-inset rounded-inset p-3 items-center">
          <Text className="text-xs text-theme-muted">{t('progress.nutritionConfigureHint', 'Daily AI nutrition targets ready to configure.')}</Text>
        </View>
      )}
    </Card>
  );
};
