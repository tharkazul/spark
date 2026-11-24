import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { PACKAGE_TYPE } from 'react-native-purchases';
import { useTheme } from '@/hooks/use-theme';
import { discountApi } from '../../services/apiServices';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useSubscription } from '../../context/SubscriptionStore';
import { DiscountValidationResult } from '../../types/discount';
import { DiscountCodeField } from './DiscountCodeField';
import { describeStorePrice, formatDate, formatDiscountSummary, formatRegularPrice } from '../../utils/discountFormat';

/** Monthly first, then yearly, then anything else. */
function packageOrder(type: PACKAGE_TYPE): number {
  if (type === PACKAGE_TYPE.MONTHLY) return 0;
  if (type === PACKAGE_TYPE.ANNUAL) return 1;
  return 2;
}

interface DiscountCodeCardProps {
  /** The athlete already has rooka+ (paid, admin or a running free period). */
  isMember: boolean;
}

/**
 * Where an athlete enters a rooka code from a club or creator, and sees what
 * it gives them. Shown in the membership section of the profile.
 */
export function DiscountCodeCard({ isMember }: DiscountCodeCardProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { refreshUser } = useUser();
  const {
    presentPaywall,
    currentOffering,
    discount,
    discountLoading,
    offerOffering,
    offerIntroEligibility,
    refreshDiscount,
    refreshSubscription,
  } = useSubscription();

  /* --- Discount code -------------------------------------------------------
   * The athlete holds at most one code; entering a different one replaces it.
   * A code shows no price of its own: a free-access code says until when
   * rooka+ is free, and a store-offer code shows the App Store / Google Play
   * prices of its offering, which is what the store charges.
   * ---------------------------------------------------------------------- */
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [pendingDiscount, setPendingDiscount] = useState<DiscountValidationResult | null>(null);
  const [savingDiscount, setSavingDiscount] = useState(false);

  const freeRunning = discount?.discountType === 'free_access' && discount.active;
  const offerActive = discount?.discountType === 'store_offer' && discount.active;
  const offerPackages = offerOffering
    ? [...offerOffering.availablePackages].sort(
        (a, b) => packageOrder(a.packageType) - packageOrder(b.packageType)
      )
    : [];

  const handleApplyDiscount = async () => {
    const code = pendingDiscount?.code?.code;
    if (!code) return;
    setSavingDiscount(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await discountApi.apply(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingDiscount(false);
      setPendingDiscount(null);
      await refreshDiscount();
      if (res.code?.discountType === 'free_access') {
        // The server just granted rooka+ through RevenueCat.
        await refreshSubscription();
        await refreshUser();
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('accountMsgs.discountTitle'), err?.data?.error || err?.message || t('accountMsgs.discountApplyFailed'));
    } finally {
      setSavingDiscount(false);
    }
  };

  const handleRemoveDiscount = () => {
    Alert.alert(
      t('accountMsgs.removeDiscountTitle'),
      t('accountMsgs.removeDiscountBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            setSavingDiscount(true);
            try {
              await discountApi.remove();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setEditingDiscount(false);
              setPendingDiscount(null);
              await refreshDiscount();
            } catch (err: any) {
              Alert.alert(t('accountMsgs.discountTitle'), err?.data?.error || err?.message || t('accountMsgs.discountRemoveFailed'));
            } finally {
              setSavingDiscount(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View className="p-3 bg-theme-bg rounded-xl">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center flex-1 pr-2">
          <Ionicons name="pricetag-outline" size={18} color={theme.textSecondary} />
          <Text className="text-theme-text font-bold text-xs ml-3">{t('account.manageDiscountCode')}</Text>
        </View>
        {discountLoading ? <ActivityIndicator size="small" color={theme.tint} /> : null}
      </View>

      {discountLoading ? null : discount && !editingDiscount ? (
        <>
          {/* The code currently on the account */}
          <View
            className={`p-3 rounded-xl border mb-2 ${
              discount.active
                ? 'bg-semantic-success/10 border-semantic-success/30'
                : 'bg-semantic-warning/10 border-semantic-warning/30'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text
                className={`font-extrabold text-sm tracking-wider ${
                  discount.active ? 'text-semantic-success' : 'text-semantic-warning'
                }`}
              >
                {discount.code}
              </Text>
              <Text
                className={`text-[10px] font-extrabold uppercase ${
                  discount.active ? 'text-semantic-success' : 'text-semantic-warning'
                }`}
              >
                {discount.active ? t('common.active') : discount.expired ? t('accountMsgs.expired') : t('accountMsgs.inactive')}
              </Text>
            </View>
            <Text className="text-theme-text text-xs mt-1">{formatDiscountSummary(discount)}</Text>
            {discount.discountType === 'free_access' && discount.expiresAt ? (
              <Text className="text-theme-muted text-[10px] mt-0.5">
                {discount.expired
                  ? t('accountMsgs.endedOn', { date: formatDate(discount.expiresAt) })
                  : t('accountMsgs.freeUntil', { date: formatDate(discount.expiresAt) })}
              </Text>
            ) : null}
            {freeRunning ? (
              <Text className="text-theme-muted text-[10px] mt-1">{t('accountMsgs.freeRunningNote')}</Text>
            ) : null}
          </View>

          {/* A store offer: its plans at the prices the store will charge */}
          {offerActive && !isMember ? (
            offerOffering ? (
              <View className="p-3 bg-theme-card rounded-tile mb-2">
                {offerPackages.map((pkg) => {
                  const showIntro = offerIntroEligibility[pkg.product.identifier] === true;
                  const standard = currentOffering?.availablePackages.find((p) => p.packageType === pkg.packageType);
                  const standardPrice = standard ? formatRegularPrice(standard) : null;
                  const offerPrice = describeStorePrice(pkg, showIntro);
                  const strike = !showIntro && standardPrice && standardPrice !== formatRegularPrice(pkg);
                  return (
                    <View key={pkg.identifier} className="mb-2">
                      <Text className="text-[10px] font-bold text-theme-muted uppercase">
                        {pkg.packageType === PACKAGE_TYPE.MONTHLY
                          ? t('accountMsgs.monthly')
                          : pkg.packageType === PACKAGE_TYPE.ANNUAL
                            ? t('accountMsgs.yearly')
                            : pkg.product.title}
                      </Text>
                      <View className="flex-row flex-wrap items-baseline gap-1.5">
                        <Text className="text-sm font-extrabold text-theme-text">{offerPrice}</Text>
                        {strike ? (
                          <Text className="text-[10px] text-theme-muted line-through">{standardPrice}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                <Text className="text-[10px] text-theme-muted">
                  {Platform.OS === 'ios' ? t('accountMsgs.storePricesNoteIos') : t('accountMsgs.storePricesNoteAndroid')}
                </Text>
              </View>
            ) : (
              <Text className="text-theme-muted text-[11px] mb-2">{t('accountMsgs.offerUnavailable')}</Text>
            )
          ) : null}

          {offerActive && offerOffering && !isMember ? (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                presentPaywall('account').catch(() => {});
              }}
              disabled={savingDiscount}
              className="py-2.5 rounded-xl bg-theme-accent items-center mb-2"
            >
              <Text className="text-white font-bold text-xs">{t('accountMsgs.seeOffer')}</Text>
            </TouchableOpacity>
          ) : null}

          {/* A running free period stays to its end, so there is nothing to change or remove yet. */}
          {freeRunning ? null : (
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPendingDiscount(null);
                  setEditingDiscount(true);
                }}
                disabled={savingDiscount}
                className="flex-1 py-2.5 rounded-xl bg-theme-accent/15 border border-theme-accent/30 items-center"
              >
                <Text className="text-theme-accent font-bold text-xs">{t('account.changeCode')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRemoveDiscount}
                disabled={savingDiscount}
                className="flex-1 py-2.5 rounded-xl bg-semantic-error/10 border border-semantic-error/30 items-center"
              >
                {savingDiscount ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text className="text-semantic-error font-bold text-xs">{t('common.remove')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <>
          <Text className="text-theme-muted text-[11px] mb-2">
            {discount
              ? t('accountMsgs.replaceCode', { code: discount.code })
              : t('accountMsgs.haveCode')}
          </Text>
          <DiscountCodeField
            onResult={setPendingDiscount}
            disabled={savingDiscount}
            placeholder={t('accountMsgs.discountPlaceholder')}
          />
          <View className="flex-row gap-2 mt-2.5">
            <TouchableOpacity
              onPress={handleApplyDiscount}
              disabled={!pendingDiscount?.valid || savingDiscount}
              className={`flex-1 py-2.5 rounded-xl items-center ${
                pendingDiscount?.valid && !savingDiscount ? 'bg-theme-accent' : 'bg-theme-accent/40'
              }`}
            >
              {savingDiscount ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text className="text-white font-bold text-xs">{t('account.applyCode')}</Text>
              )}
            </TouchableOpacity>
            {discount ? (
              <TouchableOpacity
                onPress={() => {
                  setEditingDiscount(false);
                  setPendingDiscount(null);
                }}
                disabled={savingDiscount}
                className="flex-1 py-2.5 rounded-xl border border-theme-border items-center"
              >
                <Text className="text-theme-muted font-bold text-xs">{t('common.cancel')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}
