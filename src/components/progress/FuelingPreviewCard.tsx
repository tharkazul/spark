import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import { Card } from '../ui/Card';
import { usePhysique } from '../../context/PhysiqueStore';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { AiOffNotice } from '../ui/AiOffNotice';

interface FuelingPreviewCardProps {
  onOpenNutrition?: () => void;
}

/** Daily fueling & nutrition targets + logged progress, shown on Progress → Body. */
export const FuelingPreviewCard: React.FC<FuelingPreviewCardProps> = ({ onOpenNutrition }) => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { nutrition } = usePhysique();
  const { user } = useUser();

  // Targets are set by the AI coach; without consent there are none to show.
  if (user?.aiConsent !== true) {
    return (
      <Card className="bg-theme-card p-4">
        <View className="flex-row items-center gap-x-2 mb-3">
          <Ionicons name="nutrition-outline" size={16} color={theme.tint} />
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            {t('progress.fuelingNutrition', 'Fueling & Nutrition')}
          </Text>
        </View>
        <AiOffNotice message={t('aiConsent.offNutrition')} className="bg-theme-inset" />
      </Card>
    );
  }

  if (!nutrition) {
    return (
      <Card className="bg-theme-card p-4">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-x-2">
            <Ionicons name="nutrition-outline" size={16} color={theme.tint} />
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              {t('progress.fuelingNutrition', 'Daily Fueling & Nutrition')}
            </Text>
          </View>
        </View>
        <View className="bg-theme-inset rounded-inset p-3 items-center">
          <Text className="text-xs text-theme-muted">{t('progress.nutritionConfigureHint', 'Daily AI nutrition targets ready to configure.')}</Text>
        </View>
      </Card>
    );
  }

  const carbsTarget = Math.round(nutrition.carbsTarget || nutrition.carbs || 0);
  const proteinTarget = Math.round(nutrition.proteinTarget || nutrition.protein || 0);
  const fatTarget = Math.round(nutrition.fatTarget || nutrition.fat || 0);

  const loggedCarbs = Math.round(nutrition.loggedCarbs || 0);
  const loggedProtein = Math.round(nutrition.loggedProtein || 0);
  const loggedFat = Math.round(nutrition.loggedFat || 0);

  const targetKcal = carbsTarget || proteinTarget || fatTarget
    ? Math.round(carbsTarget * 4 + proteinTarget * 4 + fatTarget * 9)
    : 0;

  const loggedKcal = Math.round(loggedCarbs * 4 + loggedProtein * 4 + loggedFat * 9);

  const calPercent = targetKcal > 0 ? Math.min(Math.round((loggedKcal / targetKcal) * 100), 100) : 0;
  const calRemaining = Math.max(0, targetKcal - loggedKcal);

  const carbsPercent = carbsTarget > 0 ? Math.min(Math.round((loggedCarbs / carbsTarget) * 100), 100) : 0;
  const proteinPercent = proteinTarget > 0 ? Math.min(Math.round((loggedProtein / proteinTarget) * 100), 100) : 0;
  const fatPercent = fatTarget > 0 ? Math.min(Math.round((loggedFat / fatTarget) * 100), 100) : 0;

  const hasLogged = loggedKcal > 0 || loggedCarbs > 0 || loggedProtein > 0 || loggedFat > 0;
  const loggedItemsCount = Array.isArray(nutrition.loggedItems) ? nutrition.loggedItems.length : 0;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onOpenNutrition}
      disabled={!onOpenNutrition}
    >
      <Card className="bg-theme-card p-4">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-x-2">
            <Ionicons name="nutrition-outline" size={16} color={theme.tint} />
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              {t('progress.fuelingNutrition', 'Fueling & Nutrition')}
            </Text>
          </View>
          <View className="flex-row items-center gap-x-1">
            <Text className="text-xs font-semibold text-theme-tint">{t('progress.viewPlan', 'View Plan')}</Text>
            <Ionicons name="chevron-forward" size={13} color={theme.tint} />
          </View>
        </View>

        {/* Calories Progress Row */}
        <View className="mb-3">
          <View className="flex-row items-baseline justify-between">
            <View className="flex-row items-baseline">
              <Text className="text-2xl font-bold font-rajdhani text-theme-text tabular-nums">
                {loggedKcal.toLocaleString()}
              </Text>
              <Text className="text-xs font-medium text-theme-muted ml-1">
                / {targetKcal > 0 ? targetKcal.toLocaleString() : '—'} kcal
              </Text>
            </View>

            {hasLogged ? (
              loggedKcal >= targetKcal && targetKcal > 0 ? (
                <View className="flex-row items-center gap-x-1">
                  <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                  <Text className="text-xs font-bold text-emerald-500">
                    {t('dashboard.targetMet', 'Target met')}
                  </Text>
                </View>
              ) : (
                <Text className="text-xs font-bold text-theme-tint tabular-nums">
                  {calRemaining.toLocaleString()} kcal left
                </Text>
              )
            ) : (
              <Text className="text-xs font-medium text-theme-muted tabular-nums">
                {targetKcal > 0 ? `${targetKcal.toLocaleString()} kcal target` : '—'}
              </Text>
            )}
          </View>

          {/* Calorie Progress Bar */}
          <View className="h-2 rounded-full bg-theme-border/60 overflow-hidden mt-1.5">
            <View
              className="h-full rounded-full"
              style={{
                width: `${calPercent}%`,
                backgroundColor: theme.tint,
              }}
            />
          </View>
        </View>

        {/* 3 Macro Cards (Carbs, Protein, Fat) with Mini Progress Bars */}
        <View className="flex-row items-center justify-between bg-theme-inset rounded-inset p-3 gap-x-2">
          {/* Carbs */}
          <View className="flex-1">
            <View className="flex-row items-center justify-between mb-0.5">
              <View className="flex-row items-center gap-x-1">
                <View className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <Text className="text-[10px] font-bold text-theme-muted uppercase">
                  {t('dashboard.carbs', 'Carbs')}
                </Text>
              </View>
              <Text className="text-[10px] font-bold text-theme-muted tabular-nums">
                {carbsPercent}%
              </Text>
            </View>
            <View className="flex-row items-baseline">
              <Text className="text-sm font-bold font-rajdhani text-theme-text tabular-nums">
                {loggedCarbs}
              </Text>
              <Text className="text-[10px] text-theme-muted ml-0.5">
                /{carbsTarget}g
              </Text>
            </View>
            {/* Progress bar */}
            <View className="h-1.5 rounded-full bg-amber-500/15 overflow-hidden mt-1">
              <View
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${carbsPercent}%` }}
              />
            </View>
          </View>

          <View className="w-px h-8 bg-theme-border/60" />

          {/* Protein */}
          <View className="flex-1">
            <View className="flex-row items-center justify-between mb-0.5">
              <View className="flex-row items-center gap-x-1">
                <View className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                <Text className="text-[10px] font-bold text-theme-muted uppercase">
                  {t('dashboard.protein', 'Protein')}
                </Text>
              </View>
              <Text className="text-[10px] font-bold text-theme-muted tabular-nums">
                {proteinPercent}%
              </Text>
            </View>
            <View className="flex-row items-baseline">
              <Text className="text-sm font-bold font-rajdhani text-theme-text tabular-nums">
                {loggedProtein}
              </Text>
              <Text className="text-[10px] text-theme-muted ml-0.5">
                /{proteinTarget}g
              </Text>
            </View>
            {/* Progress bar */}
            <View className="h-1.5 rounded-full bg-purple-500/15 overflow-hidden mt-1">
              <View
                className="h-full rounded-full bg-purple-500"
                style={{ width: `${proteinPercent}%` }}
              />
            </View>
          </View>

          <View className="w-px h-8 bg-theme-border/60" />

          {/* Fat */}
          <View className="flex-1">
            <View className="flex-row items-center justify-between mb-0.5">
              <View className="flex-row items-center gap-x-1">
                <View className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <Text className="text-[10px] font-bold text-theme-muted uppercase">
                  {t('dashboard.fat', 'Fat')}
                </Text>
              </View>
              <Text className="text-[10px] font-bold text-theme-muted tabular-nums">
                {fatPercent}%
              </Text>
            </View>
            <View className="flex-row items-baseline">
              <Text className="text-sm font-bold font-rajdhani text-theme-text tabular-nums">
                {loggedFat}
              </Text>
              <Text className="text-[10px] text-theme-muted ml-0.5">
                /{fatTarget}g
              </Text>
            </View>
            {/* Progress bar */}
            <View className="h-1.5 rounded-full bg-rose-500/15 overflow-hidden mt-1">
              <View
                className="h-full rounded-full bg-rose-500"
                style={{ width: `${fatPercent}%` }}
              />
            </View>
          </View>
        </View>

        {/* Footer info tag if items logged */}
        {loggedItemsCount > 0 && (
          <View className="flex-row items-center justify-center gap-x-1 mt-2.5 pt-2 border-t border-theme-border/30">
            <Ionicons name="restaurant-outline" size={11} color={theme.textSecondary} />
            <Text className="text-[11px] font-medium text-theme-muted">
              {loggedItemsCount} {loggedItemsCount === 1 ? 'meal logged today' : 'meals logged today'}
            </Text>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
};

