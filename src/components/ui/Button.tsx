import { TouchableOpacity, Text, TouchableOpacityProps, ActivityIndicator } from 'react-native';

interface ButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'outline';
  isLoading?: boolean;
  className?: string;
}

export function Button({ 
  label, 
  variant = 'primary', 
  isLoading = false, 
  className = '', 
  ...props 
}: ButtonProps) {
  
  const getVariantClasses = () => {
    switch (variant) {
      case 'secondary':
        return 'bg-theme-accent-soft border-transparent';
      case 'outline':
        return 'bg-transparent border-theme-border border-2';
      case 'primary':
      default:
        return 'bg-theme-accent border-transparent';
    }
  };

  const getTextClasses = () => {
    switch (variant) {
      case 'secondary':
        return 'text-theme-accent font-semibold';
      case 'outline':
        return 'text-theme-text font-semibold';
      case 'primary':
      default:
        return 'text-white font-bold';
    }
  };

  return (
    <TouchableOpacity 
      className={`py-3.5 px-6 rounded-xl flex-row items-center justify-center border ${getVariantClasses()} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? 'white' : '#FF5F3B'} />
      ) : (
        <Text className={`text-base text-center ${getTextClasses()}`}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
