import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

interface MarkdownTextProps {
  content: string;
  isUser?: boolean;
}

export const hasRenderableText = (content?: string) =>
  !!content?.replace(/```json[\s\S]*?```/gi, '').trim();

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

  const parseInline = (text: string, baseClass: string) => {
    // Regex for inline code `...`, bold **...**, italic *...* or _..._
    const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
    const segments: React.ReactNode[] = [];
    let idx = 0;
    
    let m;
    let segId = 0;
    while ((m = tokenRegex.exec(text)) !== null) {
      if (m.index > idx) {
        segments.push(<Text key={`text-${segId++}`} className={baseClass}>{text.substring(idx, m.index)}</Text>);
      }
      const token = m[0];
      if (token.startsWith('`') && token.endsWith('`')) {
        segments.push(
          <Text key={`code-${segId++}`} className={`font-mono bg-black/10 px-1 rounded ${baseClass}`}>
            {token.slice(1, -1)}
          </Text>
        );
      } else if (token.startsWith('**') && token.endsWith('**')) {
        segments.push(
          <Text key={`bold-${segId++}`} className={`font-bold ${baseClass}`}>
            {token.slice(2, -2)}
          </Text>
        );
      } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
        segments.push(
          <Text key={`italic-${segId++}`} className={`italic ${baseClass}`}>
            {token.slice(1, -1)}
          </Text>
        );
      }
      idx = m.index + token.length;
    }
    if (idx < text.length) {
      segments.push(<Text key={`text-${segId++}`} className={baseClass}>{text.substring(idx)}</Text>);
    }
    return segments.length > 0 ? segments : <Text className={baseClass}>{text}</Text>;
  };

  const renderFormattedText = (rawText: string) => {
    // Collapse runs of 3+ newlines to just 2, creating uniform paragraph breaks
    const lines = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').split('\n');

    return lines.map((line, lineIdx) => {
      if (!line.trim()) {
        return <View key={`spacer-${lineIdx}`} className="h-3" />;
      }
      
      const isBulletList = line.trim().startsWith('- ') || line.trim().startsWith('* ');
      let numberMatch = null;
      let isNumberList = false;
      if (!isBulletList) {
        numberMatch = line.trim().match(/^(\d+\.)\s+/);
        isNumberList = !!numberMatch;
      }
      
      const headingMatch = line.trim().match(/^(#{1,6})\s+/);
      const isHeading = !!headingMatch;

      let textToFormat = line.trim();
      let headingLevel = 0;

      if (isBulletList) {
        textToFormat = textToFormat.replace(/^[-*]\s+/, '');
      } else if (isNumberList && numberMatch) {
        textToFormat = textToFormat.replace(/^(\d+\.)\s+/, '');
      } else if (isHeading && headingMatch) {
        headingLevel = headingMatch[1].length;
        textToFormat = textToFormat.replace(/^(#{1,6})\s+/, '');
      }

      const colorClass = 'text-theme-text';
      let textClass = `text-[16px] leading-[24px] ${colorClass}`;
      
      if (isHeading) {
        if (headingLevel === 1) textClass = `text-[22px] font-black leading-[30px] ${colorClass} mt-3 mb-1`;
        else if (headingLevel === 2) textClass = `text-[20px] font-bold leading-[28px] ${colorClass} mt-2 mb-1`;
        else textClass = `text-[18px] font-bold leading-[26px] ${colorClass} mt-1 mb-1`;
      }

      const inlineContent = parseInline(textToFormat, textClass);

      if (isBulletList) {
        return (
          <View key={`line-${lineIdx}`} className="flex-row items-start my-1 pl-1 pr-2">
            <Text className={`mr-2 font-bold text-[16px] leading-[24px] ${isUser ? 'text-theme-text' : 'text-theme-accent'}`}>•</Text>
            <Text className="flex-1">{inlineContent}</Text>
          </View>
        );
      }
      if (isNumberList && numberMatch) {
        return (
          <View key={`line-${lineIdx}`} className="flex-row items-start my-1 pl-1 pr-2">
            <Text className={`mr-2 font-bold text-[16px] leading-[24px] ${isUser ? 'text-theme-text' : 'text-theme-accent'}`}>{numberMatch[1]}</Text>
            <Text className="flex-1">{inlineContent}</Text>
          </View>
        );
      }

      return (
        <Text key={`line-${lineIdx}`} className="my-0.5">
          {inlineContent}
        </Text>
      );
    });
  };

  return (
    <View className="w-full">
      {parts.map((part, idx) => {
        if (part.type === 'image' && part.url) {
          return (
            <View key={`img-${idx}`} className="my-2 rounded-xl overflow-hidden bg-black/20">
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
