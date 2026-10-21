import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { PMCMetricsCard } from '../dashboard/PMCMetricsCard';
import { FitnessTrendsChart } from './FitnessTrendsChart';
import { CardioRecoveryTrendsCard } from './CardioRecoveryTrendsCard';
import { EmptyState } from '../ui/EmptyState';
import { useLanguage } from '../../context/LanguageContext';
import { useActivitySources } from '../../hooks/useActivitySources';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { calculatePMCMetrics } from '../../utils/pmcUtils';
import {
  AppleHealthDailyBiometrics,
  getCachedTodayBiometrics,
  fetchTodayBiometricsFromServer,
  fetchRecentBiometricsFromServer,
} from '../../services/appleHealthService';

export const FitnessSubTab: React.FC = () => {
  const { user } = useUser();
  const { activities, loading: activitiesLoading } = useActivities();
  const { physiqueLogs, loading: physiqueLoading } = usePhysique();
  const { t } = useLanguage();
  const { hasActivitySource } = useActivitySources();

  const [todayBiometrics, setTodayBiometrics] = useState<AppleHealthDailyBiometrics | null>(null);
  const [recentBiometrics, setRecentBiometrics] = useState<AppleHealthDailyBiometrics[]>([]);

  useEffect(() => {
    let cancelled = false;
    getCachedTodayBiometrics().then((cached) => {
      if (!cancelled && cached) setTodayBiometrics(cached);
    });
    fetchTodayBiometricsFromServer().then((fresh) => {
      if (!cancelled && fresh) setTodayBiometrics(fresh);
    });
    fetchRecentBiometricsFromServer(7).then((recent) => {
      if (!cancelled && Array.isArray(recent)) setRecentBiometrics(recent);
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
    <View className="gap-y-4 pb-8">
      {/* Without a single workout the curves are flat zeros, which read as "no fitness". */}
      {!activitiesLoading && activities.length === 0 ? (
        <EmptyState
          preset="no-activity"
          title={t('progress.fitnessEmptyTitle')}
          subtitle={t(hasActivitySource ? 'progress.fitnessEmptyConnected' : 'progress.fitnessEmptyDisconnected')}
          action={
            hasActivitySource
              ? undefined
              : {
                  label: t('progress.fitnessEmptyAction'),
                  onPress: () => router.navigate({ pathname: '/(tabs)/profile', params: { subtab: 'connections' } }),
                  variant: 'primary',
                }
          }
        />
      ) : (
        <>
          {/* 1. PMC TELEMETRY METRICS CARDS WITH SPARKLINES (CTL, ATL, TSB, WEIGHT) */}
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
            weightPoints={pmcMetrics.weightPoints}
            tier={user?.subscription_tier || 'free'}
            loading={(activitiesLoading || physiqueLoading) && activities.length === 0}
          />

          {/* 2. 6-WEEK / 3-MONTH / 1-YEAR CHART OF FITNESS, FATIGUE & FORM + WEEKLY HOURS BY SPORT */}
          <FitnessTrendsChart
            history={pmcMetrics.fullHistory || []}
            activities={activities}
          />
        </>
      )}

      {/* 3. CARDIO & AUTONOMIC RECOVERY TELEMETRY (RHR, HRV, CARDIO STRAIN) */}
      <CardioRecoveryTrendsCard
        todayBiometrics={todayBiometrics}
        recentBiometrics={recentBiometrics}
      />
    </View>
  );
};

export default FitnessSubTab;
