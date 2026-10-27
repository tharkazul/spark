import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal, BottomSheetHeader } from '../ui/BottomSheetModal';
import { useLanguage } from '../../context/LanguageContext';

interface FitnessMetricsInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export const FitnessMetricsInfoModal: React.FC<FitnessMetricsInfoModalProps> = ({
  visible,
  onClose,
}) => {
  const { language } = useLanguage();
  const isDutch = language?.startsWith('nl');

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      showHandle
      header={
        <BottomSheetHeader className="flex-row items-center px-5 pt-3 pb-2 border-b border-theme-border/20">
          <Text className="text-base font-bold text-theme-text font-rajdhani">
            {isDutch ? 'Conditie, Vermoeidheid & Vorm' : 'Fitness, Fatigue & Form Guide'}
          </Text>
        </BottomSheetHeader>
      }
      contentClassName="px-5 pt-2 pb-8"
    >
      <ScrollView showsVerticalScrollIndicator={false} className="mt-1 space-y-3">
        {/* Visual Relationship Card */}
        <View className="bg-theme-accent/10 rounded-2xl p-3.5 border border-theme-accent/25">
          <View className="flex-row items-center gap-2 mb-2.5">
            <Ionicons name="git-network-outline" size={16} color="#0EA5E9" />
            <Text className="text-xs font-bold uppercase tracking-wider text-theme-text font-rajdhani">
              {isDutch ? 'Hoe hangen ze samen?' : 'How They Relate'}
            </Text>
          </View>

          {/* Visual Pill Equation */}
          <View className="flex-row items-center justify-center gap-1.5 bg-theme-card/90 rounded-xl py-2.5 px-2 mb-3 border border-theme-border/40">
            <View className="flex-row items-center gap-1 bg-[#10B981]/12 px-2 py-1 rounded-lg">
              <Ionicons name="trending-up" size={13} color="#10B981" />
              <Text className="text-xs font-bold text-[#10B981] font-rajdhani">
                {isDutch ? 'Conditie' : 'Fitness'}
              </Text>
            </View>
            <Text className="text-sm font-bold text-theme-muted">−</Text>
            <View className="flex-row items-center gap-1 bg-[#F59E0B]/12 px-2 py-1 rounded-lg">
              <Ionicons name="flame-outline" size={13} color="#F59E0B" />
              <Text className="text-xs font-bold text-[#F59E0B] font-rajdhani">
                {isDutch ? 'Vermoeidheid' : 'Fatigue'}
              </Text>
            </View>
            <Text className="text-sm font-bold text-theme-muted">=</Text>
            <View className="flex-row items-center gap-1 bg-[#0EA5E9]/12 px-2 py-1 rounded-lg">
              <Ionicons name="speedometer-outline" size={13} color="#0EA5E9" />
              <Text className="text-xs font-bold text-[#0EA5E9] font-rajdhani">
                {isDutch ? 'Vorm' : 'Form'}
              </Text>
            </View>
          </View>

          {/* 3 Icon-Driven Takeaways */}
          <View className="space-y-2">
            <View className="flex-row items-center gap-2.5">
              <View className="w-6 h-6 rounded-lg bg-[#0EA5E9]/15 items-center justify-center">
                <Ionicons name="barbell-outline" size={13} color="#0EA5E9" />
              </View>
              <Text className="text-xs text-theme-text flex-1">
                {isDutch
                  ? 'Training bouwt zowel Conditie als Vermoeidheid op.'
                  : 'Workouts build both Fitness and Fatigue together.'}
              </Text>
            </View>

            <View className="flex-row items-center gap-2.5">
              <View className="w-6 h-6 rounded-lg bg-[#F59E0B]/15 items-center justify-center">
                <Ionicons name="timer-outline" size={13} color="#F59E0B" />
              </View>
              <Text className="text-xs text-theme-text flex-1">
                {isDutch
                  ? 'Vermoeidheid zakt snel (~7d), Conditie blijft lang (~42d).'
                  : 'Fatigue clears fast (~7d); Fitness lasts much longer (~42d).'}
              </Text>
            </View>

            <View className="flex-row items-center gap-2.5">
              <View className="w-6 h-6 rounded-lg bg-[#10B981]/15 items-center justify-center">
                <Ionicons name="trophy-outline" size={13} color="#10B981" />
              </View>
              <Text className="text-xs text-theme-text flex-1">
                {isDutch
                  ? 'Na rust verdwijnt vermoeidheid en piekt je Vorm.'
                  : 'Rest clears fatigue while keeping fitness — peaking Form!'}
              </Text>
            </View>
          </View>
        </View>

        {/* 1. Fitness (CTL) */}
        <View className="bg-theme-inset rounded-2xl p-3.5 border border-[#10B981]/20">
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-row items-center gap-2">
              <Ionicons name="trending-up" size={16} color="#10B981" />
              <Text className="text-sm font-bold text-theme-text font-rajdhani">
                {isDutch ? 'CONDITIE (CTL)' : 'FITNESS (CTL)'}
              </Text>
            </View>
            <Text className="text-[10px] font-semibold text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-full">
              {isDutch ? '42d gemiddelde' : '42d average'}
            </Text>
          </View>
          <Text className="text-xs text-theme-muted">
            {isDutch
              ? 'Je aerobe motor op lange termijn. Groeit gestaag door consistentie.'
              : 'Your long-term aerobic base. Grows steadily with consistent training.'}
          </Text>
        </View>

        {/* 2. Fatigue (ATL) */}
        <View className="bg-theme-inset rounded-2xl p-3.5 border border-[#F59E0B]/20">
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-row items-center gap-2">
              <Ionicons name="flame-outline" size={16} color="#F59E0B" />
              <Text className="text-sm font-bold text-theme-text font-rajdhani">
                {isDutch ? 'VERMOEIDHEID (ATL)' : 'FATIGUE (ATL)'}
              </Text>
            </View>
            <Text className="text-[10px] font-semibold text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 rounded-full">
              {isDutch ? '7d gemiddelde' : '7d average'}
            </Text>
          </View>
          <Text className="text-xs text-theme-muted">
            {isDutch
              ? 'Korte-termijn trainingsstress. Stijgt na sessies, daalt snel met rust.'
              : 'Short-term training stress. Spikes after hard sessions, clears with rest.'}
          </Text>
        </View>

        {/* 3. Form (TSB) */}
        <View className="bg-theme-inset rounded-2xl p-3.5 border border-[#0EA5E9]/20">
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-row items-center gap-2">
              <Ionicons name="speedometer-outline" size={16} color="#0EA5E9" />
              <Text className="text-sm font-bold text-theme-text font-rajdhani">
                {isDutch ? 'VORM (TSB)' : 'FORM (TSB)'}
              </Text>
            </View>
            <Text className="text-[10px] font-semibold text-[#0EA5E9] bg-[#0EA5E9]/10 px-2 py-0.5 rounded-full">
              {isDutch ? 'Frisheid' : 'Freshness'}
            </Text>
          </View>
          <Text className="text-xs text-theme-muted mb-2.5">
            {isDutch
              ? 'Netto belastbaarheid en frisheid om te presteren.'
              : 'Your net freshness and readiness to perform.'}
          </Text>

          {/* Compact Icon Scale Legend */}
          <View className="bg-theme-card/60 rounded-xl p-2.5 space-y-1.5 border border-theme-border/30">
            <View className="flex-row items-center gap-2">
              <Ionicons name="trophy-outline" size={14} color="#10B981" />
              <Text className="text-xs font-bold text-[#10B981] w-16 tabular-nums">+5 to +25</Text>
              <Text className="text-xs text-theme-text flex-1">
                {isDutch ? 'Piekvorm & Wedstrijdklaar' : 'Peak & Race Ready'}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <Ionicons name="swap-horizontal-outline" size={14} color="#0EA5E9" />
              <Text className="text-xs font-bold text-[#0EA5E9] w-16 tabular-nums">-10 to +5</Text>
              <Text className="text-xs text-theme-muted flex-1">
                {isDutch ? 'In Balans / Onderhoud' : 'Balanced / Maintenance'}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <Ionicons name="trending-up-outline" size={14} color="#F59E0B" />
              <Text className="text-xs font-bold text-[#F59E0B] w-16 tabular-nums">-10 to -30</Text>
              <Text className="text-xs text-theme-muted flex-1">
                {isDutch ? 'Productieve Opbouw' : 'Productive Building'}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <Ionicons name="warning-outline" size={14} color="#F43F5E" />
              <Text className="text-xs font-bold text-[#F43F5E] w-16 tabular-nums">&lt; -30</Text>
              <Text className="text-xs text-[#F43F5E] flex-1">
                {isDutch ? 'Hoge Belasting — Rust nodig' : 'High Strain — Rest Needed'}
              </Text>
            </View>
          </View>
        </View>

        {/* Close Button */}
        <TouchableOpacity
          onPress={onClose}
          className="bg-theme-accent-strong py-3 rounded-xl items-center mt-1"
        >
          <Text className="text-white text-xs font-bold">
            {isDutch ? 'Begrepen' : 'Got it'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheetModal>
  );
};
