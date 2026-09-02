import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/use-theme';
import { discountApi } from '../../services/apiServices';
import { DiscountValidationResult } from '../../types/discount';
import { DISCOUNT_ERROR_FALLBACK } from '../../utils/discountFormat';

interface DiscountCodeFieldProps {
  /** Fires whenever the checked result changes — null while empty or in flight. */
  onResult: (result: DiscountValidationResult | null) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  /** Prefilled code, e.g. the one the athlete already holds. */
  initialValue?: string;
}

const DEBOUNCE_MS = 400;

/**
 * A discount code input that checks the code as it is typed and hands the
 * resulting prices back to its parent.
 *
 * Validation is a preview with no side effects on the server, so live-checking
 * is safe: typing a one-time code here does not consume it. Committing the code
 * is the parent's job — onboarding defers it until setup completes, the account
 * screen applies it straight away.
 */
export function DiscountCodeField({
  onResult,
  placeholder = 'Discount code',
  label,
  disabled = false,
  initialValue = '',
}: DiscountCodeFieldProps) {
  const theme = useTheme();
  const [code, setCode] = useState(initialValue);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DiscountValidationResult | null>(null);
  /** A failure to reach the server — distinct from the server rejecting a code. */
  const [networkError, setNetworkError] = useState<string | null>(null);

  // Guards against a slow earlier request landing after a newer one and
  // overwriting the price boxes with a stale answer.
  const requestSeq = useRef(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const trimmed = code.trim();

    if (!trimmed) {
      requestSeq.current += 1;
      setChecking(false);
      setResult(null);
      setNetworkError(null);
      onResultRef.current(null);
      return;
    }

    setChecking(true);
    setNetworkError(null);
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await discountApi.validate(trimmed);
        if (seq !== requestSeq.current) return;
        setResult(res);
        onResultRef.current(res);
        if (res.valid) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
        if (seq !== requestSeq.current) return;
        // Not reaching the server is not the same as the code being rejected:
        // say so plainly and leave the prices as they were.
        setResult(null);
        setNetworkError('Could not check that code right now.');
        onResultRef.current(null);
      } finally {
        if (seq === requestSeq.current) setChecking(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [code]);

  const showValid = !checking && !!result?.valid;
  const showInvalid = !checking && ((!!result && !result.valid) || !!networkError);

  const borderStyle = showValid
    ? { borderColor: '#10B981' }
    : showInvalid
      ? { borderColor: '#EF4444' }
      : undefined;

  return (
    <View>
      {label ? (
        <Text className="text-xs font-bold text-theme-muted uppercase mb-1">{label}</Text>
      ) : null}

      <View
        className="flex-row items-center bg-theme-bg border border-theme-border rounded-xl px-3"
        style={borderStyle}
      >
        <Ionicons name="pricetag-outline" size={16} color={theme.textSecondary} />
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase().replace(/\s+/g, ''))}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!disabled}
          className="flex-1 py-3 px-2 text-theme-text font-bold tracking-wider"
        />
        {checking ? (
          <ActivityIndicator size="small" color={theme.tint} />
        ) : showValid ? (
          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
        ) : showInvalid ? (
          <Ionicons name="close-circle" size={20} color="#EF4444" />
        ) : code ? (
          <Pressable onPress={() => setCode('')} hitSlop={8}>
            <Ionicons name="close" size={16} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {showValid ? (
        <Text className="text-[11px] font-bold text-semantic-success mt-1.5">
          {result?.code?.description || `${result?.code?.code} applied`}
        </Text>
      ) : showInvalid ? (
        <Text className="text-[11px] font-bold text-semantic-error mt-1.5">
          {networkError || result?.message || DISCOUNT_ERROR_FALLBACK}
        </Text>
      ) : null}
    </View>
  );
}
