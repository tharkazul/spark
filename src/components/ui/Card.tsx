import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  className?: string;
}

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <View 
      className={`bg-theme-card border border-theme-border rounded-[24px] p-6 ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}
