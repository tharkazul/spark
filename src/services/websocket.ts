import { WS_URL } from '../constants/api';

export type WSConnectionStatus = 'disconnected' | 'connecting' | 'connected';

class WebSocketService {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private reconnectTimer: any = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isManuallyClosed = false;
  private listeners: Set<(data: any) => void> = new Set();
  public status: WSConnectionStatus = 'disconnected';

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
      console.log('[WebSocket] Instantiation notice:', err);
    }
  }

  disconnect() {
    this.isManuallyClosed = true;
    this.reconnectAttempts = 0;
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
    const handler = (data: any) => {
      if (!data) return;
      const type = data.type || data.event;
      if (type === eventType) {
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

