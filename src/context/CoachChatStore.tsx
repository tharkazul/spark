import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { ChatMessage, TokenUsage, ProposedWorkoutItem } from '../types/chat';
import { chatApi, planApi, socialApi } from '../services/apiServices';
import { chatStorage, chatReadStorage } from '../services/storage';
import { wsService } from '../services/websocket';
import { usePlan } from './PlanStore';
import { useUser } from './UserStore';
import { useActivities } from './ActivityStore';
import { usePhysique } from './PhysiqueStore';
import { useHealth } from './HealthStore';
import { setBadgeCountAsync, clearBadgeCountAsync } from '../services/notificationService';

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
  resendMessage: (messageId: string | number) => Promise<void>;
  clearHistory: () => Promise<void>;
  acceptProposal: (messageId: string | number, plan: ProposedWorkoutItem[]) => Promise<void>;
  rejectProposal: (messageId: string | number) => void;
  acceptInvite: (inviteId: string) => Promise<void>;
  declineInvite: (inviteId: string) => Promise<void>;
  acceptConnection: (friendId: number | string) => Promise<void>;
  declineConnection: (friendId: number | string) => Promise<void>;
  checkin: () => Promise<void>;
}

const defaultWelcomeMessage: ChatMessage = {
  id: 'welcome-msg',
  content: `Welcome to your personalized endurance journey! ⚡️ I'm your AI endurance coach.

🎯 **Your First Step: Baseline Assessment Test**
Before we dial in high-load workouts, we need to calibrate your baseline fitness. Your initial benchmark test is scheduled in your plan to calculate your exact heart rate, power, and pace training zones.

📅 **First Week Overview**:
- **Days 1–2**: 🏁 **Baseline Assessment Workout** (record your max sustained effort)
- **Following Days**: Active recovery, controlled Zone 2 aerobic base building, and foundational training.

🧭 **Next Steps**:
1. Check your **Today** / **Plan** tab to view your scheduled benchmark workout and its specific intervals.
2. Connect your heart rate monitor or smartwatch before starting.
3. Complete the assessment effort so I can analyze your metrics and calculate your training zones!`,
  role: 'coach',
  timestamp: '2024-01-01T00:00:00.000Z',
  mood: 'motivated',
};

