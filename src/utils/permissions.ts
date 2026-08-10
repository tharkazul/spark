import { SubscriptionTier } from '../types/user';

export const hasSubscriptionTier = (tier?: SubscriptionTier): boolean => {
  return tier === 'subscription' || tier === 'spark_plus' || tier === 'premium' || tier === 'admin';
};

export const hasPremiumTier = (tier?: SubscriptionTier): boolean => {
  return tier === 'premium' || tier === 'admin';
};

export const isAdmin = (tier?: SubscriptionTier): boolean => {
  return tier === 'admin';
};

export const canAccessLeaderboard = (tier?: SubscriptionTier): boolean => {
  return hasSubscriptionTier(tier);
};

export const canAccessQuests = (tier?: SubscriptionTier): boolean => {
  return hasSubscriptionTier(tier);
};

export const canConfigureCoach = (tier?: SubscriptionTier): boolean => {
  return hasPremiumTier(tier);
};
