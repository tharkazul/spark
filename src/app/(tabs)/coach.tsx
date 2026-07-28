import React, { useState } from 'react';
import { View, Text, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput } from '../../components/ui/TextInput';
import { Ionicons } from '@expo/vector-icons';

import { useCoachChat } from '../../context/CoachChatStore';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'coach';
}

export default function CoachScreen() {
  const { messages: storeMessages, sendMessage: storeSendMessage, sending } = useCoachChat();
  const [inputText, setInputText] = useState('');

  const messages: Message[] = storeMessages.map((msg, index) => ({
    id: msg.id ? String(msg.id) : `msg-${index}-${msg.timestamp || index}`,
    text: msg.content,
    sender: msg.role === 'user' ? 'user' : 'coach',
  }));

  const handleSendMessage = () => {
    if (!inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText('');
    storeSendMessage(text);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View className={`mb-4 max-w-[80%] ${isUser ? 'self-end' : 'self-start'}`}>
        <View className={`px-4 py-3 rounded-2xl ${isUser ? 'bg-theme-accent rounded-br-sm' : 'bg-theme-card border border-theme-border rounded-bl-sm'}`}>
          <Text className={isUser ? 'text-white' : 'text-theme-text'}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      <View className="px-4 py-4 border-b border-theme-border bg-theme-bg z-10 flex-row items-center">
        <View className="w-10 h-10 rounded-full bg-theme-accent items-center justify-center mr-3">
          <Ionicons name="flash" size={20} color="white" />
        </View>
        <View>
          <Text className="text-theme-text text-lg font-bold">Spark AI Coach</Text>
          <Text className="text-theme-accent text-xs">Online</Text>
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          className="flex-1"
        />

        <View className="p-4 bg-theme-bg border-t border-theme-border flex-row items-center">
          <View className="flex-1 mr-2">
            <TextInput 
              placeholder="Ask your coach..."
              value={inputText}
              onChangeText={setInputText}
              className="py-3 px-4 bg-theme-card rounded-full"
            />
          </View>
          <TouchableOpacity 
            onPress={handleSendMessage}
            disabled={sending}
            className={`w-12 h-12 rounded-full items-center justify-center ${sending ? 'bg-theme-accent/50' : 'bg-theme-accent'}`}
          >
            <Ionicons name="arrow-up" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