const splitCoachReply = (text?: string): string[] => {
  if (!text) return [];
  const parts = text
    .split(/(?:\r?\n)?(?:---(?:MSG|SPLIT|BREAK)---|\[\[SPLIT\]\]|<break\s*\/?>|<br\s*\/?>)(?:\r?\n)?/gi)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [text.trim()];
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

const parseConnectionRequestFromContent = (content?: string): any | undefined => {
  if (!content) return undefined;
  const match = content.match(/(.+?)\s+wants to connect with you on rooka!/i);
  if (match && match[1]) {
    return {
      type: 'connection_request',
      username: match[1].trim(),
      status: 'pending',
    };
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
  return parseConnectionRequestFromContent(msg.content);
};

const CoachChatContext = createContext<CoachChatContextType | undefined>(undefined);

export const CoachChatStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessagesState] = useState<ChatMessage[]>([defaultWelcomeMessage]);
  const [sending, setSending] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(0);
  const [isReadInitialized, setIsReadInitialized] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);

  const { refreshPlan } = usePlan();
  const { refreshPhysique } = usePhysique();
  const { refreshNiggles } = useHealth();
  const { refreshActivities } = useActivities();
  const { user, isAuthenticated, refreshUser } = useUser();

  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Synchronize chat messages and unread state when the app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isAuthenticated && user?.id) {
        refreshMessages();
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, user?.id]);

  // Load last read timestamp and chat history when user changes or signs out
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setMessagesState([defaultWelcomeMessage]);
      messagesRef.current = [defaultWelcomeMessage];
      setLastReadTimestamp(0);
      setIsReadInitialized(false);
      setUnreadCount(0);
      setTokenUsage(null);
      setError(null);
      clearBadgeCountAsync();
      return;
    }

    // A valid user is logged in
    setMessagesState([defaultWelcomeMessage]);
    messagesRef.current = [defaultWelcomeMessage];
    setIsReadInitialized(false);

    chatReadStorage.getLastReadTimestamp(user.id).then((savedTs) => {
      if (!savedTs || savedTs === 0) {
        // First run on this device: seed baseline timestamp to now so historical
        // messages don't suddenly trigger ghost unread badges
        const seedTs = Date.now();
        chatReadStorage.setLastReadTimestamp(seedTs, user.id);
        setLastReadTimestamp(seedTs);
      } else {
        setLastReadTimestamp(savedTs);
      }
      setIsReadInitialized(true);
    });

    chatStorage.getChatHistory(user.id).then((local) => {
      if (local && Array.isArray(local) && local.length > 0) {
        setMessagesState(local.map(processMessageItem));
      }
    });
    refreshMessages();
  }, [user?.id, isAuthenticated]);

  // Compute unread count whenever messages or lastReadTimestamp change (once initialized)
  useEffect(() => {
    if (!isReadInitialized) {
      return;
    }
    if (!messages || messages.length === 0) {
      setUnreadCount(0);
      clearBadgeCountAsync();
      return;
    }
    const unread = messages.filter((m) => {
      if (m.id === 'welcome-msg') return false;
      if (m.role !== 'coach' && m.role !== 'assistant') return false;
      const msgTime = new Date(m.timestamp || 0).getTime();
      return !isNaN(msgTime) && msgTime > lastReadTimestamp;
    }).length;

    setUnreadCount(unread);
    if (unread === 0) {
      clearBadgeCountAsync();
    } else {
      setBadgeCountAsync(unread);
    }
  }, [messages, lastReadTimestamp, isReadInitialized]);

  const markAsRead = useCallback(async () => {
    let maxMsgTime = 0;
    for (const m of messagesRef.current) {
      if (m.id === 'welcome-msg') continue;
      const t = new Date(m.timestamp || 0).getTime();
      if (!isNaN(t) && t > maxMsgTime) maxMsgTime = t;
    }
    const now = Math.max(Date.now(), maxMsgTime + 1000);
    setLastReadTimestamp((prev) => (now > prev ? now : prev));
    setUnreadCount(0);
    await chatReadStorage.setLastReadTimestamp(now, user?.id);
    await clearBadgeCountAsync();
  }, [user?.id]);

  const setMessages = useCallback((action: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessagesState((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (user?.id) {
        chatStorage.setChatHistory(next, user.id);
      }
      return next;
    });
  }, [user?.id]);

  const processMessageItem = useCallback((msg: ChatMessage): ChatMessage => {
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
    
    // Ensure SQLite timestamp is parsed as UTC
    let safeTimestamp = msg.timestamp || new Date().toISOString();
    if (safeTimestamp && typeof safeTimestamp === 'string' && !safeTimestamp.includes('Z') && !safeTimestamp.includes('T')) {
      safeTimestamp = safeTimestamp.replace(' ', 'T') + 'Z';
    }

    return {
      ...msg,
      timestamp: safeTimestamp,
      images: msg.images || images,
      proposedPlan: msg.proposedPlan || proposedPlan,
      proposalStatus: msg.proposalStatus || (proposedPlan ? 'pending' : undefined),
      payload_json: payload || (typeof msg.payload_json === 'object' ? msg.payload_json : undefined),
    };
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;
    setLoading(true);
    try {
      const response = await chatApi.getHistory();
      if (response) {
        if (Array.isArray(response) && response.length > 0) {
          const processed: ChatMessage[] = [];
          response.forEach((m) => {
            const parts = splitCoachReply(m.content);
            if (parts.length > 1 && (m.role === 'coach' || m.role === 'assistant')) {
              parts.forEach((part, idx) => {
                processed.push(
                  processMessageItem({
                    ...m,
                    id: `${m.id}-${idx}`,
                    content: part,
                    timestamp: m.timestamp || (m as any).created_at || new Date().toISOString(),
                  })
                );
              });
            } else {
              processed.push(
                processMessageItem({
                  ...m,
                  id: m.id?.toString(),
                  timestamp: m.timestamp || (m as any).created_at || new Date().toISOString(),
                })
              );
            }
          });
          setMessages(processed);
        } else if ('history' in response && response.history && Array.isArray(response.history) && response.history.length > 0) {
          const processed: ChatMessage[] = [];
          response.history.forEach((m) => {
            const parts = splitCoachReply(m.content);
            if (parts.length > 1 && (m.role === 'coach' || m.role === 'assistant')) {
              parts.forEach((part, idx) => {
                processed.push(
                  processMessageItem({
                    ...m,
                    id: `${m.id}-${idx}`,
                    content: part,
                    timestamp: m.timestamp || (m as any).created_at || new Date().toISOString(),
                  })
                );
              });
            } else {
              processed.push(
                processMessageItem({
                  ...m,
                  id: m.id?.toString(),
                  timestamp: m.timestamp || (m as any).created_at || new Date().toISOString(),
                })
              );
            }
          });
          setMessages(processed);
          if (response.tokenUsage) {
            setTokenUsage(response.tokenUsage);
          }
        } else {
          setMessagesState([defaultWelcomeMessage]);
        }
      }
      setError(null);
    } catch (err: any) {
      console.log('CoachChatStore fetch info:', err.message || err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id, processMessageItem, setMessages]);

  const streamCoachMessage = (fullMessage: ChatMessage): Promise<void> => {
    const fullText = fullMessage.content || '';
    if (!fullText || fullText.length < 50) {
      setMessages((prev) => [...prev, fullMessage]);
      setSending(false);
      return Promise.resolve();
    }

    // Determine 6-10 progressive slices of fullText to animate smoothly without Hermes GC churn
    const totalSteps = Math.min(10, Math.max(4, Math.floor(fullText.length / 50)));
    const stepLength = Math.ceil(fullText.length / totalSteps);
    
    const slices: string[] = [];
    for (let i = 1; i <= totalSteps; i++) {
      if (i === totalSteps) {
        slices.push(fullText);
      } else {
        const cut = Math.min(fullText.length, i * stepLength);
        const spaceIdx = fullText.indexOf(' ', cut);
        const actualCut = spaceIdx !== -1 && spaceIdx - cut < 25 ? spaceIdx : cut;
        slices.push(fullText.substring(0, actualCut));
      }
    }

    return new Promise<void>((resolve) => {
      const initialMsg: ChatMessage = {
        ...fullMessage,
        content: slices[0] || fullText,
        isStreaming: true,
      };

      // Set initial stream item in memory
      setMessagesState((prev) => [...prev, initialMsg]);
      setSending(false);

      let stepIdx = 1;

      const step = () => {
        if (stepIdx >= slices.length) {
          // Final state: persist to storage ONCE
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && (last.id === fullMessage.id || last.clientId === fullMessage.clientId)) {
              return [...prev.slice(0, -1), { ...fullMessage, isStreaming: false }];
            }
            return prev.map((m) =>
              (m.id === fullMessage.id || m.clientId === fullMessage.clientId)
                ? { ...fullMessage, isStreaming: false }
                : m
            );
          });
          resolve();
          return;
        }

        const currentText = slices[stepIdx];
        stepIdx++;

        // Fast in-memory update targeting only the last message
        setMessagesState((prev) => {
          const last = prev[prev.length - 1];
          if (last && (last.id === fullMessage.id || last.clientId === fullMessage.clientId)) {
            return [...prev.slice(0, -1), { ...last, content: currentText, isStreaming: true }];
          }
          return prev;
        });

        setTimeout(step, 45);
      };

      setTimeout(step, 45);
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
      if (res && (res.replies || res.reply)) {
        const rawReplies: string[] = res.replies && res.replies.length > 0
          ? res.replies
          : splitCoachReply(res.reply);

        if (res.tokenUsage) {
          setTokenUsage(res.tokenUsage);
        }
        if (res.planUpdated) {
          refreshPlan();
          refreshNiggles();
          // The coach can log an activity, which also awards rooka points and
          // can level the athlete up. Neither the activity list nor the header
          // total was refreshed here, so a session logged in chat stayed
          // invisible on the dashboard until the app was relaunched.
          refreshActivities();
          refreshUser();
        }
        refreshPhysique();
        refreshNiggles();

        const baseTimestamp = Date.now();
        for (let i = 0; i < rawReplies.length; i++) {
          const replyPart = rawReplies[i];
          const partId = `coach-${baseTimestamp}-${i}`;
          const coachMsg: ChatMessage = processMessageItem({
            id: partId,
            clientId: `c-coach-${baseTimestamp}-${i}-${Math.random().toString(36).slice(2, 8)}`,
            content: replyPart,
            role: 'coach',
            mood: res.mood || 'default',
            timestamp: new Date(baseTimestamp + i * 500).toISOString(),
          });

          await streamCoachMessage(coachMsg);
        }
      } else {
        setSending(false);
      }
    } catch (err: any) {
      console.error('Send message error:', err);
      setError(null);
      setMessages((prev) => 
        prev.map(m => (m.id === userMsg.id || m.clientId === userMsg.clientId) ? { ...m, isError: true } : m)
      );
      if (err.status === 429) {
        const fallbackText = "You have run out of tokens today, if you are eager to chat more, consider subscribing [link to upgrade page]";
        const fallbackParts = splitCoachReply(fallbackText);
        const baseErrTimestamp = Date.now();
        for (let i = 0; i < fallbackParts.length; i++) {
          const fallbackCoachMsg: ChatMessage = processMessageItem({
            id: `coach-fallback-${baseErrTimestamp}-${i}`,
            clientId: `c-fallback-${baseErrTimestamp}-${i}-${Math.random().toString(36).slice(2, 8)}`,
            content: fallbackParts[i],
            role: 'coach',
            timestamp: new Date(baseErrTimestamp + i * 500).toISOString(),
          });
          await streamCoachMessage(fallbackCoachMsg);
        }
      }
    } finally {
      setSending(false);
    }
  };

  const resendMessage = async (messageId: string | number) => {
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    
    const msgToResend = messages[msgIndex];
    
    setMessages((prev) => {
      const idx = prev.findIndex(m => m.id === messageId);
      if (idx === -1) return prev;
      return prev.slice(0, idx);
    });

    await sendMessage(msgToResend.content, msgToResend.images);
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
      await socialApi.acceptInvite(inviteId);
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
      await socialApi.declineInvite(inviteId);
    } catch (e) {
      console.error('Failed to decline invite:', e);
    }
  };

  const acceptConnection = async (friendId: number | string) => {
    try {
      await socialApi.acceptUser(friendId);
      setMessages((prev) =>
        prev.map((msg) => {
          const payload = msg.payload_json as any;
          if (
            payload &&
            (String(payload.friend_id) === String(friendId) ||
              String(payload.fromUserId) === String(friendId) ||
              String(payload.id) === String(friendId))
          ) {
            return {
              ...msg,
              payload_json: { ...payload, status: 'accepted' },
            };
          }
          return msg;
        })
      );
    } catch (e) {
      console.error('Failed to accept connection:', e);
      throw e;
    }
  };

  const declineConnection = async (friendId: number | string) => {
    try {
      await socialApi.declineUser(friendId);
      setMessages((prev) =>
        prev.map((msg) => {
          const payload = msg.payload_json as any;
          if (
            payload &&
            (String(payload.friend_id) === String(friendId) ||
              String(payload.fromUserId) === String(friendId) ||
              String(payload.id) === String(friendId))
          ) {
            return {
              ...msg,
              payload_json: { ...payload, status: 'declined' },
            };
          }
          return msg;
        })
      );
    } catch (e) {
      console.error('Failed to decline connection:', e);
      throw e;
    }
  };

  const checkin = async () => {
    if (!isAuthenticated || !user?.id) return;
    try {
      const res = await chatApi.checkin();
      const msgContent = (res as any)?.reply || (res as any)?.message;
      if (msgContent) {
        const parts = splitCoachReply(msgContent);
        const baseTs = Date.now();
        const newMsgs = parts.map((part, idx) =>
          processMessageItem({
            id: `coach-checkin-${baseTs}-${idx}`,
            content: part,
            role: 'coach',
            timestamp: new Date(baseTs + idx * 500).toISOString(),
          })
        );
        setMessages((prev) => [...prev, ...newMsgs]);
      }
    } catch (err: any) {
      console.error('Checkin error:', err);
    }
  };

  const lastCheckinAttemptRef = useRef<string | null>(null);

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
    if (!isAuthenticated || !user?.id) return;

    refreshMessages();

    // Check once per day to catch up on morning message if 08:00 cron was missed (morning only)
    const todayStr = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();
    if (lastCheckinAttemptRef.current !== todayStr && currentHour < 13) {
      lastCheckinAttemptRef.current = todayStr;
      checkin();
    }

    const unsubCoachResponse = wsService.subscribeToEvent('coach_response', (data: any) => {
      const content = typeof data === 'string' ? data : data.content || data.reply || data.message;
      if (content) {
        const parts = splitCoachReply(content);
        const baseTs = Date.now();
        const newMsgs = parts.map((part, idx) =>
          processMessageItem({
            id: (data.id ? `${data.id}-${idx}` : `coach-ws-${baseTs}-${idx}`).toString(),
            content: part,
            role: 'coach',
            timestamp: data.timestamp || new Date(baseTs + idx * 500).toISOString(),
            payload_json: data.payload_json,
          })
        );
        setMessages((prev) => [...prev, ...newMsgs]);
      }
    });

    const unsubChatMessage = wsService.subscribeToEvent('chat_message', (data: any) => {
      if (data && data.content && data.role) {
        const parts = data.role === 'coach' || data.role === 'assistant' ? splitCoachReply(data.content) : [data.content];
        const baseTs = Date.now();
        const newMsgs = parts.map((part, idx) =>
          processMessageItem({
            id: (data.id ? `${data.id}-${idx}` : `chat-ws-${baseTs}-${idx}`).toString(),
            content: part,
            role: data.role === 'user' ? 'user' : 'coach',
            timestamp: data.timestamp || new Date(baseTs + idx * 500).toISOString(),
            payload_json: data.payload_json,
          })
        );
        setMessages((prev) => [...prev, ...newMsgs]);
      }
    });

    const unsubStreamChunk = wsService.subscribeToEvent('chat_stream_chunk', (data: any) => {
      const chunk = typeof data === 'string' ? data : data.chunk || data.text || '';
      if (!chunk) return;

      const messageId = data.messageId || 'streaming_coach_msg';

      setMessagesState((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (
          lastMsg &&
          lastMsg.role === 'coach' &&
          (String(lastMsg.id) === String(messageId) || String(lastMsg.id).startsWith('streaming_'))
        ) {
          const updatedContent = (lastMsg.content || '') + chunk;
          return [
            ...prev.slice(0, -1),
            {
              ...lastMsg,
              content: updatedContent,
              isStreaming: true,
            },
          ];
        } else {
          return [
            ...prev,
            {
              id: messageId,
              content: chunk,
              role: 'coach',
              isStreaming: true,
              timestamp: new Date().toISOString(),
            },
          ];
        }
      });
    });

    const unsubChatImageReady = wsService.subscribeToEvent('chat_image_ready', (data: any) => {
      if (data?.pendingKey && data?.imageUrl) {
        setMessagesState((prev) =>
          prev.map((msg) => {
            if (msg.content && msg.content.includes(`loading://${data.pendingKey}`)) {
              return {
                ...msg,
                content: msg.content.replace(`loading://${data.pendingKey}`, data.imageUrl),
              };
            }
            return msg;
          })
        );
      }
    });

    const unsubChatImageFailed = wsService.subscribeToEvent('chat_image_failed', (data: any) => {
      if (data?.pendingKey) {
        setMessagesState((prev) =>
          prev.map((msg) => {
            if (msg.content && msg.content.includes(`loading://${data.pendingKey}`)) {
              return {
                ...msg,
                content: msg.content.replace(new RegExp(`!\\[.*?\\]\\(loading://${data.pendingKey}\\)`, 'g'), '').trim(),
              };
            }
            return msg;
          })
        );
      }
    });

    const unsubUnreadMessage = wsService.subscribeToEvent('unread_message', (_data: any) => {
      refreshMessages();
    });

    const subNotification = DeviceEventEmitter.addListener('COACH_NOTIFICATION_RECEIVED', () => {
      refreshMessages();
    });

    return () => {
      unsubCoachResponse();
      unsubChatMessage();
      unsubStreamChunk();
      unsubChatImageReady();
      unsubChatImageFailed();
      unsubUnreadMessage();
      subNotification.remove();
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
        resendMessage,
        clearHistory,
        acceptProposal,
        rejectProposal,
        acceptInvite,
        declineInvite,
        acceptConnection,
        declineConnection,
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

