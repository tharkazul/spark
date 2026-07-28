import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChatMessage } from '../types/chat';
import { chatApi } from '../services/apiServices';
import { wsService } from '../services/websocket';

interface CoachChatContextType {
  messages: ChatMessage[];
  sending: boolean;
  loading: boolean;
  error: string | null;
  refreshMessages: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  checkin: () => Promise<void>;
}

const defaultMessages: ChatMessage[] = [
  { id: '1', content: "Hey Rutger! Ready to smash this week's training?", role: 'coach', timestamp: new Date().toISOString() },
  { id: '2', content: "Yes, I'm feeling great after yesterday's run.", role: 'user', timestamp: new Date().toISOString() },
  { id: '3', content: "Awesome. Your readiness is high today. I recommend a 45min threshold session.", role: 'coach', timestamp: new Date().toISOString() },
];

const CoachChatContext = createContext<CoachChatContextType | undefined>(undefined);

export const CoachChatStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(defaultMessages);
  const [sending, setSending] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMessages = async () => {
    setLoading(true);
    try {
      const history = await chatApi.getHistory();
      if (history && Array.isArray(history) && history.length > 0) {
        setMessages(history);
      }
      setError(null);
    } catch (err: any) {
      console.log('CoachChatStore fetch info:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      content: text,
      role: 'user',
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await chatApi.sendMessage(text);
      if (res && res.reply) {
        const coachMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          content: res.reply,
          role: 'coach',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, coachMsg]);
      }
    } catch (err: any) {
      console.error('Send message error:', err);
    } finally {
      setSending(false);
    }
  };

  const checkin = async () => {
    try {
      const res = await chatApi.checkin();
      if (res && res.message) {
        const coachMsg: ChatMessage = {
          id: Date.now().toString(),
          content: res.message,
          role: 'coach',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, coachMsg]);
      }
    } catch (err: any) {
      console.error('Checkin error:', err);
    }
  };

  useEffect(() => {
    refreshMessages();

    const unsubCoachResponse = wsService.subscribeToEvent('coach_response', (data: any) => {
      const content = typeof data === 'string' ? data : data.content || data.reply || data.message;
      if (content) {
        setMessages((prev) => [
          ...prev,
          {
            id: (data.id || Date.now()).toString(),
            content,
            role: 'coach',
            timestamp: data.timestamp || new Date().toISOString(),
          },
        ]);
      }
    });

    const unsubChatMessage = wsService.subscribeToEvent('chat_message', (data: any) => {
      if (data && data.content && data.role) {
        setMessages((prev) => [
          ...prev,
          {
            id: (data.id || Date.now()).toString(),
            content: data.content,
            role: data.role === 'user' ? 'user' : 'coach',
            timestamp: data.timestamp || new Date().toISOString(),
          },
        ]);
      }
    });

    const unsubStreamChunk = wsService.subscribeToEvent('chat_stream_chunk', (data: any) => {
      const chunk = typeof data === 'string' ? data : data.chunk || data.text || '';
      if (!chunk) return;

      const messageId = data.messageId || 'streaming_coach_msg';

      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'coach' && (String(lastMsg.id) === String(messageId) || String(lastMsg.id).startsWith('streaming_'))) {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMsg,
              content: lastMsg.content + chunk,
            },
          ];
        } else {
          return [
            ...prev,
            {
              id: messageId,
              content: chunk,
              role: 'coach',
              timestamp: new Date().toISOString(),
            },
          ];
        }
      });
    });

    return () => {
      unsubCoachResponse();
      unsubChatMessage();
      unsubStreamChunk();
    };
  }, []);

  return (
    <CoachChatContext.Provider
      value={{
        messages,
        sending,
        loading,
        error,
        refreshMessages,
        sendMessage,
        checkin,
      }}
    >
      {children}
    </CoachChatContext.Provider>
  );
};

export const useCoachChat = (): CoachChatContextType => {
  const context = useContext(CoachChatContext);
  if (!context) {
    throw new Error('useCoachChat must be used within a CoachChatStore');
  }
  return context;
};
