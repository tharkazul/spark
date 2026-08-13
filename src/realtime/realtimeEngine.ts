import { AppState, AppStateStatus } from 'react-native';
import { wsService, WSConnectionStatus } from '../services/websocket';

export type RealtimeEventType =
  | 'activity_synced'
  | 'strava_sync_complete'
  | 'garmin_sync_complete'
  | 'unread_message'
  | 'sync_complete'
  | 'quest_updated'
  | 'chat_response_ready';

export interface RealtimeEventPayload {
  type: RealtimeEventType | string;
  data?: any;
  timestamp: string;
}

class RealtimeEngine {
  private isInitialized = false;
  private appStateSubscription: any = null;
  private eventListeners: Map<string, Set<(payload: any) => void>> = new Map();

  public init(token?: string) {
    if (this.isInitialized) {
      if (token) wsService.connect(token);
      return;
    }

    this.isInitialized = true;
    wsService.connect(token);

    // React Native AppState listener for auto-reconnection on resume
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  public cleanup() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    wsService.disconnect();
    this.isInitialized = false;
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      console.log('[RealtimeEngine] App returned to foreground; reconnecting realtime socket...');
      wsService.connect();
    } else if (nextAppState === 'background') {
      console.log('[RealtimeEngine] App entered background state.');
    }
  };

  public getStatus(): WSConnectionStatus {
    return wsService.status;
  }

  public subscribe(eventType: RealtimeEventType | string, callback: (data: any) => void) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    const listeners = this.eventListeners.get(eventType)!;
    listeners.add(callback);

    // Subscribe to WS underlying service
    const unsubWs = wsService.subscribeToEvent(eventType, (data) => {
      callback(data);
    });

    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.eventListeners.delete(eventType);
      }
      unsubWs();
    };
  }

  public sendEvent(eventType: string, payload: any) {
    wsService.send({
      type: eventType,
      payload,
      timestamp: new Date().toISOString(),
    });
  }
}

export const realtimeEngine = new RealtimeEngine();
