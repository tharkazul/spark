import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserStore';
import { useLanguage } from '../context/LanguageContext';

export default function LoginScreen() {
  const router = useRouter();
  const { login, register, loading: storeLoading } = useUser();
  const { t } = useLanguage();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMessage(null);
    if (!email || !password) {
      setErrorMessage('Please fill in both email and password.');
      return;
    }

    if (mode === 'register' && password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, username || undefined);
      }
      router.replace('/(tabs)');
    } catch (err: any) {
      setErrorMessage(err.message || (mode === 'login' ? 'Failed to sign in.' : 'Failed to create account.'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    fontSize: 16,
    lineHeight: 22,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    minHeight: 46,
    includeFontPadding: false,
  };

  return (
    <SafeAreaView className="flex-1 bg-theme-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingTop: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          className="px-6"
        >
          {/* Header branding */}
          <View className="items-center mb-8">
            {/* The Rooka mark, matching the app icon and the onboarding
                header — was a generic Ionicons lightning bolt. */}
            <View className="w-16 h-16 rounded-2xl overflow-hidden items-center justify-center mb-3 bg-white border border-theme-border/60 shadow-lg">
              <Image
                source={require('../../assets/images/logo-mark.png')}
                className="w-full h-full"
                resizeMode="cover"
                accessibilityLabel="Rooka"
              />
            </View>
            <Text className="text-3xl font-extrabold text-theme-text tracking-tight">ROOKA</Text>
            <Text className="text-sm font-medium text-theme-muted mt-1">
              {t('auth.subtitle')}
            </Text>
          </View>

          {/* Mode Switcher */}
          <View className="flex-row bg-theme-card p-1 rounded-xl mb-6">
            <TouchableOpacity
              onPress={() => {
                setMode('login');
                setErrorMessage(null);
              }}
              className={`flex-1 py-3 rounded-lg items-center ${
                mode === 'login' ? 'bg-theme-accent' : 'bg-transparent'
              }`}
            >
              <Text
                className={`font-semibold text-sm ${
                  mode === 'login' ? 'text-white' : 'text-theme-muted'
                }`}
              >
                {t('auth.signIn')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setMode('register');
                setErrorMessage(null);
              }}
              className={`flex-1 py-3 rounded-lg items-center ${
                mode === 'register' ? 'bg-theme-accent' : 'bg-transparent'
              }`}
            >
              <Text
                className={`font-semibold text-sm ${
                  mode === 'register' ? 'text-white' : 'text-theme-muted'
                }`}
              >
                {t('auth.register')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {errorMessage && (
            <View className="bg-red-500/10 rounded-xl p-3 mb-4 flex-row items-center">
              <Ionicons name="alert-circle" size={20} color="#EF4444" className="mr-2" />
              <Text className="text-red-500 text-xs font-medium flex-1 ml-2">{errorMessage}</Text>
            </View>
          )}

          {/* Form Fields */}
          <View className="space-y-4">
            {mode === 'register' && (
              <View className="mb-4">
                <Text className="text-xs font-semibold text-theme-muted mb-2">
                  {t('auth.chooseUsername')}
                </Text>
                <View className="flex-row items-center bg-theme-card rounded-xl px-4 min-h-[56px]">
                  <Ionicons name="person-outline" size={20} color="#8E8E93" />
                  <TextInput
                    placeholder="Athlete Username"
                    placeholderTextColor="#8E8E93"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    style={inputStyle}
                    className="flex-1 ml-3 text-theme-text"
                  />
                </View>
              </View>
            )}

            <View className="mb-4">
              <Text className="text-xs font-semibold text-theme-muted mb-2">
                {t('auth.enterEmail')}
              </Text>
              <View className="flex-row items-center bg-theme-card rounded-xl px-4 min-h-[56px]">
                <Ionicons name="mail-outline" size={20} color="#8E8E93" />
                <TextInput
                  placeholder="athlete@rooka.com"
                  placeholderTextColor="#8E8E93"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={inputStyle}
                  className="flex-1 ml-3 text-theme-text"
                />
              </View>
            </View>

            <View className="mb-6">
              <Text className="text-xs font-semibold text-theme-muted mb-2">
                {t('auth.enterPassword')}
              </Text>
              <View className="flex-row items-center bg-theme-card rounded-xl px-4 min-h-[56px]">
                <Ionicons name="lock-closed-outline" size={20} color="#8E8E93" />
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor="#8E8E93"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={inputStyle}
                  className="flex-1 ml-3 text-theme-text"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#8E8E93"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || storeLoading}
              className="bg-theme-accent rounded-xl py-4 items-center justify-center shadow-md shadow-blue-500/20 active:opacity-90"
            >
              {submitting || storeLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-white text-base font-bold">
                  {mode === 'login' ? t('auth.signIn') : t('auth.register')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

