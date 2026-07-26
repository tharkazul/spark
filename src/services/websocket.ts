import { WS_URL } from '../constants/api';

class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Set<(data: any) => void> = new Set();

  connect() {
    if (this.ws) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('Connected to Spark WebSocket');
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this.listeners.forEach(listener => listener(data));
      } catch (err) {
        console.error('Error parsing WS message', err);
      }
    };

    this.ws.onerror = (e) => {
      console.error('WebSocket Error: ', e.message);
    };

    this.ws.onclose = () => {
      console.log('WebSocket Disconnected. Reconnecting in 3s...');
      this.ws = null;
      setTimeout(() => this.connect(), 3000);
    };
  }

  subscribe(callback: (data: any) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export const wsService = new WebSocketService();
