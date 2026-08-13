import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { socialApi } from '../../services/apiServices';
import { MentionUser } from '../../types/social';

interface CommentComposerProps {
  onSendComment: (commentText: string) => Promise<void>;
  placeholder?: string;
}

export const CommentComposer: React.FC<CommentComposerProps> = ({
  onSendComment,
  placeholder = 'Add a comment... (use @ to mention)',
}) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [connections, setConnections] = useState<MentionUser[]>([]);
  const [filteredConnections, setFilteredConnections] = useState<MentionUser[]>([]);
  const [showMentionList, setShowMentionList] = useState(false);

  // Fetch user connections for @mentions autocomplete
  useEffect(() => {
    let isMounted = true;
    socialApi
      .getConnections()
      .then((res) => {
        if (!isMounted) return;
        if (res && Array.isArray(res.connections)) {
          const list: MentionUser[] = res.connections
            .filter((c) => c.status === 'accepted')
            .map((c) => ({
              id: c.friend_id,
              username: c.username,
              profile_picture_url: c.profile_picture_url,
            }));
          setConnections(list);
        }
      })
      .catch((err) => console.log('Connections fetch error:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  const handleTextChange = (newText: string) => {
    setText(newText);

    // Detect @ symbol position
    const lastAtIndex = newText.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const charAfterAt = newText.slice(lastAtIndex + 1);
      // Check if there is space after @, if so hide list
      if (!charAfterAt.includes(' ')) {
        const query = charAfterAt.toLowerCase();
        const matched = connections.filter((user) =>
          user.username.toLowerCase().includes(query)
        );
        setFilteredConnections(matched);
        setShowMentionList(matched.length > 0);
        return;
      }
    }
    setShowMentionList(false);
  };

  const handleSelectMention = (username: string) => {
    Haptics.selectionAsync();
    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const prefix = text.substring(0, lastAtIndex);
      const newText = `${prefix}@${username} `;
      setText(newText);
    }
    setShowMentionList(false);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSending(true);
    try {
      await onSendComment(trimmed);
      setText('');
      setShowMentionList(false);
    } catch (err) {
      console.error('Send comment error:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="relative z-50">
      {/* MENTION AUTOCOMPLETE POPUP */}
      {showMentionList && filteredConnections.length > 0 && (
        <View className="absolute bottom-14 left-0 right-0 bg-theme-card border border-theme-accent/40 rounded-2xl p-2 shadow-lg max-h-48 z-50">
          <Text className="text-[10px] font-black uppercase text-theme-accent px-2 py-1 tracking-wider">
            Mention Connection
          </Text>
          <FlatList
            data={filteredConnections}
            keyExtractor={(item) => `mention-${item.id}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSelectMention(item.username)}
                className="flex-row items-center space-x-2.5 p-2 rounded-xl active:bg-theme-accent/15"
              >
                {item.profile_picture_url ? (
                  <Image source={{ uri: item.profile_picture_url }} className="w-7 h-7 rounded-full" />
                ) : (
                  <View className="w-7 h-7 rounded-full bg-theme-accent/20 items-center justify-center border border-theme-accent/40">
                    <Text className="text-xs font-black text-theme-accent">
                      {item.username.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text className="text-xs font-extrabold text-theme-text">@{item.username}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* INPUT FIELD */}
      <View className="flex-row items-center bg-theme-card border border-theme-border rounded-2xl p-1.5 shadow-sm">
        <TextInput
          value={text}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor="#6F6F79"
          multiline
          className="flex-1 px-3 py-2 text-sm font-semibold text-theme-text max-h-24"
        />

        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() || sending}
          className={`w-10 h-10 rounded-xl items-center justify-center ${
            text.trim() && !sending ? 'bg-theme-accent' : 'bg-theme-border/40'
          }`}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={16} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};
