/**
 * Human-readable labels for discount codes and the store prices behind them.
 *
 * No price here is computed: every amount is a store product's own formatted
 * price from RevenueCat, so what the app shows is what Apple or Google charge.
 */

import { PACKAGE_TYPE, PurchasesPackage } from 'react-native-purchases';
import { PublicDiscountCode } from '../types/discount';
import { translate as tr, getLocaleTag } from '../locales/i18n';

type PeriodUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

/** "1 month", "14 days". */
export function formatLength(count: number, unit: string): string {
  const n = Math.max(0, Math.round(count));
  switch (unit as PeriodUnit) {
    case 'DAY':
      return n === 1 ? tr('discountFmt.lenDay') : tr('discountFmt.lenDays', { count: n });
    case 'WEEK':
      return n === 1 ? tr('discountFmt.lenWeek') : tr('discountFmt.lenWeeks', { count: n });
    case 'YEAR':
      return n === 1 ? tr('discountFmt.lenYear') : tr('discountFmt.lenYears', { count: n });
    case 'MONTH':
    default:
      return n === 1 ? tr('discountFmt.lenMonth') : tr('discountFmt.lenMonths', { count: n });
  }
}

/** What the code gives, e.g. "1 month of rooka+ free". */
export function formatDiscountSummary(
  code: Pick<PublicDiscountCode, 'discountType' | 'durationMonths' | 'durationDays'>
): string {
  switch (code.discountType) {
    case 'free_access': {
      const length = code.durationMonths
        ? formatLength(code.durationMonths, 'MONTH')
        : formatLength(code.durationDays ?? 0, 'DAY');
      return tr('discountFmt.freeAccess', { length });
    }
    case 'store_offer':
      return tr('discountFmt.storeOffer');
    default:
      return tr('discountFmt.retired');
  }
}

/** The billing period of a package: monthly or yearly for rooka+. */
function billingUnit(pkg: PurchasesPackage): PeriodUnit | null {
  if (pkg.packageType === PACKAGE_TYPE.MONTHLY) return 'MONTH';
  if (pkg.packageType === PACKAGE_TYPE.ANNUAL) return 'YEAR';
  const period = pkg.product.subscriptionPeriod;
  if (period === 'P1M') return 'MONTH';
  if (period === 'P1Y') return 'YEAR';
  return null;
}

function perPeriod(price: string, unit: PeriodUnit | null): string {
  if (unit === 'MONTH') return tr('discountFmt.perMonth', { price });
  if (unit === 'YEAR') return tr('discountFmt.perYear', { price });
  return price;
}

/** The package's regular price per billing period, e.g. "€6.99/month". */
export function formatRegularPrice(pkg: PurchasesPackage): string {
  return perPeriod(pkg.product.priceString, billingUnit(pkg));
}

/**
 * What buying this package costs, as the store will charge it:
 * "€6.99/month", "€3.49/month for 3 months, then €6.99/month",
 * "€34.99 for 1 year, then €69.99/year" or "Free for 7 days, then …".
 *
 * `showIntro` must only be true when the athlete gets the introductory price
 * (see SubscriptionStore's offer eligibility); otherwise the regular price is
 * what they pay, and that is what is shown.
 */
export function describeStorePrice(pkg: PurchasesPackage, showIntro: boolean): string {
  const regular = formatRegularPrice(pkg);
  const intro = showIntro ? pkg.product.introPrice : null;
  if (!intro) return regular;

  const length = formatLength(intro.cycles * intro.periodNumberOfUnits, intro.periodUnit);
  if (intro.price === 0) return tr('discountFmt.introFree', { length, price: regular });

  // Several billing periods at a lower price read per period; one up-front
  // payment reads as a lump sum.
  const unit = intro.periodUnit as PeriodUnit;
  const recurring = intro.cycles > 1 && intro.periodNumberOfUnits === 1 && (unit === 'MONTH' || unit === 'YEAR');
  const introText = recurring ? perPeriod(intro.priceString, unit) : intro.priceString;
  return tr('discountFmt.introThen', { intro: introText, length, price: regular });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(getLocaleTag(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Why a code was rejected, in the athlete's words. */
export const getDiscountErrorFallback = (): string => tr('discountFmt.cannotUse');
