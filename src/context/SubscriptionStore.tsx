import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useStableFns } from '../hooks/useStableFns';
import { translate as tr } from '../locales/i18n';
import { Platform, Alert } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { useUser } from './UserStore';
import { track } from '../services/analytics';
import { discountApi } from '../services/apiServices';
import { AppliedDiscount } from '../types/discount';

import {
  initializeRevenueCat,
  identifyUserInRevenueCat,
  resetUserInRevenueCat,
  getCustomerInfo,
  getFreshCustomerInfo,
  getOfferings,
  getOfferingById,
  getIntroEligibility,
  hasRookaEntitlement,
  purchasePackage as rcPurchasePackage,
  restorePurchases as rcRestorePurchases,
  presentPaywall as rcPresentPaywall,
  presentPaywallIfNeeded as rcPresentPaywallIfNeeded,
  presentCustomerCenter as rcPresentCustomerCenter,
  presentCodeRedemptionSheet as rcPresentCodeRedemptionSheet,
  syncSubscriptionWithBackend,
  ROOKA_ENTITLEMENT_ID,
} from '../services/subscriptionService';

export type PaywallSource =
  | 'tab_bar'
  | 'planning'
  | 'coach'
  | 'out_of_messages'
  | 'profile'
  | 'account'
  | 'connections'
  | 'my_log'
  | 'other';

