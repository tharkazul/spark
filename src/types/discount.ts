/**
 * Discount code types.
 *
 * Mirrors server/services/pricing.js. Note that no price arithmetic happens on
 * this side: the server computes every number in `PricingBreakdown` and the app
 * only renders it, which is what keeps the paywall, the account screen and the
 * admin list from drifting apart.
 */

/** What the code does to the price. */
export type DiscountType = 'percent' | 'fixed_yearly' | 'fixed_monthly' | 'fixed_both';

/** How many athletes may ever redeem it. */
export type RedemptionType = 'one_time' | 'limited' | 'unlimited';

export interface PlanPrice {
  original: number;
  final: number;
  discounted: boolean;
}

export interface YearlyPlanPrice extends PlanPrice {
  originalPerMonth: number;
  perMonth: number;
}

export interface PricingBreakdown {
  currency: string;
  monthly: PlanPrice;
  yearly: YearlyPlanPrice;
  /** How much cheaper the annual plan works out per month. 0 when it is not cheaper. */
  annualSavingsPercent: number;
}

/** A code as the athlete sees it — no usage caps, no other holders. */
export interface PublicDiscountCode {
  code: string;
  description: string | null;
  discountType: DiscountType;
  percentOff: number | null;
  fixedMonthlyPrice: number | null;
  fixedYearlyPrice: number | null;
  durationMonths: number | null;
  expiresAt: string | null;
}

/** The code an athlete currently holds. */
export interface AppliedDiscount extends PublicDiscountCode {
  appliedAt: string | null;
  /** True once a time-limited discount's window has closed. */
  expired: boolean;
  /** False when expired, deactivated, or outside its validity window. */
  active: boolean;
}

export interface DiscountValidationResult {
  valid: boolean;
  /** Only set when valid. */
  code?: PublicDiscountCode;
  /** Present on both outcomes: the prices to render right now. */
  pricing: PricingBreakdown;
  reason?: 'empty' | 'not_found' | 'inactive' | 'not_started' | 'expired' | 'exhausted';
  message?: string;
}

export interface MyDiscountResponse {
  pricing: PricingBreakdown;
  discount: AppliedDiscount | null;
}

export interface ApplyDiscountResponse {
  success: boolean;
  code: PublicDiscountCode;
  pricing: PricingBreakdown;
}
