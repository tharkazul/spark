import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChatMessage, TokenUsage, ProposedWorkoutItem } from '../types/chat';
import { chatApi, planApi } from '../services/apiServices';
import { chatStorage } from '../services/storage';
import { wsService } from '../services/websocket';
import { usePlan } from './PlanStore';
import { useUser } from './UserStore';

interface CoachChatContextType {
  messages: ChatMessage[];
  sending: boolean;
  loading: boolean;
  error: string | null;
  tokenUsage: TokenUsage | null;
  refreshMessages: () => Promise<void>;
  sendMessage: (text: string, imagesBase64?: string[]) => Promise<void>;
  clearHistory: () => Promise<void>;
  acceptProposal: (messageId: string | number, plan: ProposedWorkoutItem[]) => Promise<void>;
  rejectProposal: (messageId: string | number) => void;
  checkin: () => Promise<void>;
}

const defaultWelcomeMessage: ChatMessage = {
  id: 'welcome-msg',
  content: "Hi, I'm Spark! Your 21km long run yesterday showed great cardiac drift control. How are your legs feeling today?",
  role: 'coach',
  timestamp: new Date().toISOString(),
  mood: 'default',
};

const parseWorkoutProposals = (content: string): ProposedWorkoutItem[] | undefined => {
  if (!content) return undefined;
  const jsonMatch = content.match(/```json\n?([\s\S]*?)```/i);
  if (jsonMatch && jsonMatch[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].date && parsed[0].sport) {
        return parsed as ProposedWorkoutItem[];
      }
    } catch (e) {
      // ignore JSON parse error
    }
  }
  return undefined;
};

const CoachChatContext = createContext<CoachChatContextType | undefined>(undefined);

