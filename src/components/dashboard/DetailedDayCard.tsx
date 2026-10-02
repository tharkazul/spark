import React, { useState } from 'react';
import {
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SportType, WorkoutItem } from '../../types/dashboard';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { SportMedallion } from '../ui/SportMedallion';
import { DayAgenda } from './MicroPlanAgendaCard';
import { sportColor } from '../../constants/theme';
import { calculateWorkoutDurationMinutes, formatDuration } from '../../utils/format';
import { WorkoutStructureBar } from './WorkoutStructureBar';
import { WhyThisWorkoutSheet } from './WhyThisWorkoutSheet';
import { useLanguage } from '../../context/LanguageContext';

export const getLocalizedDayName = (dayName: string, t: any) => {
  const upper = (dayName || '').toUpperCase();
  if (upper.startsWith('MON')) return t('days.monShort', 'Mon');
  if (upper.startsWith('TUE')) return t('days.tueShort', 'Tue');
  if (upper.startsWith('WED')) return t('days.wedShort', 'Wed');
  if (upper.startsWith('THU')) return t('days.thuShort', 'Thu');
  if (upper.startsWith('FRI')) return t('days.friShort', 'Fri');
  if (upper.startsWith('SAT')) return t('days.satShort', 'Sat');
  if (upper.startsWith('SUN')) return t('days.sunShort', 'Sun');
  return dayName;
};

export const getLocalizedDayAbbr = (dayName: string, t: any) => {
  const upper = (dayName || '').toUpperCase();
  if (upper.startsWith('MON')) return t('days.monAbbr', 'MON');
  if (upper.startsWith('TUE')) return t('days.tueAbbr', 'TUE');
  if (upper.startsWith('WED')) return t('days.wedAbbr', 'WED');
  if (upper.startsWith('THU')) return t('days.thuAbbr', 'THU');
  if (upper.startsWith('FRI')) return t('days.friAbbr', 'FRI');
  if (upper.startsWith('SAT')) return t('days.satAbbr', 'SAT');
  if (upper.startsWith('SUN')) return t('days.sunAbbr', 'SUN');
  return dayName.slice(0, 3).toUpperCase();
};

interface DetailedDayCardProps {
  day: DayAgenda;
  weatherTemp?: string;
  weatherIcon?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onAdaptPress: () => void;
  onAddWorkout: (dayName: string, dateStr: string) => void;
  onSelectWorkout: (workout: WorkoutItem) => void;
  onDeleteWorkout: (workoutId: string) => void;
  onInvitePartner: (workout: WorkoutItem) => void;
  hasGarmin?: boolean;
  hasAppleWatch?: boolean;
  hasAnyDevices?: boolean;
  onSendWorkoutToDevice?: (workout: WorkoutItem) => void;
  canEdit?: boolean;
  onUpgradePress?: () => void;
}


