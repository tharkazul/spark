import { TextInput as RNTextInput, TextInputProps, View, Text } from 'react-native';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export function TextInput({ label, error, className = '', ...props }: Props) {
  return (
    <View className={`w-full ${className}`}>
      {label && (
        <Text className="text-xs font-bold text-theme-muted mb-2">
          {label}
        </Text>
      )}
      <RNTextInput
        className="w-full p-4 rounded-xl text-base bg-theme-bg text-theme-text"
        placeholderTextColor="#8E8E93"
        {...props}
      />
      {error && (
        <Text className="text-red-500 text-xs mt-1">{error}</Text>
      )}
    </View>
  );
}