export const CoachChatStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessagesState] = useState<ChatMessage[]>([defaultWelcomeMessage]);
  const [sending, setSending] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>({
    daily_token_usage: 1200,
    daily_token_limit: 100000,
    subscription_tier: 'free',
  });

  const { refreshPlan } = usePlan();
  const { user } = useUser();

  const setMessages = (action: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessagesState((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      chatStorage.setChatHistory(next);
      return next;
    });
  };

  const processMessageItem = (msg: ChatMessage): ChatMessage => {
    let images: string[] = [];
    if ((msg as any).image_path) {
      try {
        const parsed = JSON.parse((msg as any).image_path);
        if (Array.isArray(parsed)) images = parsed;
      } catch (_) {
        if (typeof (msg as any).image_path === 'string') {
          images = [(msg as any).image_path];
        }
      }
    }
    const proposedPlan = parseWorkoutProposals(msg.content);
    return {
      ...msg,
      images: msg.images || images,
      proposedPlan: msg.proposedPlan || proposedPlan,
      proposalStatus: msg.proposalStatus || (proposedPlan ? 'pending' : undefined),
    };
  };

  const refreshMessages = async () => {
    setLoading(true);
    try {
      const local = await chatStorage.getChatHistory();
      if (local && Array.isArray(local) && local.length > 0) {
        setMessagesState(local.map(processMessageItem));
      }

      const response = await chatApi.getHistory();
      if (response) {
        if (Array.isArray(response)) {
          if (response.length > 0) {
            const processed = response.map(processMessageItem);
            setMessages(processed);
          }
        } else if ('history' in response && response.history && Array.isArray(response.history) && response.history.length > 0) {
          const processed = response.history.map(processMessageItem);
          setMessages(processed);
          if (response.tokenUsage) {
            setTokenUsage(response.tokenUsage);
          }
        }
      }
      setError(null);
    } catch (err: any) {
      console.log('CoachChatStore fetch info:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (text: string, imagesBase64?: string[]) => {
    if (!text.trim() && (!imagesBase64 || imagesBase64.length === 0)) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      content: text,
      role: 'user',
      timestamp: new Date().toISOString(),
      images: imagesBase64,
    };

    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await chatApi.sendMessage(text, imagesBase64);
      if (res && res.reply) {
        const coachMsg: ChatMessage = processMessageItem({
          id: `coach-${Date.now()}`,
          content: res.reply,
          role: 'coach',
          mood: res.mood || 'default',
          timestamp: new Date().toISOString(),
        });
        setMessages((prev) => [...prev, coachMsg]);
        if (res.tokenUsage) {
          setTokenUsage(res.tokenUsage);
        }
        if (res.planUpdated) {
          refreshPlan();
        }
      }
    } catch (err: any) {
      console.error('Send message error:', err);
      setError(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    try {
      await chatApi.clearHistory();
      await chatStorage.clearChatHistory();
    } catch (e) {
      console.log('Clear history server call fallback:', e);
    }
    setMessages([defaultWelcomeMessage]);
  };

  const acceptProposal = async (messageId: string | number, plan: ProposedWorkoutItem[]) => {
    try {
      await planApi.acceptSuggestion(plan);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, proposalStatus: 'accepted' } : msg
        )
      );

      const confirmMsg: ChatMessage = {
        id: `user-accept-${Date.now()}`,
        content: `Accepted proposed plan changes!`,
        role: 'user',
        timestamp: new Date().toISOString(),
      };
      const ackMsg: ChatMessage = {
        id: `coach-ack-${Date.now()}`,
        content: `Awesome! I've updated your schedule. Let's make it count! 🚀`,
        role: 'coach',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, confirmMsg, ackMsg]);
      await refreshPlan();
    } catch (err) {
      console.error('Failed to accept proposal:', err);
    }
  };

  const rejectProposal = (messageId: string | number) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, proposalStatus: 'rejected' } : msg
      )
    );
  };

  const checkin = async () => {
    try {
      const res = await chatApi.checkin();
      if (res && res.message) {
        const coachMsg: ChatMessage = processMessageItem({
          id: `coach-checkin-${Date.now()}`,
          content: res.message,
          role: 'coach',
          timestamp: new Date().toISOString(),
        });
        setMessages((prev) => [...prev, coachMsg]);
      }
    } catch (err: any) {
      console.error('Checkin error:', err);
    }
  };

  useEffect(() => {
    if (user?.subscription_tier) {
      setTokenUsage((prev) => (prev ? { ...prev, subscription_tier: user.subscription_tier } : null));
    }
  }, [user]);

  useEffect(() => {
    refreshMessages();

    const unsubCoachResponse = wsService.subscribeToEvent('coach_response', (data: any) => {
      const content = typeof data === 'string' ? data : data.content || data.reply || data.message;
      if (content) {
        const coachMsg = processMessageItem({
          id: (data.id || Date.now()).toString(),
          content,
          role: 'coach',
          timestamp: data.timestamp || new Date().toISOString(),
        });
        setMessages((prev) => [...prev, coachMsg]);
      }
    });

    const unsubChatMessage = wsService.subscribeToEvent('chat_message', (data: any) => {
      if (data && data.content && data.role) {
        const item = processMessageItem({
          id: (data.id || Date.now()).toString(),
          content: data.content,
          role: data.role === 'user' ? 'user' : 'coach',
          timestamp: data.timestamp || new Date().toISOString(),
        });
        setMessages((prev) => [...prev, item]);
      }
    });

    const unsubStreamChunk = wsService.subscribeToEvent('chat_stream_chunk', (data: any) => {
      const chunk = typeof data === 'string' ? data : data.chunk || data.text || '';
      if (!chunk) return;

      const messageId = data.messageId || 'streaming_coach_msg';

      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (
          lastMsg &&
          lastMsg.role === 'coach' &&
          (String(lastMsg.id) === String(messageId) || String(lastMsg.id).startsWith('streaming_'))
        ) {
          const updatedContent = lastMsg.content + chunk;
          return [
            ...prev.slice(0, -1),
            processMessageItem({
              ...lastMsg,
              content: updatedContent,
            }),
          ];
        } else {
          return [
            ...prev,
            processMessageItem({
              id: messageId,
              content: chunk,
              role: 'coach',
              timestamp: new Date().toISOString(),
            }),
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
        tokenUsage,
        refreshMessages,
        sendMessage,
        clearHistory,
        acceptProposal,
        rejectProposal,
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
