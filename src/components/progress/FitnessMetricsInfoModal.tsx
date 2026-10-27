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
        <BottomSheetHeader className="flex-row items-center justify-between px-5 pt-3 pb-2 border-b border-theme-border/20">
          <Text className="text-base font-bold text-theme-text font-rajdhani">
            {isDutch ? 'Conditie, Vermoeidheid & Vorm' : 'Fitness, Fatigue & Form Guide'}
          </Text>
          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onClose}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color="#94A3B8" />
          </TouchableOpacity>
        </BottomSheetHeader>
      }
      contentClassName="px-5 pt-1 pb-8"
    >
      <ScrollView showsVerticalScrollIndicator={false} className="mt-2 space-y-4">
        {/* Intro */}
        <Text className="text-xs text-theme-muted leading-relaxed">
          {isDutch
            ? 'Deze grafiek toont je Performance Management Chart (PMC). Het brengt de wisselwerking tussen je opgebouwde conditie en actuele vermoeidheid in kaart om te bepalen hoe fris en klaar voor actie je bent.'
            : 'This chart is your Performance Management Chart (PMC). It tracks the physiological balance between your accumulated endurance and recent training stress to calculate your readiness to perform.'}
        </Text>

        {/* 1. Fitness (CTL) */}
        <View className="bg-theme-inset rounded-2xl p-4 border border-[#10B981]/20">
          <View className="flex-row items-center justify-between mb-1.5">
            <View className="flex-row items-center gap-2">
              <View className="w-3 h-3 rounded-full bg-[#10B981]" />
              <Text className="text-sm font-bold text-theme-text font-rajdhani">
                {isDutch ? 'CONDITIE (CTL)' : 'FITNESS (CTL)'}
              </Text>
            </View>
            <Text className="text-[10px] font-semibold text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-full">
              {isDutch ? '42-dagen gemiddelde' : '42-day rolling average'}
            </Text>
          </View>
          <Text className="text-xs text-theme-muted leading-relaxed">
            {isDutch
              ? 'Chronic Training Load: Je aerobe motor en fundament. Het bouwt langzaam op door consistente training over 6 weken en daalt geleidelijk tijdens rustperiodes.'
              : 'Chronic Training Load: Your aerobic engine and endurance foundation. It builds gradually through consistent training over 6 weeks and drops slowly with rest.'}
          </Text>
        </View>

        {/* 2. Fatigue (ATL) */}
        <View className="bg-theme-inset rounded-2xl p-4 border border-[#F59E0B]/20">
          <View className="flex-row items-center justify-between mb-1.5">
            <View className="flex-row items-center gap-2">
              <View className="w-3 h-3 rounded-full bg-[#F59E0B]" />
              <Text className="text-sm font-bold text-theme-text font-rajdhani">
                {isDutch ? 'VERMOEIDHEID (ATL)' : 'FATIGUE (ATL)'}
              </Text>
            </View>
            <Text className="text-[10px] font-semibold text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 rounded-full">
              {isDutch ? '7-dagen gemiddelde' : '7-day rolling average'}
            </Text>
          </View>
          <Text className="text-xs text-theme-muted leading-relaxed">
            {isDutch
              ? 'Acute Training Load: Korte-termijn vermoeidheid en spierbelasting van recente trainingen. Stijgt snel na zware sessies en verdwijnt na 48–72 uur rust of herstel.'
              : 'Acute Training Load: Short-term physical fatigue and muscular stress from recent sessions. Spikes quickly after hard blocks and clears within 48–72 hours of recovery.'}
          </Text>
        </View>

        {/* 3. Form (TSB) */}
        <View className="bg-theme-inset rounded-2xl p-4 border border-[#0EA5E9]/20">
          <View className="flex-row items-center justify-between mb-1.5">
            <View className="flex-row items-center gap-2">
              <View className="w-3 h-3 rounded-full bg-[#0EA5E9]" />
              <Text className="text-sm font-bold text-theme-text font-rajdhani">
                {isDutch ? 'VORM / FRISHEID (TSB)' : 'FORM / FRESHNESS (TSB)'}
              </Text>
            </View>
            <Text className="text-[10px] font-semibold text-[#0EA5E9] bg-[#0EA5E9]/10 px-2 py-0.5 rounded-full">
              {isDutch ? 'Conditie minus Vermoeidheid' : 'Fitness − Fatigue'}
            </Text>
          </View>
          <Text className="text-xs text-theme-muted leading-relaxed mb-3">
            {isDutch
              ? 'Training Stress Balance: Het verschil tussen opgebouwde conditie en recente vermoeidheid. Bepaalt of je lichaam fris is om te pieken of uitgeput door zware trainingsarbeid.'
              : 'Training Stress Balance: The net difference between your accumulated fitness and recent fatigue. Represents whether you are primed to race or fatigued from heavy training.'}
          </Text>

          {/* Scale Legend */}
          <View className="bg-theme-card/60 rounded-xl p-2.5 space-y-2 border border-theme-border/30">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">
              {isDutch ? 'Schaal & Betekenis van Vorm (TSB)' : 'Form (TSB) Scale & Zones'}
            </Text>

            <View className="flex-row items-start gap-2">
              <Text className="text-xs font-bold text-[#10B981] w-20">+10 tot +25</Text>
              <Text className="text-xs text-theme-text flex-1">
                {isDutch ? '🏆 Piekvorm (Wedstrijddag ready, fris & uitgerust)' : '🏆 Peak Form (Race-ready, fully fresh and tapered)'}
              </Text>
            </View>

            <View className="flex-row items-start gap-2">
              <Text className="text-xs font-bold text-theme-text w-20">-10 tot +10</Text>
              <Text className="text-xs text-theme-muted flex-1">
                {isDutch ? '⚖️ Neutraal / Onderhoud (Stabiele trainingszone)' : '⚖️ Neutral / Maintenance (Balanced readiness)'}
              </Text>
            </View>

            <View className="flex-row items-start gap-2">
              <Text className="text-xs font-bold text-[#F59E0B] w-20">-10 tot -30</Text>
              <Text className="text-xs text-theme-muted flex-1">
                {isDutch ? '📈 Productieve Belasting (Optimale prikkel voor conditieopbouw)' : '📈 Productive Training (Optimal stimulus for building engine)'}
              </Text>
            </View>

            <View className="flex-row items-start gap-2">
              <Text className="text-xs font-bold text-[#EF4444] w-20">&lt; -30</Text>
              <Text className="text-xs text-[#EF4444] flex-1">
                {isDutch ? '⚠️ Overbelasting / Risico (Verhoogde kans op blessures/ziekte, rust nodig)' : '⚠️ High Risk / Overreaching (High injury/illness risk, recovery needed)'}
              </Text>
            </View>

            <View className="flex-row items-start gap-2">
              <Text className="text-xs font-bold text-theme-muted w-20">&gt; +25</Text>
              <Text className="text-xs text-theme-muted flex-1">
                {isDutch ? '📉 Afname conditie (Te lang gerust, conditie verlies)' : '📉 Transition / Detraining (Over-rested, aerobic decline)'}
              </Text>
            </View>
          </View>
        </View>

        {/* Close Button */}
        <TouchableOpacity
          onPress={onClose}
          className="bg-theme-accent-strong py-3 rounded-xl items-center mt-2"
        >
          <Text className="text-white text-xs font-bold">
            {isDutch ? 'Begrepen' : 'Got it'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheetModal>
  );
};
