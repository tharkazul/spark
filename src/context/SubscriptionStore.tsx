import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { useUser } from './UserStore';
import {
  initializeRevenueCat,
  identifyUserInRevenueCat,
  resetUserInRevenueCat,
  getCustomerInfo,
  getOfferings,
  hasRookaEntitlement,
  purchasePackage as rcPurchasePackage,
  restorePurchases as rcRestorePurchases,
  presentPaywall as rcPresentPaywall,
  presentPaywallIfNeeded as rcPresentPaywallIfNeeded,
  presentCustomerCenter as rcPresentCustomerCenter,
  presentCodeRedemptionSheet as rcPresentCodeRedemptionSheet,
  ROOKA_ENTITLEMENT_ID,
} from '../services/subscriptionService';

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
  presentPaywall: () => Promise<PAYWALL_RESULT>;
  presentPaywallIfNeeded: () => Promise<PAYWALL_RESULT>;
  presentCustomerCenter: () => Promise<void>;
  presentCodeRedemptionSheet: () => Promise<void>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, refreshUser } = useUser();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Initialize RevenueCat and listen to customer info updates
  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (Platform.OS === 'web') {
        setLoading(false);
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
      }

      // Add real-time listener for purchases/renewals/cancellations
      const customerInfoUpdateListener = (updatedInfo: CustomerInfo) => {
        if (!isMounted) return;
        setCustomerInfo(updatedInfo);
        const active = hasRookaEntitlement(updatedInfo);
        if (active && user?.subscription_tier === 'free') {
          refreshUser?.();
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

  const refreshSubscription = useCallback(async () => {
    setLoading(true);
    const [info, offering] = await Promise.all([
      getCustomerInfo(),
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
        Alert.alert('Subscription', res.error);
      }
      if (res.success) {
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
      Alert.alert('Restore Purchases', res.error);
    } else if (res.success) {
      Alert.alert('Success', 'Your subscriptions have been restored.');
      await refreshUser?.();
    } else {
      Alert.alert('Restore Purchases', 'No active subscription was found for this account.');
    }
    return res.success;
  }, [refreshUser]);

  const presentPaywall = useCallback(async (): Promise<PAYWALL_RESULT> => {
    const result = await rcPresentPaywall();
    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
      await refreshSubscription();
      await refreshUser?.();
    }
    return result;
  }, [refreshSubscription, refreshUser]);

  const presentPaywallIfNeeded = useCallback(async (): Promise<PAYWALL_RESULT> => {
    const result = await rcPresentPaywallIfNeeded();
    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
      await refreshSubscription();
      await refreshUser?.();
    }
    return result;
  }, [refreshSubscription, refreshUser]);

  const presentCustomerCenter = useCallback(async (): Promise<void> => {
    await rcPresentCustomerCenter();
  }, []);

  const presentCodeRedemptionSheet = useCallback(async (): Promise<void> => {
    await rcPresentCodeRedemptionSheet();
    await refreshSubscription();
    await refreshUser?.();
  }, [refreshSubscription, refreshUser]);

  return (
    <SubscriptionContext.Provider
      value={{
        isSubscribed,
        customerInfo,
        currentOffering,
        packages: {
          monthly: monthlyPackage,
          yearly: yearlyPackage,
          all: availablePackages,
        },
        loading,
        presentPaywall,
        presentPaywallIfNeeded,
        presentCustomerCenter,
        presentCodeRedemptionSheet,
        purchasePackage,
        restorePurchases,
        refreshSubscription,
      }}
    >
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
