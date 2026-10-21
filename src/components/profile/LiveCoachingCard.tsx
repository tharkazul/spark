import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../../context/LanguageContext';
import { integrationsApi } from '../../services/apiServices';
import { Card } from '../ui/Card';

/**
 * Setup for live in-workout coaching: the athlete adds their personal
 * <code>@rookacoach.com address as a Garmin LiveTrack contact, and rooka's cues
 * then arrive on the watch as notifications. See docs/LIVE_COACHING.md.
 */
export const LiveCoachingCard: React.FC<{
  /** Render as a section inside another card (the Garmin card) instead of a card of its own. */
  embedded?: boolean;
}> = ({ embedded = false }) => {
  const theme = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetched on open only: the server creates the address on first request, so
  // athletes who never look at this card don't get one.
  const loadAddress = () => {
    setLoading(true);
    setFailed(false);
    integrationsApi
      .getLiveCoachAddress()
      .then((res) => {
        if (res.address) setAddress(res.address);
        else setFailed(true);
      })
      .catch((err) => {
        console.log('Live coaching address load failed:', err?.message || err);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  };

  const handleToggle = () => {
    Haptics.selectionAsync();
    if (!open && !address && !loading) loadAddress();
    setOpen((prev) => !prev);
  };

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const handleCopy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const steps = [t('liveCoach.step1'), t('liveCoach.step2'), t('liveCoach.step3')];

  const content = (
    <>
      <View className="flex-row justify-between items-center">
        <View className="flex-row items-center gap-3 flex-1 mr-2">
          <View className="w-10 h-10 rounded-xl bg-emerald-500/10 items-center justify-center">
            <Ionicons name="radio-outline" size={20} color="#10B981" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-theme-text font-jakarta">{t('liveCoach.title')}</Text>
            <Text className="text-xs text-theme-muted mt-0.5">{t('liveCoach.subtitle')}</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleToggle}
          className={`px-3 py-1.5 rounded-lg border ${
            open ? 'bg-theme-bg border-theme-border' : 'bg-theme-accent border-theme-accent'
          }`}
        >
          <Text className={`text-xs font-bold ${open ? 'text-theme-accent' : 'text-white'}`}>
            {open ? t('common.done', 'Done') : t('liveCoach.setUp')}
          </Text>
        </TouchableOpacity>
      </View>

      {open && (
        <View className="mt-3 pt-3 border-t border-theme-border/50 gap-y-3">
          <Text className="text-xs text-theme-muted leading-relaxed">{t('liveCoach.intro')}</Text>

          <View>
            <Text className="text-[11px] font-bold text-theme-muted uppercase mb-1.5">
              {t('liveCoach.yourAddress')}
            </Text>
            {loading ? (
              <View className="py-3 items-center">
                <ActivityIndicator size="small" color={theme.tint} />
              </View>
            ) : failed || !address ? (
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-xs text-rose-500">{t('liveCoach.addressFailed')}</Text>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    loadAddress();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-theme-bg border border-theme-border"
                >
                  <Text className="text-xs font-bold text-theme-accent">{t('common.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="flex-row items-center gap-2 bg-theme-bg border border-theme-border rounded-lg pl-3 pr-1 py-1">
                <Text selectable numberOfLines={1} className="flex-1 text-sm font-bold text-theme-text">
                  {address}
                </Text>
                <TouchableOpacity
                  onPress={handleCopy}
                  accessibilityRole="button"
                  accessibilityLabel={t('liveCoach.copy')}
                  className="flex-row items-center px-2.5 py-1.5 rounded-md bg-theme-accent"
                >
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color="#FFFFFF" />
                  <Text className="text-xs font-bold text-white ml-1">
                    {copied ? t('liveCoach.copied') : t('liveCoach.copy')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View className="gap-y-2.5">
            {steps.map((step, index) => (
              <View key={index} className="flex-row items-start gap-2.5">
                <View className="w-5 h-5 rounded-full bg-theme-accent/10 items-center justify-center mt-px">
                  <Text className="text-[11px] font-bold text-theme-accent">{index + 1}</Text>
                </View>
                <Text className="flex-1 text-xs text-theme-text leading-relaxed">{step}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row items-start gap-2 bg-theme-bg/50 p-2.5 rounded-xl border border-theme-border/40">
            <Ionicons name="location-outline" size={14} color={theme.textSecondary} />
            <Text className="flex-1 text-[11px] text-theme-muted leading-relaxed">{t('liveCoach.gpsOnly')}</Text>
          </View>
        </View>
      )}
    </>
  );

  return embedded ? <View>{content}</View> : <Card className="p-4">{content}</Card>;
};
