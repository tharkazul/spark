/**
 * Discount code types. Mirrors server/services/pricing.js.
 *
 * A code never changes a price by itself — Apple and Google charge the
 * athlete. A code either gives a free rooka+ period (granted by the server
 * through RevenueCat) or points the paywall at a RevenueCat offering whose
 * store products carry the discount. Any price the app shows for a code comes
 * from those store products, so it is what the store will charge.
 */

/**
 * What the code gives. Anything else is a retired type from before codes were
 * tied to what the stores charge; it does nothing and is shown as inactive.
 */
export type DiscountType = 'free_access' | 'store_offer';

/** List price in the shape older app builds render. Not used for display any more. */
export interface PricingBreakdown {
  currency: string;
  monthly: { original: number; final: number; discounted: boolean };
  yearly: { original: number; final: number; discounted: boolean; originalPerMonth: number; perMonth: number };
  annualSavingsPercent: number;
}

/** A code as the athlete sees it — no usage caps, no other holders. */
export interface PublicDiscountCode {
  code: string;
  discountType: DiscountType | string;
  /** Free period length: one of these two is set for free_access. */
  durationMonths: number | null;
  durationDays: number | null;
  /** The RevenueCat offering to show, for store_offer. */
  offeringId: string | null;
  /** When a free period (would) end. Null for store offers. */
  expiresAt: string | null;
}

/** The code an athlete currently holds. */
export interface AppliedDiscount extends PublicDiscountCode {
  appliedAt: string | null;
  /** True once a free period has ended. */
  expired: boolean;
  /** False when ended, switched off, outside its window, or a retired type. */
  active: boolean;
}

export type DiscountRejection =
  | 'empty'
  | 'not_found'
  | 'inactive'
  | 'retired'
  | 'not_started'
  | 'expired'
  | 'exhausted'
  | 'already_subscribed'
  | 'free_access_used'
  | 'update_required';

export interface DiscountValidationResult {
  valid: boolean;
  /** Only set when valid. */
  code?: PublicDiscountCode;
  reason?: DiscountRejection;
  message?: string;
}

export interface MyDiscountResponse {
  discount: AppliedDiscount | null;
}

export interface ApplyDiscountResponse {
  success: boolean;
  code: PublicDiscountCode;
}
