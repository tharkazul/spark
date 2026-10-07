import { useState, useEffect, useMemo } from 'react';
import { useUser } from '../context/UserStore';
import { gamificationApi } from '../services/apiServices';
import { goalsStorage } from '../services/storage';
import { calculateTargetCTL } from '../components/profile/GoalsTab';
import { MacroPeriodInfo } from '../types/dashboard';
import { useLanguage } from '../context/LanguageContext';

export function useSeasonGoal() {
  const { user } = useUser();
  const { t } = useLanguage();

  const calculateDaysRemaining = (eventDateStr?: string): number => {
    if (!eventDateStr) return 0;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const cleanEventDate = eventDateStr.split('T')[0];
      if (cleanEventDate === todayStr) return 0;
      const todayDate = new Date(todayStr + 'T00:00:00Z');
      const targetDate = new Date(cleanEventDate + 'T00:00:00Z');
      const diffTime = targetDate.getTime() - todayDate.getTime();
      return Math.round(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  };

  const [activeGoals, setActiveGoals] = useState<Array<{
    name: string;
    date: string;
    isMain: boolean;
    goalType: 'race' | 'physiological';
    targetCTL?: number;
  }>>([]);
  // True once goals were resolved from cache or server, so callers can show a "no goal"
  // empty state without flashing it while goals are still loading.
  const [goalsLoaded, setGoalsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setActiveGoals([]);
    setGoalsLoaded(false);

    if (!user?.id) return;

    const loadGoals = async () => {
      try {
        const cached = await goalsStorage.getGoals(user.id);
        if (cached && isMounted && Array.isArray(cached) && cached.length > 0) {
          setActiveGoals(
            cached.map((m: any) => ({
              name: m.name || m.eventName || 'Goal',
              date: m.date || m.eventDate || '',
              isMain: m.is_main === 1 || Boolean(m.isARace),
              goalType: (m.goal_type || m.goalType || 'race') as 'race' | 'physiological',
              targetCTL: m.target_ctl || m.targetCtl || (m.name ? calculateTargetCTL(m.name) : 70),
            }))
          );
          setGoalsLoaded(true);
        }
      } catch (_) {}

      try {
        const milestones = await gamificationApi.getMilestones();
        if (isMounted && milestones && milestones.length > 0) {
          const mapped = milestones.map((m: any) => ({
            name: m.name || m.eventName || 'Goal',
            date: m.date || m.eventDate || '',
            isMain: m.is_main === 1 || Boolean(m.isARace),
            goalType: (m.goal_type || m.goalType || 'race') as 'race' | 'physiological',
            targetCTL: m.target_ctl || m.targetCtl || (m.name ? calculateTargetCTL(m.name) : 70),
          }));
          setActiveGoals(mapped);
          await goalsStorage.setGoals(mapped, user.id);
        } else if (isMounted) {
          // No milestones on the server. Only fall back to the profile's goal fields when the
          // athlete actually set an event date; otherwise there is no goal and the phase card
          // must stay hidden (previously a placeholder goal dated today showed "Race day").
          if (!user?.event_date) {
            setActiveGoals([]);
            await goalsStorage.setGoals([], user.id);
            return;
          }
          const isPhys = Boolean(user?.target_weight) || Boolean(user?.target_vo2max) || (user as any)?.goal_type === 'physiological' || (user as any)?.goalType === 'physiological';
          const defaultGoals = [
            {
              name: user?.target_event || (isPhys ? t('seasonPlan.healthGoal') : t('seasonPlan.targetGoal')),
              date: user.event_date,
              isMain: true,
              goalType: (isPhys ? 'physiological' : ((user as any)?.goal_type || (user as any)?.goalType || 'race')) as 'race' | 'physiological',
              targetCTL: user?.target_ctl || 70,
            },
          ];
          setActiveGoals(defaultGoals);
          await goalsStorage.setGoals(defaultGoals, user.id);
        }
      } catch (error) {
        if (isMounted && activeGoals.length === 0 && user?.event_date) {
          const isPhys = Boolean(user?.target_weight) || Boolean(user?.target_vo2max) || (user as any)?.goal_type === 'physiological' || (user as any)?.goalType === 'physiological';
          setActiveGoals([
            {
              name: user?.target_event || (isPhys ? t('seasonPlan.healthGoal') : t('seasonPlan.targetGoal')),
              date: user.event_date,
              isMain: true,
              goalType: (isPhys ? 'physiological' : ((user as any)?.goal_type || (user as any)?.goalType || 'race')) as 'race' | 'physiological',
              targetCTL: user?.target_ctl || 70,
            },
          ]);
        }
      } finally {
        if (isMounted) setGoalsLoaded(true);
      }
    };

    loadGoals();
    return () => { isMounted = false; };
  }, [user?.id, user?.target_event, user?.event_date, user?.target_weight, user?.target_vo2max, (user as any)?.goal_type, (user as any)?.goalType]);

  const nearestGoalInfo = useMemo(() => {
    const datedGoals = (activeGoals || []).filter((g) => Boolean(g.date));
    if (datedGoals.length === 0) return null;

    const goalsWithDays = datedGoals.map((g) => ({
      ...g,
      daysRemaining: calculateDaysRemaining(g.date),
    }));

    const upcomingGoals = goalsWithDays.filter((g) => g.daysRemaining >= -1);
    const pool = upcomingGoals.length > 0 ? upcomingGoals : goalsWithDays;

    pool.sort((a, b) => {
      const aFuture = a.daysRemaining >= -1;
      const bFuture = b.daysRemaining >= -1;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;

      if (Math.abs(a.daysRemaining) !== Math.abs(b.daysRemaining)) {
        return Math.abs(a.daysRemaining) - Math.abs(b.daysRemaining);
      }
      return a.isMain === b.isMain ? 0 : a.isMain ? -1 : 1;
    });

    return pool[0] || null;
  }, [activeGoals, user?.target_event, user?.event_date, user?.target_ctl, user?.target_weight, user?.target_vo2max]);

  const hasSeasonGoal = Boolean(nearestGoalInfo && nearestGoalInfo.name);
  const isPhysiologicalGoal = nearestGoalInfo?.goalType === 'physiological';

  const seasonInfo: MacroPeriodInfo | null = useMemo(() => {
    if (!nearestGoalInfo) return null;
    const goalName = nearestGoalInfo.name || user?.target_event || t('seasonPlan.trainingGoal');
    const targetCtl = nearestGoalInfo.targetCTL || user?.target_ctl || 70;
    const currentCtl = user?.current_ctl || 45;
    const daysLeft = nearestGoalInfo.daysRemaining;

    const totalCycleDays = Math.max(112, daysLeft > 0 ? daysLeft : 112);
    const elapsedTotalDays = Math.max(0, totalCycleDays - Math.max(0, daysLeft));
    const progressRatio = Math.min(1, Math.max(0, elapsedTotalDays / totalCycleDays));

    const phaseLengthDays = totalCycleDays / 4;
    const currentPhaseIndex = Math.min(3, Math.floor(progressRatio * 4));
    const phaseElapsedDays = Math.max(0, elapsedTotalDays - currentPhaseIndex * phaseLengthDays);
    const activePhaseProgress = Math.min(100, Math.max(0, Math.round((phaseElapsedDays / phaseLengthDays) * 100)));

    const goalLabel = nearestGoalInfo.isMain
      ? isPhysiologicalGoal ? t('seasonPlan.labelPrimary') : t('seasonPlan.labelRace')
      : isPhysiologicalGoal ? t('seasonPlan.labelSecondary') : t('seasonPlan.labelRace');

    if (isPhysiologicalGoal) {
      return {
        raceTargetName: goalName,
        daysRemaining: daysLeft,
        currentPhaseIndex,
        targetCTL: targetCtl,
        currentCTL: currentCtl,
        goalType: 'physiological',
        isPrimaryGoal: nearestGoalInfo.isMain,
        goalLabel,
        phases: [
          {
            name: t('seasonPlan.adaptName'),
            weeks: t('seasonPlan.weeks', { range: '1-4' }),
            focus: t('seasonPlan.adaptFocus'),
            description: t('seasonPlan.adaptDesc'),
            status: currentPhaseIndex > 0 ? 'completed' : currentPhaseIndex === 0 ? 'active' : 'upcoming',
            progressPercent: currentPhaseIndex === 0 ? activePhaseProgress : undefined,
          },
          {
            name: t('seasonPlan.developName'),
            weeks: t('seasonPlan.weeks', { range: '5-8' }),
            focus: t('seasonPlan.developFocus'),
            description: t('seasonPlan.developDesc'),
            status: currentPhaseIndex > 1 ? 'completed' : currentPhaseIndex === 1 ? 'active' : 'upcoming',
            progressPercent: currentPhaseIndex === 1 ? activePhaseProgress : undefined,
          },
          {
            name: t('seasonPlan.crunchName'),
            weeks: t('seasonPlan.weeks', { range: '9-12' }),
            focus: t('seasonPlan.crunchFocus'),
            description: t('seasonPlan.crunchDesc'),
            status: currentPhaseIndex > 2 ? 'completed' : currentPhaseIndex === 2 ? 'active' : 'upcoming',
            progressPercent: currentPhaseIndex === 2 ? activePhaseProgress : undefined,
          },
          {
            name: t('seasonPlan.sustainName'),
            weeks: t('seasonPlan.weeks', { range: '13-16' }),
            focus: t('seasonPlan.sustainFocus'),
            description: t('seasonPlan.sustainDesc'),
            status: currentPhaseIndex === 3 ? 'active' : 'upcoming',
            progressPercent: currentPhaseIndex === 3 ? activePhaseProgress : undefined,
          },
        ],
      };
    }

    return {
      raceTargetName: goalName,
      daysRemaining: daysLeft,
      currentPhaseIndex,
      targetCTL: targetCtl,
      currentCTL: currentCtl,
      goalType: 'race',
      isPrimaryGoal: nearestGoalInfo.isMain,
      goalLabel,
      phases: [
        {
          name: t('seasonPlan.baseName'),
          shortName: t('seasonPlan.baseShort'),
          weeks: t('seasonPlan.weeks', { range: '1-6' }),
          focus: t('seasonPlan.baseFocus'),
          description: t('seasonPlan.baseDesc'),
          status: currentPhaseIndex > 0 ? 'completed' : currentPhaseIndex === 0 ? 'active' : 'upcoming',
          progressPercent: currentPhaseIndex === 0 ? activePhaseProgress : undefined,
        },
        {
          name: t('seasonPlan.buildName'),
          shortName: t('seasonPlan.buildShort'),
          weeks: t('seasonPlan.weeks', { range: '7-10' }),
          focus: t('seasonPlan.buildFocus'),
          description: t('seasonPlan.buildDesc'),
          status: currentPhaseIndex > 1 ? 'completed' : currentPhaseIndex === 1 ? 'active' : 'upcoming',
          progressPercent: currentPhaseIndex === 1 ? activePhaseProgress : undefined,
        },
        {
          name: t('seasonPlan.peakName'),
          shortName: t('seasonPlan.peakShort'),
          weeks: t('seasonPlan.weeks', { range: '11-14' }),
          focus: t('seasonPlan.peakFocus'),
          description: t('seasonPlan.peakDesc'),
          status: currentPhaseIndex > 2 ? 'completed' : currentPhaseIndex === 2 ? 'active' : 'upcoming',
          progressPercent: currentPhaseIndex === 2 ? activePhaseProgress : undefined,
        },
        {
          name: t('seasonPlan.taperName'),
          shortName: t('seasonPlan.taperName'),
          weeks: t('seasonPlan.weeks', { range: '15-16' }),
          focus: t('seasonPlan.taperFocus'),
          description: t('seasonPlan.taperDesc'),
          status: currentPhaseIndex === 3 ? 'active' : 'upcoming',
          progressPercent: currentPhaseIndex === 3 ? activePhaseProgress : undefined,
        },
      ],
    };
  }, [nearestGoalInfo, user?.current_ctl, isPhysiologicalGoal, t]);

  return { hasSeasonGoal, seasonInfo, goalsLoaded };
}
