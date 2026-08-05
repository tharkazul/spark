import React, { useState } from 'react';
import { ScrollView, View, Text, Switch, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useTabBar } from '../../context/TabBarContext';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { integrationsApi } from '../../services/apiServices';

WebBrowser.maybeCompleteAuthSession();

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useUser();
  const { syncStrava, syncGarmin, refreshActivities } = useActivities();
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const { notifyScroll } = useTabBar();

  const [garminModalVisible, setGarminModalVisible] = useState(false);
  const [stravaModalVisible, setStravaModalVisible] = useState(false);

  // Garmin Form State
  const [garminUser, setGarminUser] = useState('');
  const [garminPass, setGarminPass] = useState('');
  const [garminLoading, setGarminLoading] = useState(false);

  // Strava Manual Form State
  const [stravaRefreshToken, setStravaRefreshToken] = useState('');
  const [stravaLoading, setStravaLoading] = useState(false);
  const [showManualStrava, setShowManualStrava] = useState(false);

  const username = user?.username || 'Athlete';
  const email = user?.email;
  const isSparkPlus = user?.subscription_tier === 'spark_plus';

  const isGarminConnected = !!user?.garmin_connected;
  const isStravaConnected = !!user?.strava_connected;

  // Garmin handlers
  const handleConnectGarmin = async () => {
    if (!garminUser.trim() || !garminPass.trim()) {
      Alert.alert('Error', 'Please enter both your Garmin username and password.');
      return;
    }
    setGarminLoading(true);
    try {
      const res = await integrationsApi.saveGarminCredentials({
        garminUsername: garminUser.trim(),
        garminPassword: garminPass.trim(),
      });
      await refreshUser();
      setGarminUser('');
      setGarminPass('');
      Alert.alert('Garmin Connected', res.message || 'Garmin credentials saved successfully!');
      setGarminModalVisible(false);
    } catch (err: any) {
      Alert.alert('Garmin Error', err.message || 'Failed to save Garmin credentials.');
    } finally {
      setGarminLoading(false);
    }
  };

  const handleDisconnectGarmin = async () => {
    Alert.alert(
      'Disconnect Garmin',
      'Are you sure you want to disconnect Garmin? This will stop Spark from pushing structured workouts to your watch.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setGarminLoading(true);
            try {
              await integrationsApi.disconnectGarmin();
              await refreshUser();
              Alert.alert('Disconnected', 'Garmin disconnected successfully.');
              setGarminModalVisible(false);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to disconnect Garmin.');
            } finally {
              setGarminLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSyncGarmin = async () => {
    setGarminLoading(true);
    try {
      await syncGarmin();
      Alert.alert('Garmin Sync', 'Garmin sync completed successfully!');
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'Garmin sync failed.');
    } finally {
      setGarminLoading(false);
    }
  };

  // Strava handlers
  const handleConnectStravaOAuth = async () => {
    setStravaLoading(true);
    try {
      const clientId = '208765';
      const redirectUri = 'http://localhost:8081';
      const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=activity:read_all,activity:write&approval_prompt=force`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success' && result.url) {
        const parsed = Linking.parse(result.url);
        const code = (parsed.queryParams?.code as string) || (new URL(result.url).searchParams.get('code') as string);
        if (code) {
          const res = await integrationsApi.exchangeStravaCode(code);
          await refreshUser();
          await refreshActivities();
          Alert.alert('Strava Connected', res.message || 'Strava connected successfully!');
          setStravaModalVisible(false);
        } else {
          Alert.alert('Strava Error', 'No authorization code returned from Strava.');
        }
      }
    } catch (err: any) {
      Alert.alert('Strava Error', err.message || 'Failed to complete Strava OAuth.');
    } finally {
      setStravaLoading(false);
    }
  };

  const handleConnectDefaultStravaToken = async () => {
    setStravaLoading(true);
    try {
      const defaultToken = '760f27089e849721cf66a5a6557a6c66bca3597e';
      const res = await integrationsApi.saveStravaRefreshToken(defaultToken);
      await refreshUser();
      await refreshActivities();
      Alert.alert('Strava Connected', res.message || 'Strava token saved successfully!');
      setStravaModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save Strava token.');
    } finally {
      setStravaLoading(false);
    }
  };

  const handleSaveStravaManualToken = async () => {
    if (!stravaRefreshToken.trim()) {
      Alert.alert('Error', 'Please enter a valid Strava refresh token.');
      return;
    }
    setStravaLoading(true);
    try {
      const res = await integrationsApi.saveStravaRefreshToken(stravaRefreshToken.trim());
      await refreshUser();
      await refreshActivities();
      setStravaRefreshToken('');
      Alert.alert('Strava Connected', res.message || 'Strava token saved successfully!');
      setStravaModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save Strava token.');
    } finally {
      setStravaLoading(false);
    }
  };

  const handleDisconnectStrava = async () => {
    Alert.alert(
      'Disconnect Strava',
      'Are you sure you want to disconnect Strava?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setStravaLoading(true);
            try {
              await integrationsApi.disconnectStrava();
              await refreshUser();
              Alert.alert('Disconnected', 'Strava disconnected successfully.');
              setStravaModalVisible(false);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to disconnect Strava.');
            } finally {
              setStravaLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSyncStrava = async () => {
    setStravaLoading(true);
    try {
      await syncStrava();
      Alert.alert('Strava Sync', 'Strava activities synced successfully!');
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'Strava sync failed.');
    } finally {
      setStravaLoading(false);
    }
  };

  const renderSettingRow = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    value?: React.ReactNode,
    onPress?: () => void
  ) => (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      className="flex-row items-center py-4 border-b border-theme-border"
    >
      <Ionicons name={icon} size={22} color="#8E8E93" className="mr-4" />
      <Text className="text-theme-text text-base flex-1 ml-3">{title}</Text>
      {value}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 100 }}
        onScrollBeginDrag={notifyScroll}
      >
        <View className="items-center my-8">
          <View className="w-24 h-24 rounded-full bg-theme-card border-2 border-theme-accent items-center justify-center mb-4">
            <Ionicons name="person" size={40} color="#8E8E93" />
          </View>
          <Text className="text-theme-text text-2xl font-bold">{username}</Text>
          {email ? <Text className="text-theme-muted text-sm mt-1">{email}</Text> : null}
          <Text className="text-theme-accent mt-1">{isSparkPlus ? 'Spark+ Member' : 'Free Member'}</Text>
        </View>

        <Text className="text-theme-muted font-bold text-xs uppercase tracking-wider mb-2 ml-1">Settings</Text>
        <Card className="p-2 mb-6">
          {renderSettingRow(
            'moon',
            'Dark Mode',
            <Switch
              value={colorScheme === 'dark'}
              onValueChange={toggleColorScheme}
              trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }}
            />
          )}
          {renderSettingRow(
            'notifications',
            'Push Notifications',
            <Switch value={true} trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }} />
          )}
        </Card>

        <Text className="text-theme-muted font-bold text-xs uppercase tracking-wider mb-2 ml-1">Connections</Text>
        <Card className="p-2 mb-6">
          {renderSettingRow(
            'fitness',
            'Strava',
            <View className="flex-row items-center">
              <Text className={isStravaConnected ? 'text-theme-accent font-bold' : 'text-theme-muted font-bold'}>
                {isStravaConnected ? 'Connected' : 'Connect'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#8E8E93" style={{ marginLeft: 6 }} />
            </View>,
            () => setStravaModalVisible(true)
          )}
          {renderSettingRow(
            'watch',
            'Garmin',
            <View className="flex-row items-center">
              <Text className={isGarminConnected ? 'text-theme-accent font-bold' : 'text-theme-muted font-bold'}>
                {isGarminConnected ? 'Connected' : 'Connect'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#8E8E93" style={{ marginLeft: 6 }} />
            </View>,
            () => setGarminModalVisible(true)
          )}
        </Card>

        <TouchableOpacity onPress={logout} className="mt-4 items-center">
          <Text className="text-red-500 font-bold text-base">Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* GARMIN CONNECTION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={garminModalVisible}
        onRequestClose={() => setGarminModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-theme-bg p-6 rounded-t-3xl border-t border-theme-border">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <Ionicons name="watch-outline" size={24} color="#FF5A1F" />
                <Text className="text-xl font-bold text-theme-text ml-2">Garmin Connect</Text>
              </View>
              <TouchableOpacity onPress={() => setGarminModalVisible(false)} className="p-1">
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <Text className="text-sm text-theme-muted mb-6">
              Connect your Garmin account to automatically push structured micro-plan workouts directly to your Garmin watch.
            </Text>

            {isGarminConnected ? (
              <View className="space-y-4 mb-4">
                <View className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex-row items-center mb-2">
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                  <Text className="text-green-500 font-bold ml-2">Garmin is connected</Text>
                </View>

                <TouchableOpacity
                  onPress={handleSyncGarmin}
                  disabled={garminLoading}
                  className="bg-theme-accent py-3.5 rounded-xl items-center flex-row justify-center mb-3"
                >
                  {garminLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="sync" size={18} color="#FFF" />
                      <Text className="text-white font-bold text-base ml-2">Sync Workouts to Garmin</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDisconnectGarmin}
                  disabled={garminLoading}
                  className="border border-red-500/40 bg-red-500/10 py-3.5 rounded-xl items-center"
                >
                  <Text className="text-red-500 font-bold text-base">Disconnect Garmin</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="space-y-4 mb-4">
                <View>
                  <Text className="text-xs font-bold text-theme-muted uppercase mb-1">Garmin Username / Email</Text>
                  <TextInput
                    className="bg-theme-card border border-theme-border rounded-xl p-3.5 text-theme-text"
                    placeholder="email@example.com"
                    placeholderTextColor="#8E8E93"
                    value={garminUser}
                    onChangeText={setGarminUser}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <View className="mt-3">
                  <Text className="text-xs font-bold text-theme-muted uppercase mb-1">Garmin Password</Text>
                  <TextInput
                    className="bg-theme-card border border-theme-border rounded-xl p-3.5 text-theme-text"
                    placeholder="••••••••"
                    placeholderTextColor="#8E8E93"
                    value={garminPass}
                    onChangeText={setGarminPass}
                    secureTextEntry
                  />
                </View>

                <TouchableOpacity
                  onPress={handleConnectGarmin}
                  disabled={garminLoading}
                  className="bg-theme-accent py-4 rounded-xl items-center mt-4"
                >
                  {garminLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text className="text-white font-bold text-base">Save & Connect Garmin</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* STRAVA CONNECTION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={stravaModalVisible}
        onRequestClose={() => setStravaModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-theme-bg p-6 rounded-t-3xl border-t border-theme-border">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <Ionicons name="fitness-outline" size={24} color="#FC4C02" />
                <Text className="text-xl font-bold text-theme-text ml-2">Strava Integration</Text>
              </View>
              <TouchableOpacity onPress={() => setStravaModalVisible(false)} className="p-1">
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <Text className="text-sm text-theme-muted mb-6">
              Connect Strava to automatically sync your completed runs, rides, and swims into Spark to earn points and inform your AI coach.
            </Text>

            {isStravaConnected ? (
              <View className="space-y-4 mb-4">
                <View className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 flex-row items-center mb-2">
                  <Ionicons name="checkmark-circle" size={22} color="#FC4C02" />
                  <Text className="text-orange-500 font-bold ml-2">Strava is connected</Text>
                </View>

                <TouchableOpacity
                  onPress={handleSyncStrava}
                  disabled={stravaLoading}
                  className="bg-[#FC4C02] py-3.5 rounded-xl items-center flex-row justify-center mb-3"
                >
                  {stravaLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="sync" size={18} color="#FFF" />
                      <Text className="text-white font-bold text-base ml-2">Sync Activities Now</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDisconnectStrava}
                  disabled={stravaLoading}
                  className="border border-red-500/40 bg-red-500/10 py-3.5 rounded-xl items-center"
                >
                  <Text className="text-red-500 font-bold text-base">Disconnect Strava</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="space-y-4 mb-4">
                <TouchableOpacity
                  onPress={handleConnectStravaOAuth}
                  disabled={stravaLoading}
                  className="bg-[#FC4C02] py-4 rounded-xl items-center flex-row justify-center mb-2"
                >
                  {stravaLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="fitness-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                      <Text className="text-white font-bold text-base">Connect with Strava (OAuth)</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConnectDefaultStravaToken}
                  disabled={stravaLoading}
                  className="bg-theme-card border border-theme-accent/40 py-3 rounded-xl items-center flex-row justify-center mb-3"
                >
                  <Ionicons name="key-outline" size={18} color="#FF5A1F" style={{ marginRight: 6 }} />
                  <Text className="text-theme-accent font-bold text-sm">Quick Connect (Saved Token)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowManualStrava(!showManualStrava)}
                  className="py-2 items-center"
                >
                  <Text className="text-theme-muted text-xs underline">
                    {showManualStrava ? 'Hide manual refresh token input' : 'Enter Strava Refresh Token manually'}
                  </Text>
                </TouchableOpacity>

                {showManualStrava && (
                  <View className="mt-2 space-y-3">
                    <Text className="text-xs font-bold text-theme-muted uppercase mb-1">Strava Refresh Token</Text>
                    <TextInput
                      className="bg-theme-card border border-theme-border rounded-xl p-3.5 text-theme-text"
                      placeholder="Paste refresh token..."
                      placeholderTextColor="#8E8E93"
                      value={stravaRefreshToken}
                      onChangeText={setStravaRefreshToken}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={handleSaveStravaManualToken}
                      disabled={stravaLoading}
                      className="bg-theme-card border border-theme-border py-3 rounded-xl items-center mt-2"
                    >
                      {stravaLoading ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text className="text-theme-text font-bold text-sm">Save Refresh Token</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
