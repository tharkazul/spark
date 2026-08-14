import React from 'react';
import { View, StyleSheet, Platform, useColorScheme, TouchableOpacity } from 'react-native';
import Markdown from 'react-native-markdown-display';
import FitImage from 'react-native-fit-image';
import { API_BASE_URL } from '../../constants/api';

interface MarkdownTextProps {
  content: string;
  isUser?: boolean;
  textColorOverride?: string;
  onImagePress?: (uri: string) => void;
}

const getFullImageUrl = (src?: string) => {
  if (!src) return '';
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src;
  }
  return `${API_BASE_URL}${src.startsWith('/') ? src : `/${src}`}`;
};

export const hasRenderableText = (content?: string) =>
  !!content?.replace(/```json[\s\S]*?```/gi, '').trim();

export const MarkdownText: React.FC<MarkdownTextProps> = ({ content, isUser, textColorOverride, onImagePress }) => {
  if (!content) return null;

  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const cleanedContent = content.replace(/```json[\s\S]*?```/gi, '').trim();
  if (!cleanedContent) return null;

  const defaultCoachColor = isDark ? '#F8FAFC' : '#0F172A';
  const textColor = textColorOverride || (isUser ? '#FFFFFF' : defaultCoachColor);
  const accentColor = isUser ? '#FFFFFF' : '#FF5A1F';
  const mutedColor = isUser ? 'rgba(255,255,255,0.7)' : isDark ? '#94A3B8' : '#64748B';

  const markdownRules = {
    image: (node: any) => {
      const { src, alt } = node.attributes;
      const uri = getFullImageUrl(src);
      if (!uri) return null;

      return (
        <TouchableOpacity
          key={node.key}
          activeOpacity={0.9}
          onPress={() => onImagePress?.(uri)}
          style={{ width: '100%', marginVertical: 8 }}
        >
          <FitImage
            source={{ uri }}
            indicator={false}
            style={{ borderRadius: 12, overflow: 'hidden' }}
            accessible={!!alt}
            accessibilityLabel={alt || undefined}
          />
        </TouchableOpacity>
      );
    },
  };

  const styles = StyleSheet.create({
    body: {
      color: textColor,
      fontSize: 15,
      lineHeight: 22,
    },
    heading1: {
      color: textColor,
      fontSize: 20,
      fontWeight: '800',
      marginTop: 8,
      marginBottom: 4,
    },
    heading2: {
      color: textColor,
      fontSize: 18,
      fontWeight: '700',
      marginTop: 6,
      marginBottom: 4,
    },
    heading3: {
      color: textColor,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 4,
      marginBottom: 2,
    },
    paragraph: {
      color: textColor,
      marginTop: 0,
      marginBottom: 6,
    },
    strong: {
      fontWeight: '700',
      color: textColor,
    },
    em: {
      fontStyle: 'italic',
      color: textColor,
    },
    link: {
      color: accentColor,
      textDecorationLine: 'underline',
    },
    code_inline: {
      backgroundColor: isUser ? 'rgba(255, 255, 255, 0.2)' : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
      color: accentColor,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13,
    },
    code_block: {
      backgroundColor: isUser ? 'rgba(0, 0, 0, 0.2)' : isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.05)',
      borderRadius: 8,
      padding: 10,
      marginVertical: 6,
      borderWidth: 1,
      borderColor: isUser ? 'rgba(255, 255, 255, 0.2)' : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)',
    },
    fence: {
      backgroundColor: isUser ? 'rgba(0, 0, 0, 0.2)' : isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.05)',
      borderRadius: 8,
      padding: 10,
      marginVertical: 6,
      borderWidth: 1,
      borderColor: isUser ? 'rgba(255, 255, 255, 0.2)' : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)',
    },
    bullet_list: {
      marginVertical: 2,
    },
    ordered_list: {
      marginVertical: 2,
    },
    bullet_list_icon: {
      color: accentColor,
      fontSize: 16,
      lineHeight: 22,
      marginRight: 6,
    },
    ordered_list_icon: {
      color: accentColor,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: 'bold',
      marginRight: 6,
    },
    list_item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginVertical: 1,
    },
    table: {
      borderWidth: 1,
      borderColor: isUser ? 'rgba(255, 255, 255, 0.3)' : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      borderRadius: 6,
      marginVertical: 6,
    },
    tableHeader: {
      backgroundColor: isUser ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 90, 31, 0.15)',
    },
    tableRow: {
      borderBottomWidth: 1,
      borderColor: isUser ? 'rgba(255, 255, 255, 0.2)' : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    tableCell: {
      padding: 6,
      color: textColor,
      fontSize: 13,
    },
    hr: {
      backgroundColor: mutedColor,
      height: 1,
      marginVertical: 8,
    },
  });

  return (
    <View className="w-full">
      <Markdown rules={markdownRules} style={styles}>
        {cleanedContent}
      </Markdown>
    </View>
  );
};
