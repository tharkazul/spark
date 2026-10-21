#!/usr/bin/env node
/**
 * Patches `react-native-workouts/ios/ReactNativeWorkoutsModule.swift` for Expo SDK 57+.
 *
 * Why this is needed:
 * In Expo SDK 57 (`expo-modules-jsi`), `JavaScriptValue.getAny()` converts all JS
 * numbers in `[String: Any]` dictionaries into pure Swift `Double` (instead of Objective-C
 * `NSNumber`). In Swift, `anyDouble as? Int` evaluates to `nil`!
 *
 * Without this patch:
 * 1. `parseDateComponents` (`dict["year"] as? Int`, etc.) returns an empty `DateComponents()`,
 *    so `WorkoutScheduler.shared.schedule(plan, at: DateComponents())` schedules a dateless
 *    workout that watchOS's Workout app never displays on the Apple Watch.
 * 2. `parseIntervalBlock` (`config["iterations"] as? Int`) returns `nil`, silently turning
 *    every repeat block (e.g. 4x1000m) into 1 iteration.
 * 3. `parseWorkoutAlert` (`config["zone"] as? Int`) returns `nil`, silently dropping heart
 *    rate zone alerts.
 */

const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-workouts',
  'ios',
  'ReactNativeWorkoutsModule.swift'
);

if (!fs.existsSync(targetPath)) {
  console.log('[patch-react-native-workouts] target not found, skipping:', targetPath);
  process.exit(0);
}

let content = fs.readFileSync(targetPath, 'utf8');
const original = content;

const helperMethods = `    // MARK: - Helper Methods

    private func parseInt(_ value: Any?) -> Int? {
        if let i = value as? Int { return i }
        if let d = value as? Double, d.isFinite { return Int(d) }
        if let n = value as? NSNumber { return n.intValue }
        if let s = value as? String, let i = Int(s) { return i }
        return nil
    }

    private func parseDouble(_ value: Any?) -> Double? {
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        if let n = value as? NSNumber { return n.doubleValue }
        if let s = value as? String, let d = Double(s) { return d }
        return nil
    }`;

if (!content.includes('private func parseInt(_ value: Any?) -> Int?')) {
  content = content.replace('    // MARK: - Helper Methods', helperMethods);
}

const replacements = [
  ['guard let value = config["value"] as? Double else {', 'guard let value = self.parseDouble(config["value"]) else {'],
  ['if let zone = config["zone"] as? Int {', 'if let zone = self.parseInt(config["zone"]) {'],
  [
    'else if let min = config["min"] as? Double, let max = config["max"] as? Double {',
    'else if let min = self.parseDouble(config["min"]), let max = self.parseDouble(config["max"]) {',
  ],
  [
    'guard let min = config["min"] as? Double, let max = config["max"] as? Double else {',
    'guard let min = self.parseDouble(config["min"]), let max = self.parseDouble(config["max"]) else {',
  ],
  ['if let iterations = config["iterations"] as? Int {', 'if let iterations = self.parseInt(config["iterations"]) {'],
  ['if let year = dict["year"] as? Int {', 'if let year = self.parseInt(dict["year"]) {'],
  ['if let month = dict["month"] as? Int {', 'if let month = self.parseInt(dict["month"]) {'],
  ['if let day = dict["day"] as? Int {', 'if let day = self.parseInt(dict["day"]) {'],
  ['if let hour = dict["hour"] as? Int {', 'if let hour = self.parseInt(dict["hour"]) {'],
  ['if let minute = dict["minute"] as? Int {', 'if let minute = self.parseInt(dict["minute"]) {'],
];

for (const [from, to] of replacements) {
  content = content.split(from).join(to);
}

if (content !== original) {
  fs.writeFileSync(targetPath, content, 'utf8');
  console.log('[patch-react-native-workouts] Patched ReactNativeWorkoutsModule.swift for Expo SDK 57 JSI.');
} else {
  console.log('[patch-react-native-workouts] ReactNativeWorkoutsModule.swift already patched.');
}
