import { SheetGrabber } from '@/components/ui/SheetGrabber';
import { SheetSurface, SHEET_BACKDROP } from '@/components/ui/SheetSurface';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  GestureResponderHandlers,
  ViewProps,
} from 'react-native';
import { useSheetDismiss } from '../../hooks/use-sheet-dismiss';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface BottomSheetContextValue {
  panHandlers: GestureResponderHandlers;
}

export const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

export const useBottomSheet = () => useContext(BottomSheetContext);

export interface BottomSheetHeaderProps extends ViewProps {
  children?: React.ReactNode;
}

export const BottomSheetHeader: React.FC<BottomSheetHeaderProps> = ({
  children,
  style,
  ...props
}) => {
  const ctx = useBottomSheet();
  return (
    <View
      {...(ctx?.panHandlers ?? {})}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
};

export interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Layout only (padding, height). The surface owns background, corners and border. */
  contentClassName?: string;
  /** Background where liquid glass is unavailable. */
  solidClassName?: string;
  style?: any;
  showHandle?: boolean;
  header?: React.ReactNode;
}

export const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
  visible,
  onClose,
  children,
  contentClassName = 'px-6 pt-3 max-h-[90%]',
  solidClassName,
  style,
  showHandle = false,
  header,
}) => {
  const [showModal, setShowModal] = useState(visible);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  if (visible && !showModal) {
    setShowModal(true);
  }

  const { panHandlers } = useSheetDismiss(onClose, {
    animY: translateY,
    backdropOpacity,
    onWillClose: () => {
      isClosingRef.current = true;
    },
  });

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
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
      if (isClosingRef.current) {
        setShowModal(false);
        isClosingRef.current = false;
        return;
      }

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
      statusBarTranslucent={true}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 justify-end relative">
          {/* Static Fullscreen Backdrop: Fades In Simultaneously */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: SHEET_BACKDROP, opacity: backdropOpacity },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={onClose}
              className="flex-1"
            />
          </Animated.View>

          {/* Bottom Sheet: Slides Up Simultaneously */}
          <SheetSurface
            style={[{ transform: [{ translateY }] }, style]}
            padBottom={20}
            className={contentClassName}
            solidClassName={solidClassName}
          >
            <BottomSheetContext.Provider value={{ panHandlers }}>
              {/* Grab area and header. Draggable downwards to dismiss sheet. */}
              <View {...panHandlers} className="self-stretch">
                <View className="items-center justify-center py-3 -mt-3 self-stretch">
                  <SheetGrabber />
                </View>
                {header}
              </View>
              {children}
            </BottomSheetContext.Provider>
          </SheetSurface>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