interface SubscriptionContextType {
  isSubscribed: boolean;
  customerInfo: CustomerInfo | null;
  currentOffering: PurchasesOffering | null;
  packages: {
    monthly: PurchasesPackage | null;
    yearly: PurchasesPackage | null;
    all: PurchasesPackage[];
  };
  loading: boolean;
  /** The discount code the athlete holds, or null. */
  discount: AppliedDiscount | null;
  discountLoading: boolean;
  /**
   * The offering an active store-offer code points at, once loaded from
   * RevenueCat. Every paywall opens with it instead of the default offering,
   * so the athlete is sold the discounted products they were shown.
   */
  offerOffering: PurchasesOffering | null;
  /** Per product id of offerOffering: does the athlete get its intro price? null = unknown. */
  offerIntroEligibility: Record<string, boolean | null>;
  /** Reload the held code (and its offering) after applying or removing one. */
  refreshDiscount: () => Promise<void>;
  /** `from` is where the paywall was opened, for the usage statistics. */
  presentPaywall: (from?: PaywallSource) => Promise<PAYWALL_RESULT>;
  presentPaywallIfNeeded: () => Promise<PAYWALL_RESULT>;
  presentCustomerCenter: () => Promise<void>;
  presentCodeRedemptionSheet: () => Promise<void>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

interface HeldDiscount {
  owner: number | string;
  discount: AppliedDiscount | null;
  offering: PurchasesOffering | null;
  introEligibility: Record<string, boolean | null>;
}

const NO_ELIGIBILITY: Record<string, boolean | null> = {};

export const SubscriptionStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, refreshUser } = useUser();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  // The held code, its offering and eligibility, plus the user they were loaded
  // for: after a logout or an account switch nothing of the previous athlete's
  // code is exposed, and their offer can never open on someone else's paywall.
  const [heldDiscount, setHeldDiscount] = useState<HeldDiscount | null>(null);

  const refreshDiscount = useCallback(async () => {
    const owner = user?.id;
    if (owner == null) return;
    const next: HeldDiscount = { owner, discount: null, offering: null, introEligibility: {} };
    try {
      const res = await discountApi.mine();
      next.discount = res.discount ?? null;
      const offeringId =
        next.discount?.active && next.discount.discountType === 'store_offer' ? next.discount.offeringId : null;
      next.offering = offeringId ? await getOfferingById(offeringId) : null;
      if (next.offering) {
        next.introEligibility = await getIntroEligibility(
          next.offering.availablePackages.map((p) => ({
            identifier: p.product.identifier,
            hasIntro: !!p.product.introPrice,
          }))
        );
      }
    } catch (err) {
      console.log('[Discounts] Could not load the held code:', err);
    }
    setHeldDiscount(next);
  }, [user?.id]);

  const ownHeld = heldDiscount && user?.id != null && heldDiscount.owner === user.id ? heldDiscount : null;
  const discount = ownHeld?.discount ?? null;
  const discountLoading = user?.id != null && !ownHeld;
  const offerOffering = ownHeld?.offering ?? null;
  const offerIntroEligibility = ownHeld?.introEligibility ?? NO_ELIGIBILITY;

  // Initialize RevenueCat and listen to customer info updates
  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (Platform.OS === 'web') {
        setLoading(false);
        refreshDiscount();
        return;
      }

      await initializeRevenueCat(user?.id);

      if (user?.id) {
        await identifyUserInRevenueCat(user.id);
      }

      const [info, offering] = await Promise.all([
        getCustomerInfo(),
        getOfferings(),
      ]);

      if (isMounted) {
        setCustomerInfo(info);
        setCurrentOffering(offering);
        setLoading(false);
        // After RevenueCat is configured, so a store-offer code's offering can load.
        refreshDiscount();
        if (hasRookaEntitlement(info)) {
          syncSubscriptionWithBackend(true).then(() => {
            refreshUser?.();
          });
        }
      }

      // Add real-time listener for purchases/renewals/cancellations
      const customerInfoUpdateListener = (updatedInfo: CustomerInfo) => {
        if (!isMounted) return;
        setCustomerInfo(updatedInfo);
        const active = hasRookaEntitlement(updatedInfo);
        if (active) {
          syncSubscriptionWithBackend(true).then(() => {
            refreshUser?.();
          });
        }
      };

      Purchases.addCustomerInfoUpdateListener(customerInfoUpdateListener);

      return () => {
        // CustomerInfoUpdateListener cleanup happens natively
      };
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // Handle user authentication changes
  useEffect(() => {
    if (!user?.id) {
      resetUserInRevenueCat();
    }
  }, [user?.id]);

  const isSubscribed = hasRookaEntitlement(customerInfo);

  // Parse available packages (monthly & yearly)
  const availablePackages = currentOffering?.availablePackages || [];
  const monthlyPackage =
    currentOffering?.monthly ||
    availablePackages.find(
      (p) => p.packageType === 'MONTHLY' || p.identifier.toLowerCase().includes('monthly')
    ) ||
    null;
  const yearlyPackage =
    currentOffering?.annual ||
    availablePackages.find(
      (p) =>
        p.packageType === 'ANNUAL' ||
        p.identifier.toLowerCase().includes('yearly') ||
        p.identifier.toLowerCase().includes('annual')
    ) ||
    null;

  // Skips the SDK's cached CustomerInfo: this runs right after a purchase or
  // a server-side grant, which the cached copy does not know about yet.
  const refreshSubscription = useCallback(async () => {
    setLoading(true);
    const [info, offering] = await Promise.all([
      getFreshCustomerInfo(),
      getOfferings(),
    ]);
    setCustomerInfo(info);
    setCurrentOffering(offering);
    setLoading(false);
  }, []);

  const purchasePackage = useCallback(
    async (pkg: PurchasesPackage): Promise<boolean> => {
      setLoading(true);
      const res = await rcPurchasePackage(pkg);
      if (res.customerInfo) {
        setCustomerInfo(res.customerInfo);
      }
      setLoading(false);
      if (res.error && !res.userCancelled) {
        Alert.alert(tr('coachStore.subscriptionTitle'), res.error);
      }
      if (res.success) {
        await syncSubscriptionWithBackend(true);
        await refreshUser?.();
      }
      return res.success;
    },
    [refreshUser]
  );

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    const res = await rcRestorePurchases();
    if (res.customerInfo) {
      setCustomerInfo(res.customerInfo);
    }
    setLoading(false);
    if (res.error) {
      Alert.alert(tr('coachStore.restoreTitle'), res.error);
    } else if (res.success) {
      Alert.alert(tr('common.success'), tr('coachStore.restored'));
      await syncSubscriptionWithBackend(true);
      await refreshUser?.();
    } else {
      Alert.alert(tr('coachStore.restoreTitle'), tr('coachStore.noSubscription'));
    }
    return res.success;
  }, [refreshUser]);

  const presentPaywall = useCallback(async (from: PaywallSource = 'other'): Promise<PAYWALL_RESULT> => {
    track('paywall_shown', { from });
    let result: PAYWALL_RESULT;
    try {
      result = await rcPresentPaywall(offerOffering);
    } catch (err) {
      track('paywall_closed', { from, result: 'error' });
      throw err;
    }
    track('paywall_closed', { from, result: String(result).toLowerCase() });
    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
      await syncSubscriptionWithBackend(true);
      await refreshSubscription();
      await refreshUser?.();
    }
    return result;
  }, [offerOffering, refreshSubscription, refreshUser]);

  const presentPaywallIfNeeded = useCallback(async (): Promise<PAYWALL_RESULT> => {
    const result = await rcPresentPaywallIfNeeded(offerOffering);
    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
      await refreshSubscription();
      await refreshUser?.();
    }
    return result;
  }, [offerOffering, refreshSubscription, refreshUser]);

  const presentCustomerCenter = useCallback(async (): Promise<void> => {
    await rcPresentCustomerCenter();
  }, []);

  const presentCodeRedemptionSheet = useCallback(async (): Promise<void> => {
    await rcPresentCodeRedemptionSheet();
    await refreshSubscription();
    await refreshUser?.();
  }, [refreshSubscription, refreshUser]);

  // One object per change of the data, not per render (see useStableFns).
  const stableFns = useStableFns({
    presentPaywall,
    presentPaywallIfNeeded,
    presentCustomerCenter,
    presentCodeRedemptionSheet,
    purchasePackage,
    restorePurchases,
    refreshSubscription,
    refreshDiscount,
  });
  const contextValue = useMemo(
    () => ({
      isSubscribed,
      customerInfo,
      currentOffering,
      packages: {
        monthly: monthlyPackage,
        yearly: yearlyPackage,
        all: availablePackages,
      },
      loading,
      discount,
      discountLoading,
      offerOffering,
      offerIntroEligibility,
      ...stableFns,
    }),
    [isSubscribed, customerInfo, currentOffering, monthlyPackage, yearlyPackage, availablePackages, loading, discount, discountLoading, offerOffering, offerIntroEligibility, stableFns]
  );

  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = (): SubscriptionContextType => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionStore');
  }
  return context;
};
