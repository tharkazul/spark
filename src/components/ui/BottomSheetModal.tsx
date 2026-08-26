import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useSheetDismiss } from '../../hooks/use-sheet-dismiss';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentClassName?: string;
  style?: any;
  showHandle?: boolean;
}

export const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
  visible,
  onClose,
  children,
  contentClassName = 'bg-theme-card rounded-t-3xl px-6 pt-3 pb-6 border-t border-theme-border/50 max-h-[85%]',
  style,
  showHandle = false,
}) => {
  const [showModal, setShowModal] = useState(visible);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const { dragY, panHandlers } = useSheetDismiss(onClose);

  useEffect(() => {
    if (visible) {
      setShowModal(true);
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 24,
          stiffness: 220,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowModal(false);
      });
    }
  }, [visible, translateY, backdropOpacity]);

  if (!showModal) return null;

  return (
    <Modal
      visible={showModal}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-1 justify-end relative">
          {/* Static Fullscreen Backdrop: Fades In Simultaneously */}
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: 'rgba(0,0,0,0.6)', opacity: backdropOpacity },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={onClose}
              className="flex-1"
            />
          </Animated.View>

          {/* Bottom Sheet: Slides Up Simultaneously */}
          <Animated.View
            style={[
              { transform: [{ translateY: Animated.add(translateY, dragY) }] },
              style,
            ]}
            className={contentClassName}
          >
            {/* Grab area. The handle is always rendered now — it is the
                affordance that tells you the sheet can be pulled down, and it
                is the only region that claims the drag gesture, so content
                inside the sheet still scrolls normally. */}
            <View {...panHandlers} className="items-center pb-4 pt-1 -mt-3">
              <View className="w-11 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
            </View>
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
