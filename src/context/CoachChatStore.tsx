import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ChatMessage, TokenUsage, ProposedWorkoutItem } from '../types/chat';
import { chatApi, planApi } from '../services/apiServices';
import { chatStorage, chatReadStorage } from '../services/storage';
import { wsService } from '../services/websocket';
import { usePlan } from './PlanStore';
import { useUser } from './UserStore';
import { usePhysique } from './PhysiqueStore';

interface CoachChatContextType {
  messages: ChatMessage[];
  sending: boolean;
  loading: boolean;
  error: string | null;
  tokenUsage: TokenUsage | null;
  unreadCount: number;
  markAsRead: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  sendMessage: (text: string, imagesBase64?: string[]) => Promise<void>;
  clearHistory: () => Promise<void>;
  acceptProposal: (messageId: string | number, plan: ProposedWorkoutItem[]) => Promise<void>;
  rejectProposal: (messageId: string | number) => void;
  acceptInvite: (inviteId: string) => Promise<void>;
  declineInvite: (inviteId: string) => Promise<void>;
  checkin: () => Promise<void>;
}

const defaultWelcomeMessage: ChatMessage = {
  id: 'welcome-msg',
  content: "Welcome to Rooka! ⚡️ I'm your AI endurance coach. I've locked in your profile, goals, and training availability. Let's make a plan together—what would you like to focus on first?",
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

const parsePayloadJson = (msg: ChatMessage): any | undefined => {
  if (msg.payload_json) {
    if (typeof msg.payload_json === 'object') return msg.payload_json;
    try {
      return JSON.parse(msg.payload_json);
    } catch (e) {
      return undefined;
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
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);

  const { refreshPlan } = usePlan();
  const { refreshPhysique } = usePhysique();
  const { user, isAuthenticated } = useUser();

  // Load last read timestamp from persistent storage
  useEffect(() => {
    chatReadStorage.getLastReadTimestamp().then((ts) => {
      setLastReadTimestamp(ts || 0);
    });
  }, []);

  // Compute unread count whenever messages or lastReadTimestamp change
  useEffect(() => {
    if (!messages || messages.length === 0) {
      setUnreadCount(0);
      return;
    }
    const unread = messages.filter((m) => {
      if (m.role !== 'coach' && m.role !== 'assistant') return false;
      const msgTime = new Date(m.timestamp || 0).getTime();
      return msgTime > lastReadTimestamp;
    }).length;
    setUnreadCount(unread);
  }, [messages, lastReadTimestamp]);

  const markAsRead = useCallback(async () => {
    const now = Date.now();
    setLastReadTimestamp(now);
    setUnreadCount(0);
    await chatReadStorage.setLastReadTimestamp(now);
  }, []);

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
    const payload = parsePayloadJson(msg);
    return {
      ...msg,
      images: msg.images || images,
      proposedPlan: msg.proposedPlan || proposedPlan,
      proposalStatus: msg.proposalStatus || (proposedPlan ? 'pending' : undefined),
      payload_json: msg.payload_json || payload,
    };
  };

  const refreshMessages = async () => {
    // 1. Immediately load local cached messages from storage so history is remembered on reboot
    try {
      const local = await chatStorage.getChatHistory();
      if (local && Array.isArray(local) && local.length > 0) {
        setMessagesState(local.map(processMessageItem));
      }
    } catch (_) {}

    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const response = await chatApi.getHistory();
      if (response) {
        if (Array.isArray(response) && response.length > 0) {
          const processed = response.map(processMessageItem);
          setMessages(processed);
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

  const streamCoachMessage = (fullMessage: ChatMessage): Promise<void> => {
    const fullText = fullMessage.content || '';
    if (!fullText) {
      setMessages((prev) => [...prev, fullMessage]);
      setSending(false);
      return Promise.resolve();
    }

    // Break text into words/tokens with trailing spaces
    const tokens: string[] = fullText.match(/\S+\s*/g) || [fullText];
    
    // Group into phrase chunks of 1 to 3 words, breaking naturally on punctuation
    const chunks: string[] = [];
    let currentChunk = '';
    let wordsInChunk = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      currentChunk += token;
      wordsInChunk++;

      const isPunctuationBreak = /[.,!?:;\n]/.test(token);
      if (wordsInChunk >= 2 || isPunctuationBreak || i === tokens.length - 1) {
        chunks.push(currentChunk);
        currentChunk = '';
        wordsInChunk = 0;
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return new Promise<void>((resolve) => {
      let revealedText = chunks[0] || '';
      const initialMsg: ChatMessage = {
        ...fullMessage,
        content: revealedText,
        isStreaming: true,
      };

      setMessages((prev) => [...prev, initialMsg]);
      setSending(false);

      let chunkIdx = 1;

      const step = () => {
        if (chunkIdx >= chunks.length) {
          setMessages((prev) =>
            prev.map((m) =>
              (m.id === fullMessage.id || m.clientId === fullMessage.clientId)
                ? { ...fullMessage, isStreaming: false }
                : m
            )
          );
          resolve();
          return;
        }

        const nextChunk = chunks[chunkIdx];
        revealedText += nextChunk;
        chunkIdx++;

        setMessages((prev) =>
          prev.map((m) =>
            (m.id === fullMessage.id || m.clientId === fullMessage.clientId)
              ? { ...m, content: revealedText, isStreaming: true }
              : m
          )
        );

        // Readable speed: brief pause on punctuation, fast flow between words
        const hasPunctuation = /[.,!?:;\n]/.test(nextChunk);
        const delay = hasPunctuation ? 50 : 30;

        setTimeout(step, delay);
      };

      if (chunks.length > 1) {
        setTimeout(step, 30);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            (m.id === fullMessage.id || m.clientId === fullMessage.clientId)
              ? { ...fullMessage, isStreaming: false }
              : m
          )
        );
        resolve();
      }
    });
  };

  const sendMessage = async (text: string, imagesBase64?: string[]) => {
    if (!text.trim() && (!imagesBase64 || imagesBase64.length === 0)) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      clientId: `c-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
          clientId: `c-coach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          content: res.reply,
          role: 'coach',
          mood: res.mood || 'default',
          timestamp: new Date().toISOString(),
        });

        if (res.tokenUsage) {
          setTokenUsage(res.tokenUsage);
        }
        if (res.planUpdated) {
          refreshPlan();
        }
        refreshPhysique();

        await streamCoachMessage(coachMsg);
      } else {
        setSending(false);
      }
    } catch (err: any) {
      console.error('Send message error:', err);
      setError(null);
      const fallbackCoachMsg: ChatMessage = processMessageItem({
        id: `coach-fallback-${Date.now()}`,
        clientId: `c-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        content: `I got your message! I'm processing your workout data right now. Feel free to ask me anything else about your training or recovery! 🚀`,
        role: 'coach',
        timestamp: new Date().toISOString(),
      });
      await streamCoachMessage(fallbackCoachMsg);
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

  const acceptInvite = async (inviteId: string) => {
    try {
      setMessages((prev) =>
        prev.map((msg) => {
          const payload = msg.payload_json as any;
          if (payload && (String(payload.invite_id) === String(inviteId) || String(payload.id) === String(inviteId))) {
            return {
              ...msg,
              payload_json: { ...payload, status: 'accepted' },
            };
          }
          return msg;
        })
      );
    } catch (e) {
      console.error('Failed to accept invite:', e);
    }
  };

  const declineInvite = async (inviteId: string) => {
    try {
      setMessages((prev) =>
        prev.map((msg) => {
          const payload = msg.payload_json as any;
          if (payload && (String(payload.invite_id) === String(inviteId) || String(payload.id) === String(inviteId))) {
            return {
              ...msg,
              payload_json: { ...payload, status: 'declined' },
            };
          }
          return msg;
        })
      );
    } catch (e) {
      console.error('Failed to decline invite:', e);
    }
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
    if (user) {
      setTokenUsage((prev) => ({
        daily_token_usage: prev?.daily_token_usage ?? user.daily_token_usage ?? (user as any).dailyTokenUsage ?? 0,
        daily_token_limit: prev?.daily_token_limit ?? user.daily_token_limit ?? (user as any).dailyTokenLimit ?? (user.subscription_tier === 'admin' ? 500000 : user.subscription_tier === 'rooka_plus' ? 50000 : 5000),
        subscription_tier: user.subscription_tier || 'free',
      }));
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
  }, [isAuthenticated]);

  return (
    <CoachChatContext.Provider
      value={{
        messages,
        sending,
        loading,
        error,
        tokenUsage,
        unreadCount,
        markAsRead,
        refreshMessages,
        sendMessage,
        clearHistory,
        acceptProposal,
        rejectProposal,
        acceptInvite,
        declineInvite,
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

export const useCoachChatStore = useCoachChat;

