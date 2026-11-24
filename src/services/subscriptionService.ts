import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { translate as tr } from '../locales/i18n';
import Purchases, {
  CustomerInfo,
  INTRO_ELIGIBILITY_STATUS,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  PurchasesOffering,
  PurchasesPackage
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { apiClient } from './apiClient';

// RevenueCat Public API Keys
export const REVENUECAT_APPLE_KEY = 'appl_xahgRkiLzkQGFIEoOtlnxhMZDEO';
export const REVENUECAT_TEST_KEY = 'test_ncoYEuNlgOotwSTOKwfVQvBPYxF';
export const REVENUECAT_GOOGLE_KEY = 'goog_aTEBhTzWrCaKlxOcxRNyBlDCefe';

// Key Entitlement identifier for rooka subscription
export const ROOKA_ENTITLEMENT_ID = 'rooka';

/**
 * Set to true to use RevenueCat Test Store (virtual sandbox for mock testing).
 * Set to false for live Apple App Store In-App Purchases.
 */
export const USE_TEST_STORE = false;

let isConfigured = false;

/**
 * Sync active subscription entitlement directly with Rooka backend SQLite database
 */
export async function syncSubscriptionWithBackend(hasActiveEntitlement: boolean): Promise<{ success: boolean; tier?: string }> {
  try {
    const res = await apiClient<{ success: boolean; tier?: string }>('/api/user/sync-subscription', {
      method: 'POST',
      body: JSON.stringify({
        hasActiveEntitlement,
        entitlementId: ROOKA_ENTITLEMENT_ID,
      }),
    });
    return res;
  } catch (err: any) {
    console.warn('[RevenueCat] Failed to sync subscription with backend:', err?.message || err);
    return { success: false };
  }
}

/**
 * Initialize RevenueCat SDK
 */
export async function initializeRevenueCat(appUserID?: string | number): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[RevenueCat] Web platform detected, skipping native RevenueCat SDK init.');
    return;
  }

  const apiKey = Platform.OS === 'ios'
    ? (USE_TEST_STORE ? REVENUECAT_TEST_KEY : REVENUECAT_APPLE_KEY)
    : REVENUECAT_GOOGLE_KEY;

  if (!apiKey) {
    console.warn('[RevenueCat] Missing RevenueCat API key.');
    return;
  }

  try {
    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (!Purchases || isExpoGo) {
      console.warn('[RevenueCat] Native module unavailable (running in Expo Go). Skipping init.');
      return;
    }

    if (__DEV__ && typeof Purchases.setLogLevel === 'function') {
      await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    if (typeof Purchases.configure === 'function') {
      Purchases.configure({
        apiKey,
        appUserID: appUserID ? String(appUserID) : undefined,
      });
    }

    isConfigured = true;
    console.log('[RevenueCat] SDK configured successfully.');
  } catch (error) {
    console.error('[RevenueCat] Initialization failed:', error);
  }
}

/**
 * Identify user upon login
 */
export async function identifyUserInRevenueCat(userId: string | number): Promise<CustomerInfo | null> {
  if (!isConfigured || Platform.OS === 'web') return null;
  try {
    const { customerInfo } = await Purchases.logIn(String(userId));
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to logIn user:', error);
    return null;
  }
}

/**
 * Reset RevenueCat identity on user logout
 */
export async function resetUserInRevenueCat(): Promise<CustomerInfo | null> {
  if (!isConfigured || Platform.OS === 'web') return null;
  try {
    const customerInfo = await Purchases.logOut();
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to logOut user:', error);
    return null;
  }
}

/**
 * Check if the user has an active 'rooka' entitlement
 */
export function hasRookaEntitlement(customerInfo: CustomerInfo | null | undefined): boolean {
  if (!customerInfo) return false;
  return customerInfo.entitlements.active[ROOKA_ENTITLEMENT_ID] !== undefined;
}

/**
 * Fetch latest CustomerInfo from RevenueCat
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isConfigured || Platform.OS === 'web') return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error('[RevenueCat] Error getting customer info:', error);
    return null;
  }
}

/**
 * Fetch CustomerInfo straight from RevenueCat, skipping the SDK's cache. Needed
 * after the server grants rooka+ (a free-access code): the cached copy would
 * still say "not subscribed" for several minutes.
 */
export async function getFreshCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isConfigured || Platform.OS === 'web') return null;
  try {
    await Purchases.invalidateCustomerInfoCache();
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error('[RevenueCat] Error refreshing customer info:', error);
    return null;
  }
}

/**
 * Fetch a specific offering by its RevenueCat identifier, e.g. the one a
 * store-offer discount code points at. Null when it does not exist (or has no
 * products this store can sell), so the caller falls back to the default.
 */
export async function getOfferingById(identifier: string): Promise<PurchasesOffering | null> {
  if (!isConfigured || Platform.OS === 'web' || !identifier) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.all[identifier] ?? null;
    return offering && offering.availablePackages.length > 0 ? offering : null;
  } catch (error) {
    console.error('[RevenueCat] Error fetching offering:', identifier, error);
    return null;
  }
}

