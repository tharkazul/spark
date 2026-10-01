import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { PMCMetricsCard } from '../dashboard/PMCMetricsCard';
import { TrainingReadinessWidget } from './TrainingReadinessWidget';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { calculatePMCMetrics } from '../../utils/pmcUtils';
import {
  AppleHealthDailyBiometrics,
  getCachedTodayBiometrics,
  fetchTodayBiometricsFromServer,
} from '../../services/appleHealthService';

export const FitnessSubTab: React.FC = () => {
  const { user } = useUser();
  const { activities, loading: activitiesLoading } = useActivities();
  const { physiqueLogs, loading: physiqueLoading } = usePhysique();
  const [todayBiometrics, setTodayBiometrics] = useState<AppleHealthDailyBiometrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCachedTodayBiometrics().then((cached) => {
      if (!cancelled && cached) setTodayBiometrics(cached);
    });
    fetchTodayBiometricsFromServer().then((fresh) => {
      if (!cancelled && fresh) setTodayBiometrics(fresh);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pmcMetrics = calculatePMCMetrics(
    activities,
    user?.athlete_metrics?.weight_kg || 0,
    physiqueLogs
  );

  return (
    <View className="gap-y-4">
      {/* 1. TRAINING READINESS GAUGE WIDGET */}
      <TrainingReadinessWidget biometrics={todayBiometrics} />

      {/* 2. PMC TELEMETRY METRICS CARDS WITH SPARKLINES (CTL, ATL, TSB, WEIGHT) */}
      <PMCMetricsCard
        ctl={pmcMetrics.ctl}
        atl={pmcMetrics.atl}
        tsb={pmcMetrics.tsb}
        readinessScore={pmcMetrics.readinessScore}
        weightKg={pmcMetrics.weightKg}
        ctlDelta={pmcMetrics.ctlDelta}
        atlDelta={pmcMetrics.atlDelta}
        ctlHistory={pmcMetrics.ctlHistory}
        atlHistory={pmcMetrics.atlHistory}
        tsbHistory={pmcMetrics.tsbHistory}
        weightHistory={pmcMetrics.weightHistory}
        tier={user?.subscription_tier || 'free'}
        loading={(activitiesLoading || physiqueLoading) && activities.length === 0}
      />
    </View>
  );
};
