import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { notificationsApi } from './apiServices';
import { router } from 'expo-router';

// Configure foreground notification presentation behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  // Set up Android channel if applicable
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Rooka Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF5F3B',
      sound: 'default',
    });
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permissions not granted.');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      'eb8027ec-2138-4891-a3a4-684be50bfbdb';

    const pushTokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = pushTokenData?.data;
    if (token) {
      // Register token on Rooka backend
      await notificationsApi.registerToken(token, Platform.OS);
      return token;
    }
  } catch (error) {
    console.log('Failed to register for push notifications:', error);
  }

  return null;
}

export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (onNotificationResponse) {
      onNotificationResponse(response);
    } else {
      // Default navigation behavior
      const data = response.notification.request.content.data;
      if (data?.url) {
        try {
          router.push(data.url as any);
        } catch (_) {}
      } else if (data?.type === 'coach' || data?.type === 'message') {
        router.push('/(tabs)/coach');
      } else if (data?.type === 'social' || data?.type === 'connection' || data?.type === 'kudos') {
        router.push('/(tabs)/social');
      }
    }
  });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}
