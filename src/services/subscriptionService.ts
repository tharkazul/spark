import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  PurchasesOffering,
  PurchasesPackage
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

// RevenueCat Public API Keys
export const REVENUECAT_APPLE_KEY = 'appl_xahgRkiLzkQGFIEoOtlnxhMZDEO';
export const REVENUECAT_GOOGLE_KEY = 'test_ncoYEuNlgOotwSTOKwfVQvBPYxF';

// Key Entitlement identifier for rooka subscription
export const ROOKA_ENTITLEMENT_ID = 'rooka';

let isConfigured = false;

/**
 * Initialize RevenueCat SDK
 */
export async function initializeRevenueCat(appUserID?: string | number): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[RevenueCat] Web platform detected, skipping native RevenueCat SDK init.');
    return;
  }

  const apiKey = Platform.OS === 'ios' ? REVENUECAT_APPLE_KEY : REVENUECAT_GOOGLE_KEY;

  if (!apiKey) {
    console.warn('[RevenueCat] Missing RevenueCat API key.');
    return;
  }

  try {
    if (!Purchases) {
      console.warn('[RevenueCat] Native module unavailable (likely running in Expo Go). Skipping init.');
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
    return { success: false, error: 'RevenueCat is not supported on this platform' };
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
    return { success: false, error: error.message || 'Purchase failed.' };
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
    return { success: false, error: 'RevenueCat is not supported on this platform' };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const hasAccess = hasRookaEntitlement(customerInfo);
    return { success: hasAccess, customerInfo };
  } catch (error: any) {
    console.error('[RevenueCat] Restore error:', error);
    return { success: false, error: error.message || 'Failed to restore purchases.' };
  }
}

/**
 * Present RevenueCatUI Paywall
 * Opens the native RevenueCat remote paywall modal
 */
export async function presentPaywall(): Promise<PAYWALL_RESULT> {
  if (Platform.OS === 'web') {
    console.warn('[RevenueCatUI] Paywalls are not supported on Web.');
    return PAYWALL_RESULT.NOT_PRESENTED;
  }

  try {
    const result = await RevenueCatUI.presentPaywall();
    return result;
  } catch (error: any) {
    console.warn('[RevenueCatUI] Remote paywall unavailable in this environment:', error?.message || error);
    return PAYWALL_RESULT.ERROR;
  }
}

/**
 * Present RevenueCatUI Paywall only if the user lacks the 'rooka' entitlement
 */
export async function presentPaywallIfNeeded(): Promise<PAYWALL_RESULT> {
  if (Platform.OS === 'web') {
    return PAYWALL_RESULT.NOT_PRESENTED;
  }

  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ROOKA_ENTITLEMENT_ID,
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
