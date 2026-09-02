import { View } from 'react-native';

/**
 * The pill at the top of a bottom sheet — the affordance that says the sheet
 * can be pulled down.
 *
 * This markup was duplicated verbatim in nine files (BottomSheetModal, the five
 * dashboard log/adapt modals, AddWorkoutModal, two social modals, and the
 * profile sheet), which meant nine places to miss when the colour or size
 * changed. The colours stay raw rather than borrowing `theme-border`: a grabber
 * wants to read slightly stronger than a hairline border does, so slate-300 /
 * slate-700 is a deliberate value, not a stray one. It now lives here only.
 *
 * Wrap it in the element that owns `panHandlers` — this renders the pill and
 * its spacing, not the gesture target.
 */
export function SheetGrabber() {
  return <View className="w-11 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />;
}
