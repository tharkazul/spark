/**
 * Human-readable labels for discount codes.
 *
 * Formatting only — every price here is a number the server already computed
 * (see server/services/pricing.js). Nothing in this file recalculates a
 * discount.
 */

import { PublicDiscountCode } from '../types/discount';
import { translate as tr, getLocaleTag } from '../locales/i18n';

export const formatMoney = (amount: number, currency = '€') =>
  `${currency}${amount.toFixed(2)}`;

/**
 * What the code does to the price: "25% off", "€49.00/year", "€3.99/month".
 */
export function formatDiscountEffect(
  code: Pick<
    PublicDiscountCode,
    'discountType' | 'percentOff' | 'fixedMonthlyPrice' | 'fixedYearlyPrice'
  >,
  currency = '€'
): string {
  switch (code.discountType) {
    case 'percent':
      return tr('discountFmt.percentOff', { percent: code.percentOff ?? 0 });
    case 'fixed_yearly':
      return tr('discountFmt.perYear', { price: formatMoney(code.fixedYearlyPrice ?? 0, currency) });
    case 'fixed_monthly':
      return tr('discountFmt.perMonth', { price: formatMoney(code.fixedMonthlyPrice ?? 0, currency) });
    case 'fixed_both':
      return `${formatMoney(code.fixedMonthlyPrice ?? 0, currency)}/mo · ${formatMoney(
        code.fixedYearlyPrice ?? 0,
        currency
      )}/yr`;
    default:
      return '—';
  }
}

/** "for 3 months" / "for the whole subscription". */
export function formatDuration(durationMonths: number | null): string {
  if (!durationMonths) return tr('discountFmt.forever');
  return durationMonths === 1 ? tr('discountFmt.oneMonth') : tr('discountFmt.nMonths', { count: durationMonths });
}

/**
 * The one-line summary shown on the athlete's account screen, e.g.
 * "25% off for 3 months".
 */
export function formatDiscountSummary(
  code: Pick<
    PublicDiscountCode,
    'discountType' | 'percentOff' | 'fixedMonthlyPrice' | 'fixedYearlyPrice' | 'durationMonths'
  >,
  currency = '€'
): string {
  return `${formatDiscountEffect(code, currency)} ${formatDuration(code.durationMonths)}`;
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
