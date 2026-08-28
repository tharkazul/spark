import { WS_URL } from '../constants/api';

/**
 * The server and the client grew two different vocabularies for the same
 * events, so most of the realtime layer was silently inert: of the names the
 * client subscribed to, only `quest_updated` and `title_unlocked` were ever
 * emitted.
 *
 * Rather than rename events across both codebases at once (the server is
 * deployed separately and lags the app), a subscription accepts any wire name
 * that means the same thing. Keys are what callers subscribe to; values are the
 * names actually seen on the wire.
 *
 * Server-side emitters live in `server/services/sse.js` callers — keep this
 * table in step with them.
 */
const EVENT_ALIASES: Record<string, string[]> = {
  // Activity ingestion. The server says `activity_logged` for a manual/chat log
  // and `sync_complete` at the end of a Strava/Garmin pull.
  activity_synced: ['activity_synced', 'activity_logged', 'sync_complete'],
  strava_sync_complete: ['strava_sync_complete', 'sync_complete'],
  garmin_sync_complete: ['garmin_sync_complete', 'sync_complete'],

  // Coach chat. Everything the coach pushes (including the 08:00 message)
  // arrives as `unread_message`.
  chat_message: ['chat_message', 'unread_message', 'chat_update'],
  coach_response: ['coach_response', 'unread_message'],

  // Gamification.
  rooka_updated: ['rooka_updated', 'points_updated'],
  level_up: ['level_up', 'level_updated'],
  quest_completed: ['quest_completed', 'quest_updated'],
};

export type WSConnectionStatus = 'disconnected' | 'connecting' | 'connected';

class WebSocketService {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isManuallyClosed = false;
  private listeners: Set<(data: any) => void> = new Set();
  public status: WSConnectionStatus = 'disconnected';

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 20000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  connect(token?: string) {
    if (token) {
      this.token = token;
    }

    if (this.token === 'offline_dev_token') {
      console.log('[WebSocket] Running in offline dev mode; skipping WebSocket connection.');
      this.status = 'disconnected';
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isManuallyClosed = false;
    this.status = 'connecting';

    const url = this.token
      ? `${WS_URL}${WS_URL.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.token)}`
      : WS_URL;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.status = 'connected';
        this.reconnectAttempts = 0;
        console.log('Connected to Rooka WebSocket');
        this.startHeartbeat();
        if (this.token) {
          this.send({ type: 'auth', token: this.token });
        }
      };

      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          this.listeners.forEach((listener) => listener(data));
        } catch (err) {
          console.log('Error parsing WS message', err);
        }
      };

      this.ws.onerror = (e: any) => {
        // Log notice cleanly without throwing console.error to avoid Expo LogBox RedBox popups when server is offline
        console.log('[WebSocket] Connection notice:', e?.message || 'Server unreachable');
      };

      this.ws.onclose = () => {
        this.status = 'disconnected';
        this.stopHeartbeat();
        this.ws = null;
        console.log('WebSocket Disconnected.');

        if (!this.isManuallyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts - 1), 15000);
          console.log(`Reconnecting WebSocket attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay / 1000)}s...`);
          this.reconnectTimer = setTimeout(() => this.connect(), delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.log('[WebSocket] Reached maximum reconnect attempts. Will retry on next app state change or login.');
        }
      };
    } catch (err) {
      this.status = 'disconnected';
      this.stopHeartbeat();
      console.log('[WebSocket] Instantiation notice:', err);
    }
  }

  disconnect() {
    this.isManuallyClosed = true;
    this.reconnectAttempts = 0;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.status = 'disconnected';
    console.log('WebSocket connection closed by user action.');
  }

  subscribe(callback: (data: any) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  subscribeToEvent(eventType: string, callback: (data: any) => void) {
    const accepted = EVENT_ALIASES[eventType] ?? [eventType];
    const handler = (data: any) => {
      if (!data) return;
      const type = data.type || data.event;
      if (accepted.includes(type)) {
        callback(data.payload !== undefined ? data.payload : data.data !== undefined ? data.data : data);
      }
    };
    return this.subscribe(handler);
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export const wsService = new WebSocketService();

