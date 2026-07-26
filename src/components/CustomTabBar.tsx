import { View, TouchableOpacity, Text } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View 
      className="absolute bottom-6 mx-4 self-center w-full max-w-md bg-theme-bg/90 border border-theme-border rounded-[32px] flex-row justify-between items-center px-6 py-2 shadow-2xl"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const isCenterButton = route.name === 'coach';

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        if (isCenterButton) {
          return (
            <View key={route.key} className="relative -mt-12 mb-3">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarTestID}
                onPress={onPress}
                className="flex items-center justify-center w-[72px] h-[72px] bg-theme-accent rounded-full shadow-lg border-[6px] border-theme-bg transform transition"
                style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 10 }}
              >
                {options.tabBarIcon && options.tabBarIcon({ focused: isFocused, color: '#FFFFFF', size: 28 })}
              </TouchableOpacity>
            </View>
          );
        }

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            className="p-2 items-center"
          >
            {options.tabBarIcon && options.tabBarIcon({ 
              focused: isFocused, 
              color: isFocused ? '#208AEF' : '#8E8E93', 
              size: 24 
            })}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
