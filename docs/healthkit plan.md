# Integrating Apple WorkoutKit (HealthKit) into `rooka-native`

This plan outlines the steps to integrate Apple's WorkoutKit framework into your React Native (Expo) app, allowing users to send structured workouts directly to the native Apple Watch Workout app. 

### Why WorkoutKit instead of just HealthKit?
*   **HealthKit** is a database. It stores *past* data (steps, heart rate, completed workouts). You can use it to log a workout after the user finishes, but it doesn't help the user actually *execute* the workout in real-time.
*   **WorkoutKit** (iOS 17+) is an execution framework. It allows you to program a structured workout plan (e.g., 5 min warmup, 5x 1km intervals at 5:00 pace, 5 min cooldown) and push it directly into the native Apple Watch **"Workout" app**.
*   **The Benefit:** Without WorkoutKit, you would have to build, design, and maintain a completely separate, custom watchOS application to guide the user through their intervals. With WorkoutKit, you just hand the data to Apple, and their native app handles the timers, haptics, voice feedback, and UI.

---

## User Review Required

> [!IMPORTANT]
> **Migrating from Expo Go to Development Builds**
> Because HealthKit/WorkoutKit requires custom native iOS code and Apple Entitlements, **it will not work inside the Expo Go app**. 
> To test this, we must compile a "Development Build" or build the app for TestFlight using Expo Application Services (EAS). You already have the `ios/` folder, which means you are ready for this transition.

---

## Proposed Changes

We will use the community library `react-native-workouts`, which provides a React Native bridge to the native Apple WorkoutKit framework.

### 1. Dependencies and Configuration
We need to install the library and configure Expo to request HealthKit permissions from the user.

#### [MODIFY] `package.json`
- Add `react-native-workouts` to your dependencies. 

#### [MODIFY] `app.json`
- Add the necessary Expo Config Plugins to inject HealthKit entitlements into the native iOS build.
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSHealthShareUsageDescription": "Rooka needs access to your health data to sync workouts to your Apple Watch.",
        "NSHealthUpdateUsageDescription": "Rooka needs permission to save scheduled workouts to your Apple Watch."
      },
      "entitlements": {
        "com.apple.developer.healthkit": true,
        "com.apple.developer.healthkit.access": []
      }
    }
  }
}
```

### 2. Workout Data Mapping
I reviewed your `src/types/plan.ts`. Your current `WorkoutStep` interface is structurally perfect for WorkoutKit. It already breaks things down by `type` (warmup, interval, recovery, cooldown), `condition_type` (time, distance), and `target_type` (pace, heart rate zone).

#### [NEW] `src/services/WorkoutKitService.ts`
We will create a service to map your `PlannedWorkout` and `WorkoutStep[]` arrays into the native iOS WorkoutKit schema.
- **Request Authorization:** Call `WorkoutScheduler.requestAuthorization()` before attempting to sync.
- **Map Data:** 
  - If `step.type === 'warmup'`, map to WorkoutKit `WarmupStep`.
  - If `step.condition_type === 'distance'`, map to WorkoutKit `DistanceGoal`.
  - If `step.target_type === 'heart.rate.zone'`, map to WorkoutKit `HeartRateZoneAlert`.
- **Schedule:** Call `WorkoutScheduler.schedule(workout, date)` to push it to the Apple Watch.

### 3. UI Integration

#### [MODIFY] `src/app/(tabs)/profile.tsx` (or Workout Details Screen)
- Import `WorkoutKitService`.
- Add an "Push to Apple Watch" button (similar to your existing Garmin sync button).
- Handle success/error states natively.

---

## Deployment & TestFlight Plan

Since you now have an approved Apple Developer account, here is how we will get this onto your devices and into TestFlight for your testers.

1.  **Initialize EAS (Expo Application Services):**
    We will run `eas init` to link this project to your Expo account.
2.  **Configure EAS Build:**
    We will modify `eas.json` to define a `development` profile (for local testing on your physical iPhone) and a `preview`/`production` profile (for TestFlight).
3.  **Generate Credentials:**
    We will run `eas credentials` which will log into your Apple Developer account, register your app Bundle ID, and generate the necessary Provisioning Profiles with the HealthKit capabilities enabled.
4.  **Build for TestFlight:**
    We will run `eas build --platform ios --profile production`. This compiles the native app (including the new WorkoutKit library) in the cloud.
5.  **Submit to App Store Connect:**
    We run `eas submit -p ios` to push the `.ipa` file directly to your App Store Connect account, where you can add internal testers via TestFlight.