export function DetailedDayCard({
  day,
  weatherTemp = '22°C',
  weatherIcon = 'partly-sunny-outline',
  isExpanded = true,
  onToggleExpand,
  onAdaptPress,
  onAddWorkout,
  onSelectWorkout,
  onDeleteWorkout,
  onInvitePartner,
  hasGarmin = false,
  hasAppleWatch = false,
  hasAnyDevices = false,
  onSendWorkoutToDevice,
  canEdit = true,
  onUpgradePress,
}: DetailedDayCardProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { t } = useLanguage();
  const [activeMenuWorkout, setActiveMenuWorkout] = useState<WorkoutItem | null>(null);
  const [whyWorkout, setWhyWorkout] = useState<WorkoutItem | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [syncedWorkoutIds, setSyncedWorkoutIds] = useState<Record<string, boolean>>({});

  const isRest = (sport?: SportType | string) => String(sport || '').toUpperCase() === 'REST';
  const activeWorkouts = (day.workouts || []).filter((w) => !isRest(w.type));
  const isRestDay = activeWorkouts.length === 0;

  // Primary active workout for collapsed summary
  const primaryWorkout = activeWorkouts[0];

  // -------------------------------------------------------------
  // 1. COLLAPSED REST DAY ROW (96pt)
  // -------------------------------------------------------------
  if (!isExpanded && isRestDay) {
    return (
      <Card
        variant="default"
        activeScale={1}
        onPress={() => {
          onToggleExpand?.();
        }}
        className="mb-3 px-4 py-3 min-h-[96px] justify-center"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1 mr-2">
            <View className="w-10 h-10 rounded-full bg-theme-inset items-center justify-center">
              <Ionicons name="moon" size={18} color="#94A3B8" />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-base font-bold text-theme-text font-jakarta">
                  {getLocalizedDayName(day.dayName, t)} {day.dateStr}
                </Text>
                {day.isToday && (
                  <Chip variant="accent" size="sm" label={t('common.today', 'Today')} />
                )}
              </View>
              <Text numberOfLines={1} className="text-xs text-theme-muted mt-0.5 font-jakarta">
                {t('dashboard.restDaySummary', 'Rest Day · Aim for 8 hours of sleep & gentle mobility')}
              </Text>
            </View>
          </View>

          <Button
            variant="ghost"
            size="sm"
            label={t('common.add', 'Add')}
            leftIcon={!canEdit ? <Ionicons name="lock-closed" size={11} color="#0EA5E9" /> : undefined}
            onPress={() => {
              if (!canEdit) {
                onUpgradePress?.();
              } else {
                onAddWorkout(day.dayName, day.dateStr);
              }
            }}
          />
        </View>
      </Card>
    );
  }

  // -------------------------------------------------------------
  // 2. COLLAPSED WORKOUT ROW (72pt)
  // -------------------------------------------------------------
  if (!isExpanded && primaryWorkout) {
    const durMins = calculateWorkoutDurationMinutes(primaryWorkout);

    return (
      <Card
        variant="default"
        activeScale={1}
        onPress={() => {
          onToggleExpand?.();
        }}
        className="mb-3 px-4 py-3 h-[72px] justify-center"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1 mr-2">
            <SportMedallion sport={primaryWorkout.type} size={40} />
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-xs font-semibold text-theme-muted uppercase font-jakarta">
                  {getLocalizedDayName(day.dayName, t)} {day.dateStr}
                </Text>
                {day.isToday && (
                  <Chip variant="accent" size="sm" label={t('common.today', 'Today')} />
                )}
              </View>
              <Text numberOfLines={1} className="text-sm font-bold text-theme-text font-jakarta mt-0.5">
                {primaryWorkout.title}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <Chip variant="points" size="sm" label={Math.round(primaryWorkout.rookaPoints || 0)} />
            <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
          </View>
        </View>
      </Card>
    );
  }

  // -------------------------------------------------------------
  // 3. EXPANDED DAY CARD
  // -------------------------------------------------------------
  return (
    <Card
      variant="default"
      className={`mb-4 ${
        day.isToday ? 'border-[1.5px] border-theme-accent' : ''
      }`}
    >
      {/* Header Row */}
      <View className="flex-row items-center justify-between pb-3 border-b border-theme-border/40">
        <View className="flex-row items-center gap-2.5">
          <View>
            <View className="flex-row items-center gap-2">
              <Text className="text-lg font-extrabold text-theme-text font-jakarta">
                {getLocalizedDayName(day.dayName, t)} {day.dateStr}
              </Text>
              {day.isToday && (
                <Chip variant="accent" size="sm" label={t('common.today', 'Today')} />
              )}
            </View>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <Ionicons name={(weatherIcon as any) || 'partly-sunny-outline'} size={13} color="#94A3B8" />
              <Text className="text-xs font-medium text-theme-muted font-jakarta">
                {weatherTemp}
              </Text>
            </View>
          </View>
        </View>

        {/* Header Actions: Adapt Button & Overflow Menu */}
        <View className="flex-row items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            label={t('dashboard.adapt', 'Adapt')}
            leftIcon={<Ionicons name="flash" size={13} color="#0EA5E9" />}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onAdaptPress();
            }}
          />

          <TouchableOpacity
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="w-10 h-10 items-center justify-center rounded-full"
            onPress={() => {
              Haptics.selectionAsync();
              if (primaryWorkout) {
                setActiveMenuWorkout(primaryWorkout);
              } else {
                if (!canEdit) {
                  onUpgradePress?.();
                } else {
                  onAddWorkout(day.dayName, day.dateStr);
                }
              }
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Workouts List / Rest Day Content */}
      {isRestDay ? (
        <View className="py-4 items-center justify-center">
          <View className="w-12 h-12 rounded-full bg-theme-inset items-center justify-center mb-2">
            <Ionicons name="moon" size={24} color="#94A3B8" />
          </View>
          <Text className="text-base font-bold text-theme-text font-jakarta">
            {t('common.restDay', 'Rest Day')}
          </Text>
          <Text className="text-xs text-theme-muted text-center max-w-[260px] mt-1 font-jakarta">
            {t('dashboard.restDayDetails', 'Aim for 8 hours of sleep and adequate hydration to prepare for upcoming workouts.')}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            label={t('dashboard.addWorkoutBtn', '+ Add Workout')}
            leftIcon={!canEdit ? <Ionicons name="lock-closed" size={11} color="#0EA5E9" /> : undefined}
            className="mt-3"
            onPress={() => {
              if (!canEdit) {
                onUpgradePress?.();
              } else {
                onAddWorkout(day.dayName, day.dateStr);
              }
            }}
          />
        </View>
      ) : (
        <View className="pt-2">
          {activeWorkouts.map((workout, wIdx) => {
            const sportColorCode = sportColor(workout.type, scheme);
            const durMins = calculateWorkoutDurationMinutes(workout);
            const noteExpanded = Boolean(expandedNotes[workout.id]);
            const isWorkoutSynced = Boolean(workout.isSynced || syncedWorkoutIds[workout.id]);

            return (
              <View
                key={workout.id}
                className={`py-3.5 ${
                  wIdx < activeWorkouts.length - 1 ? 'border-b border-theme-border/40' : ''
                }`}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelectWorkout(workout);
                  }}
                  className="flex-row items-start gap-3"
                >
                  {/* Left Sport Rail */}
                  <View
                    style={{ backgroundColor: sportColorCode }}
                    className="w-1 self-stretch rounded-full my-0.5"
                  />

                  {/* Sport Medallion */}
                  <SportMedallion sport={workout.type} size={48} />

                  {/* Workout Info */}
                  <View className="flex-1">
                    <Text
                      numberOfLines={2}
                      className="text-base font-bold text-theme-text font-jakarta leading-snug"
                    >
                      {workout.title}
                    </Text>

                    {/* Meta Row */}
                    <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
                      <Text
                        style={{ fontVariant: ['tabular-nums'] }}
                        className="text-sm font-bold text-theme-muted font-rajdhani"
                      >
                        {formatDuration(durMins)}
                      </Text>
                      <Text className="text-theme-muted/50">·</Text>
                      <Chip
                        variant="points"
                        size="sm"
                        label={Math.round(workout.rookaPoints || 0)}
                      />
                      {workout.isCompleted && (
                        <View className="flex-row items-center gap-1 bg-semantic-success-bg px-2 py-0.5 rounded-full">
                          <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                          <Text className="text-[10px] font-extrabold text-semantic-success-text">
                            {t('common.doneUpper', 'DONE')}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Structure Bar (if structured steps exist) */}
                {workout.steps && workout.steps.length > 0 && (
                  <View className="mt-2.5">
                    <WorkoutStructureBar steps={workout.steps} />
                  </View>
                )}

                {/* Coach Note in Inset Card */}
                {workout.coachNote && (
                  <Card variant="inset" className="mt-3 p-3 flex-col">
                    <View className="flex-row items-start gap-2">
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={14}
                        color="#0EA5E9"
                        style={{ marginTop: 2 }}
                      />
                      <Text
                        numberOfLines={noteExpanded ? undefined : 3}
                        className="flex-1 text-xs text-theme-muted leading-relaxed font-jakarta"
                      >
                        {workout.coachNote}
                      </Text>
                    </View>
                    {workout.coachNote.length > 120 && (
                      <TouchableOpacity
                        onPress={() => {
                          setExpandedNotes((prev) => ({
                            ...prev,
                            [workout.id]: !noteExpanded,
                          }));
                        }}
                        className="self-end mt-1"
                      >
                        <Text className="text-[11px] font-bold text-theme-accent-text font-jakarta">
                          {noteExpanded ? t('common.showLess', 'Show less') : t('common.showMore', 'Show more')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </Card>
                )}

                {/* Workout Actions */}
                <View className="mt-3 flex-row items-center justify-between flex-wrap gap-2">
                  <View className="flex-row items-center gap-2 flex-wrap">
                    {hasAnyDevices && onSendWorkoutToDevice && (
                      isWorkoutSynced ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled
                          label={hasGarmin && hasAppleWatch ? t('dashboard.onDevices', 'On devices ✓') : hasGarmin ? t('dashboard.onGarmin', 'On Garmin ✓') : t('dashboard.onWatch', 'On Watch ✓')}
                          leftIcon={<Ionicons name="checkmark-circle" size={13} color="#10B981" />}
                        />
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          label={hasGarmin && hasAppleWatch ? t('dashboard.sendToDevices', 'Send to devices') : hasGarmin ? t('dashboard.sendToGarmin', 'Send to Garmin') : t('dashboard.sendToAppleWatch', 'Send to Apple Watch')}
                          leftIcon={<Ionicons name="watch-outline" size={13} color="#FFFFFF" />}
                          onPress={async () => {
                            setSyncedWorkoutIds((prev) => ({ ...prev, [workout.id]: true }));
                            await onSendWorkoutToDevice(workout);
                          }}
                        />
                      )
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      label={t('common.edit', 'Edit')}
                      leftIcon={!canEdit ? <Ionicons name="lock-closed" size={11} color="#0EA5E9" /> : undefined}
                      onPress={() => {
                        if (!canEdit) {
                          onUpgradePress?.();
                        } else {
                          onSelectWorkout(workout);
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      label="Why this workout"
                      leftIcon={<Ionicons name="sparkles" size={12} color="#0EA5E9" />}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setWhyWorkout(workout);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      label={t('common.invite', 'Invite')}
                      leftIcon={<Ionicons name="people-outline" size={13} color="#0EA5E9" />}
                      onPress={() => onInvitePartner(workout)}
                    />
                  </View>
                </View>
              </View>
            );
          })}

          {/* Footer: Add Workout button */}
          <View className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              label={t('dashboard.addWorkoutBtn', '+ Add workout')}
              leftIcon={!canEdit ? <Ionicons name="lock-closed" size={11} color="#0EA5E9" /> : undefined}
              onPress={() => {
                if (!canEdit) {
                  onUpgradePress?.();
                } else {
                  onAddWorkout(day.dayName, day.dateStr);
                }
              }}
            />
          </View>
        </View>
      )}

      {/* Overflow Menu Modal */}
      {activeMenuWorkout && (
        <Modal
          visible={Boolean(activeMenuWorkout)}
          transparent
          animationType="fade"
          onRequestClose={() => setActiveMenuWorkout(null)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
            onPress={() => setActiveMenuWorkout(null)}
          >
            <View className="bg-theme-card p-4 rounded-t-sheet border-t border-theme-border">
              <Text className="text-base font-bold text-theme-text font-jakarta mb-3 px-2">
                {activeMenuWorkout.title}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  setActiveMenuWorkout(null);
                  if (!canEdit) {
                    onUpgradePress?.();
                  } else {
                    onAddWorkout(day.dayName, day.dateStr);
                  }
                }}
                className="py-3 px-2 flex-row items-center gap-3 border-b border-theme-border/40"
              >
                <Ionicons name="add-circle-outline" size={20} color="#0EA5E9" />
                <Text className="text-sm font-semibold text-theme-text font-jakarta flex-1">{t('dashboard.menuAddWorkout', 'Add workout')}</Text>
                {!canEdit && (
                  <View className="flex-row items-center gap-1 bg-theme-accent/15 px-2 py-0.5 rounded-full">
                    <Ionicons name="lock-closed" size={10} color="#0EA5E9" />
                    <Text className="text-[10px] font-bold text-theme-accent">ROOKA+</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setActiveMenuWorkout(null);
                  onAdaptPress();
                }}
                className="py-3 px-2 flex-row items-center gap-3 border-b border-theme-border/40"
              >
                <Ionicons name="calendar-outline" size={20} color="#0EA5E9" />
                <Text className="text-sm font-semibold text-theme-text font-jakarta">{t('dashboard.menuMoveAdapt', 'Move or adapt session')}</Text>
              </TouchableOpacity>

              {hasAnyDevices && onSendWorkoutToDevice && (
                <TouchableOpacity
                  onPress={() => {
                    const target = activeMenuWorkout;
                    setActiveMenuWorkout(null);
                    if (target) onSendWorkoutToDevice(target);
                  }}
                  className="py-3 px-2 flex-row items-center gap-3 border-b border-theme-border/40"
                >
                  <Ionicons name="watch-outline" size={20} color="#0EA5E9" />
                  <Text className="text-sm font-semibold text-theme-text font-jakarta">
                    {hasGarmin && hasAppleWatch
                      ? t('dashboard.menuSendDevices', 'Send to connected devices')
                      : hasGarmin
                      ? t('dashboard.sendToGarmin', 'Send to Garmin')
                      : t('dashboard.sendToAppleWatch', 'Send to Apple Watch')}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => {
                  setActiveMenuWorkout(null);
                  if (!canEdit) {
                    onUpgradePress?.();
                  } else {
                    const toDeleteId = activeMenuWorkout.id;
                    onDeleteWorkout(toDeleteId);
                  }
                }}
                className="py-3 px-2 flex-row items-center gap-3"
              >
                <Ionicons name="trash-outline" size={20} color={canEdit ? "#EF4444" : "#94A3B8"} />
                <Text className={`text-sm font-semibold ${canEdit ? 'text-rose-500' : 'text-theme-muted'} font-jakarta flex-1`}>{t('dashboard.menuDeleteWorkout', 'Delete workout')}</Text>
                {!canEdit && (
                  <View className="flex-row items-center gap-1 bg-theme-accent/15 px-2 py-0.5 rounded-full">
                    <Ionicons name="lock-closed" size={10} color="#0EA5E9" />
                    <Text className="text-[10px] font-bold text-theme-accent">ROOKA+</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* WHY THIS WORKOUT SHEET */}
      <WhyThisWorkoutSheet
        visible={Boolean(whyWorkout)}
        workout={whyWorkout}
        dayName={day.dayName}
        onClose={() => setWhyWorkout(null)}
      />
    </Card>
  );
}

export default DetailedDayCard;
