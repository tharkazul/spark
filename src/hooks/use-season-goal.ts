import { useState, useEffect, useMemo } from 'react';
import { useUser } from '../context/UserStore';
import { gamificationApi } from '../services/apiServices';
import { goalsStorage } from '../services/storage';
import { calculateTargetCTL } from '../components/profile/GoalsTab';
import { MacroPeriodInfo } from '../types/dashboard';

export function useSeasonGoal() {
  const { user } = useUser();

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

  useEffect(() => {
    let isMounted = true;
    setActiveGoals([]);

    if (!user?.id) return;

    const loadGoals = async () => {
      try {
        const cached = await goalsStorage.getGoals(user.id);
        if (cached && isMounted && Array.isArray(cached) && cached.length > 0) {
          setActiveGoals(
            cached.map((m: any) => ({
              name: m.name || m.eventName || 'Goal',
              date: m.date || m.eventDate || new Date().toISOString().split('T')[0],
              isMain: m.is_main === 1 || Boolean(m.isARace),
              goalType: (m.goal_type || m.goalType || 'race') as 'race' | 'physiological',
              targetCTL: m.target_ctl || m.targetCtl || (m.name ? calculateTargetCTL(m.name) : 70),
            }))
          );
        }
      } catch (_) {}

      try {
        const milestones = await gamificationApi.getMilestones();
        if (isMounted && milestones && milestones.length > 0) {
          const mapped = milestones.map((m: any) => ({
            name: m.name || m.eventName || 'Goal',
            date: m.date || m.eventDate || new Date().toISOString().split('T')[0],
            isMain: m.is_main === 1 || Boolean(m.isARace),
            goalType: (m.goal_type || m.goalType || 'race') as 'race' | 'physiological',
            targetCTL: m.target_ctl || m.targetCtl || (m.name ? calculateTargetCTL(m.name) : 70),
          }));
          setActiveGoals(mapped);
          await goalsStorage.setGoals(mapped, user.id);
        } else if (isMounted && activeGoals.length === 0) {
          const isPhys = Boolean(user?.target_weight) || Boolean(user?.target_vo2max) || (user as any)?.goal_type === 'physiological' || (user as any)?.goalType === 'physiological';
          const defaultGoals = [
            {
              name: user?.target_event || (isPhys ? 'Health & Fitness Goal' : 'Target Goal'),
              date: user?.event_date || new Date().toISOString().split('T')[0],
              isMain: true,
              goalType: (isPhys ? 'physiological' : ((user as any)?.goal_type || (user as any)?.goalType || 'race')) as 'race' | 'physiological',
              targetCTL: user?.target_ctl || 70,
            },
          ];
          setActiveGoals(defaultGoals);
          await goalsStorage.setGoals(defaultGoals, user.id);
        }
      } catch (error) {
        if (isMounted && activeGoals.length === 0) {
          const isPhys = Boolean(user?.target_weight) || Boolean(user?.target_vo2max) || (user as any)?.goal_type === 'physiological' || (user as any)?.goalType === 'physiological';
          setActiveGoals([
            {
              name: user?.target_event || (isPhys ? 'Health & Fitness Goal' : 'Target Goal'),
              date: user?.event_date || new Date().toISOString().split('T')[0],
              isMain: true,
              goalType: (isPhys ? 'physiological' : ((user as any)?.goal_type || (user as any)?.goalType || 'race')) as 'race' | 'physiological',
              targetCTL: user?.target_ctl || 70,
            },
          ]);
        }
      }
    };

    loadGoals();
    return () => { isMounted = false; };
  }, [user?.id, user?.target_event, user?.event_date, user?.target_weight, user?.target_vo2max, (user as any)?.goal_type, (user as any)?.goalType]);

  const nearestGoalInfo = useMemo(() => {
    if (!activeGoals || activeGoals.length === 0) return null;

    const goalsWithDays = activeGoals.map((g) => ({
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
    const goalName = nearestGoalInfo.name || user?.target_event || 'Training Goal';
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
      ? isPhysiologicalGoal ? 'PRIMARY' : 'RACE'
      : isPhysiologicalGoal ? 'SECONDARY' : 'RACE';

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
            name: 'ADAPT',
            weeks: 'Weeks 1-4',
            focus: 'Neuromuscular & Movement Baseline',
            description: 'Building workout consistency, structural integrity, and foundational movement efficiency with steady volume.',
            status: currentPhaseIndex > 0 ? 'completed' : currentPhaseIndex === 0 ? 'active' : 'upcoming',
            progressPercent: currentPhaseIndex === 0 ? activePhaseProgress : undefined,
          },
          {
            name: 'DEVELOP',
            weeks: 'Weeks 5-8',
            focus: 'Targeted Load & Volume',
            description: 'Incremental load increase, target energy system stimulus, and progressive overload across target disciplines.',
            status: currentPhaseIndex > 1 ? 'completed' : currentPhaseIndex === 1 ? 'active' : 'upcoming',
            progressPercent: currentPhaseIndex === 1 ? activePhaseProgress : undefined,
          },
          {
            name: 'CRUNCH',
            weeks: 'Weeks 9-12',
            focus: 'High-Efficiency Output',
            description: 'Stabilizing physiological adaptations, expanding threshold capacity, and performance benchmark assessments.',
            status: currentPhaseIndex > 2 ? 'completed' : currentPhaseIndex === 2 ? 'active' : 'upcoming',
            progressPercent: currentPhaseIndex === 2 ? activePhaseProgress : undefined,
          },
          {
            name: 'SUSTAIN',
            weeks: 'Weeks 13-16',
            focus: 'Continuous Growth & Maintenance',
            description: 'Sustaining peak fitness gains, long-term habit strength, and resilient baseline fitness maintenance.',
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
          name: 'BASE PHASE',
          weeks: 'Weeks 1-6',
          focus: 'Aerobic Volume & Technique',
          description: 'Building mitochondrial density & base aerobic capacity with low HR long rides and CSS swim threshold sets.',
          status: currentPhaseIndex > 0 ? 'completed' : currentPhaseIndex === 0 ? 'active' : 'upcoming',
          progressPercent: currentPhaseIndex === 0 ? activePhaseProgress : undefined,
        },
        {
          name: 'BUILD PHASE',
          weeks: 'Weeks 7-10',
          focus: 'Strength & Threshold',
          description: 'Introducing Sweet Spot, VO2max intervals, and brick workouts to simulate race fatigue.',
          status: currentPhaseIndex > 1 ? 'completed' : currentPhaseIndex === 1 ? 'active' : 'upcoming',
          progressPercent: currentPhaseIndex === 1 ? activePhaseProgress : undefined,
        },
        {
          name: 'PEAK PHASE',
          weeks: 'Weeks 11-14',
          focus: 'Race Specificity & Speed',
          description: 'High intensity, low volume intervals mimicking exact race pace. Dialing in race-day nutrition.',
          status: currentPhaseIndex > 2 ? 'completed' : currentPhaseIndex === 2 ? 'active' : 'upcoming',
          progressPercent: currentPhaseIndex === 2 ? activePhaseProgress : undefined,
        },
        {
          name: 'TAPER',
          weeks: 'Weeks 15-16',
          focus: 'Recovery & Freshness',
          description: 'Dramatic volume reduction to shed fatigue while maintaining intensity to keep systems firing.',
          status: currentPhaseIndex === 3 ? 'active' : 'upcoming',
          progressPercent: currentPhaseIndex === 3 ? activePhaseProgress : undefined,
        },
      ],
    };
  }, [nearestGoalInfo, user?.current_ctl, isPhysiologicalGoal]);

  return { hasSeasonGoal, seasonInfo };
}
