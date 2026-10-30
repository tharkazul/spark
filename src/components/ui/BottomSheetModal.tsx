import { SheetGrabber } from '@/components/ui/SheetGrabber';
import { SheetSurface, SHEET_BACKDROP } from '@/components/ui/SheetSurface';
import React, { createContext, useContext } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Animated,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  GestureResponderHandlers,
  ViewProps,
} from 'react-native';
import { useSheetPresentation } from '../../hooks/use-sheet-presentation';


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
  const { showModal, slideAnim: translateY, backdropOpacity, panHandlers, onSheetLayout } = useSheetPresentation(visible, onClose);

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
        <View className="flex-1 justify-end relative" onLayout={onSheetLayout}>
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
