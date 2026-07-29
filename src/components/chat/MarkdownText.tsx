import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

interface MarkdownTextProps {
  content: string;
  isUser?: boolean;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({ content, isUser }) => {
  if (!content) return null;

  // Clean out JSON blocks from standard message display if any remains
  const cleanedContent = content.replace(/```json[\s\S]*?```/gi, '').trim();

  // Split by markdown image tags ![alt](url)
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
  const parts: Array<{ type: 'text' | 'image'; text?: string; alt?: string; url?: string }> = [];

  let lastIndex = 0;
  let match;
  while ((match = imageRegex.exec(cleanedContent)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: cleanedContent.substring(lastIndex, match.index) });
    }
    parts.push({ type: 'image', alt: match[1], url: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < cleanedContent.length) {
    parts.push({ type: 'text', text: cleanedContent.substring(lastIndex) });
  }

  const renderFormattedText = (rawText: string) => {
    const lines = rawText.split('\n');
    return lines.map((line, lineIdx) => {
      // Check list items
      const isListItem = line.trim().startsWith('- ') || line.trim().startsWith('* ');
      const textToFormat = isListItem ? line.trim().replace(/^[-*]\s+/, '') : line;

      // Handle bold formatting **bold**
      const boldRegex = /\*\*(.*?)\*\*/g;
      const textSegments: React.ReactNode[] = [];
      let segIndex = 0;
      let boldMatch;

      while ((boldMatch = boldRegex.exec(textToFormat)) !== null) {
        if (boldMatch.index > segIndex) {
          textSegments.push(
            <Text key={`seg-${segIndex}`} className={isUser ? 'text-white' : 'text-theme-text'}>
              {textToFormat.substring(segIndex, boldMatch.index)}
            </Text>
          );
        }
        textSegments.push(
          <Text key={`bold-${boldMatch.index}`} className={`font-bold ${isUser ? 'text-white' : 'text-theme-text'}`}>
            {boldMatch[1]}
          </Text>
        );
        segIndex = boldMatch.index + boldMatch[0].length;
      }

      if (segIndex < textToFormat.length) {
        textSegments.push(
          <Text key={`seg-end`} className={isUser ? 'text-white' : 'text-theme-text'}>
            {textToFormat.substring(segIndex)}
          </Text>
        );
      }

      if (isListItem) {
        return (
          <View key={`line-${lineIdx}`} className="flex-row items-start my-1 pl-1">
            <Text className={`mr-2 font-bold ${isUser ? 'text-white' : 'text-theme-accent'}`}>•</Text>
            <Text className={`flex-1 text-base leading-6 ${isUser ? 'text-white' : 'text-theme-text'}`}>
              {textSegments}
            </Text>
          </View>
        );
      }

      return (
        <Text key={`line-${lineIdx}`} className={`text-base leading-6 my-0.5 ${isUser ? 'text-white' : 'text-theme-text'}`}>
          {textSegments}
        </Text>
      );
    });
  };

  return (
    <View className="w-full">
      {parts.map((part, idx) => {
        if (part.type === 'image' && part.url) {
          return (
            <View key={`img-${idx}`} className="my-2 rounded-xl overflow-hidden bg-black/20 border border-theme-border">
              <Image
                source={{ uri: part.url }}
                style={{ width: '100%', height: 200 }}
                contentFit="cover"
                transition={300}
              />
              {part.alt ? (
                <Text className="text-xs text-theme-muted italic p-2 bg-theme-bg/60">{part.alt}</Text>
              ) : null}
            </View>
          );
        }
        return (
          <View key={`txt-${idx}`}>
            {renderFormattedText(part.text || '')}
          </View>
        );
      })}
    </View>
  );
};