/**
 * Whether the athlete gets each product's introductory price, by product id.
 * true / false only when the store says so; null when it cannot tell, in which
 * case the regular price is what to show (RevenueCat's own advice).
 *
 * On Android the SDK cannot answer, but Google only returns the offers the
 * athlete qualifies for, so a product's intro price is theirs if it has one.
 */
export async function getIntroEligibility(products: { identifier: string; hasIntro: boolean }[]): Promise<Record<string, boolean | null>> {
  const result: Record<string, boolean | null> = {};
  if (Platform.OS === 'android') {
    products.forEach((p) => { result[p.identifier] = p.hasIntro; });
    return result;
  }
  products.forEach((p) => { result[p.identifier] = null; });
  if (!isConfigured || Platform.OS !== 'ios' || products.length === 0) return result;
  try {
    const statuses = await Purchases.checkTrialOrIntroductoryPriceEligibility(products.map((p) => p.identifier));
    Object.entries(statuses).forEach(([id, info]) => {
      if (info.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE) result[id] = true;
      else if (info.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE) result[id] = false;
      else if (info.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS) result[id] = false;
    });
  } catch (error) {
    console.warn('[RevenueCat] Intro eligibility check failed:', error);
  }
  return result;
}

/**
 * Fetch current offerings and packages (Monthly / Yearly)
 */
export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (!isConfigured || Platform.OS === 'web') return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (error) {
    console.error('[RevenueCat] Error fetching offerings:', error);
    return null;
  }
}

/**
 * Purchase a selected package (Yearly / Monthly)
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ success: boolean; customerInfo?: CustomerInfo; userCancelled?: boolean; error?: string }> {
  if (!isConfigured || Platform.OS === 'web') {
    return { success: false, error: tr('subscriptionMsgs.unsupported') };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const hasAccess = hasRookaEntitlement(customerInfo);
    return { success: hasAccess, customerInfo };
  } catch (error: any) {
    const isCancelled = error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || error.userCancelled;
    if (isCancelled) {
      return { success: false, userCancelled: true };
    }
    console.warn('[RevenueCat] Purchase notice:', error?.message || error);
    return { success: false, error: tr('subscriptionMsgs.purchaseFailed') };
  }
}

/**
 * Restore previous App Store / Play Store purchases
 */
export async function restorePurchases(): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
}> {
  if (!isConfigured || Platform.OS === 'web') {
    return { success: false, error: tr('subscriptionMsgs.unsupported') };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const hasAccess = hasRookaEntitlement(customerInfo);
    return { success: hasAccess, customerInfo };
  } catch (error: any) {
    console.error('[RevenueCat] Restore error:', error);
    return { success: false, error: tr('subscriptionMsgs.restoreFailed') };
  }
}

/**
 * Present RevenueCatUI Paywall
 * Opens the native RevenueCat remote paywall modal for `offering`, or for the
 * current (default) offering when none is given.
 */
export async function presentPaywall(offering?: PurchasesOffering | null): Promise<PAYWALL_RESULT> {
  if (Platform.OS === 'web') {
    console.warn('[RevenueCatUI] Paywalls are not supported on Web.');
    return PAYWALL_RESULT.NOT_PRESENTED;
  }

  try {
    const result = await RevenueCatUI.presentPaywall(offering ? { offering } : undefined);
    return result;
  } catch (error: any) {
    console.warn('[RevenueCatUI] Remote paywall unavailable in this environment:', error?.message || error);
    return PAYWALL_RESULT.ERROR;
  }
}

/**
 * Present RevenueCatUI Paywall only if the user lacks the 'rooka' entitlement
 */
export async function presentPaywallIfNeeded(offering?: PurchasesOffering | null): Promise<PAYWALL_RESULT> {
  if (Platform.OS === 'web') {
    return PAYWALL_RESULT.NOT_PRESENTED;
  }

  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ROOKA_ENTITLEMENT_ID,
      ...(offering ? { offering } : {}),
    });
    return result;
  } catch (error: any) {
    console.warn('[RevenueCatUI] Remote paywall unavailable in this environment:', error?.message || error);
    return PAYWALL_RESULT.ERROR;
  }
}

/**
 * Present Customer Center
 * Allows subscriber self-service (cancel, refund requests, plan switching, support)
 */
export async function presentCustomerCenter(): Promise<void> {
  if (Platform.OS === 'web') {
    console.warn('[RevenueCatUI] Customer Center is not supported on Web.');
    return;
  }

  try {
    if (typeof (RevenueCatUI as any).presentCustomerCenter === 'function') {
      await (RevenueCatUI as any).presentCustomerCenter();
    } else {
      console.warn('[RevenueCatUI] presentCustomerCenter is not available in this build.');
    }
  } catch (error: any) {
    console.warn('[RevenueCatUI] Error presenting Customer Center:', error?.message || error);
  }
}

/**
 * Present Apple Offer Code Redemption Sheet (iOS only)
 */
export async function presentCodeRedemptionSheet(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    if (typeof Purchases.presentCodeRedemptionSheet === 'function') {
      await Purchases.presentCodeRedemptionSheet();
    }
  } catch (error) {
    console.error('[RevenueCat] Error presenting code redemption sheet:', error);
  }
}
