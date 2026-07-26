import React, { useState } from 'react';
import { View, Text, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput } from '../../components/ui/TextInput';
import { Ionicons } from '@expo/vector-icons';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'coach';
}

export default function CoachScreen() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hey Rutger! Ready to smash this week's training?", sender: 'coach' },
    { id: '2', text: "Yes, I'm feeling great after yesterday's run.", sender: 'user' },
    { id: '3', text: "Awesome. Your readiness is high today. I recommend a 45min threshold session.", sender: 'coach' },
  ]);
  const [inputText, setInputText] = useState('');

  const sendMessage = () => {
    if (!inputText.trim()) return;
    
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: inputText.trim(),
      sender: 'user'
    }]);
    
    setInputText('');
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
          keyExtractor={item => item.id}
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
            onPress={sendMessage}
            className="w-12 h-12 rounded-full bg-theme-accent items-center justify-center"
          >
            <Ionicons name="arrow-up" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
