# App Store & Google Play Store Metadata Specification

This document provides all copy, tags, metadata, and privacy declaration answers required for submitting **Rooka (rooka-native)** to the **Apple App Store (App Store Connect)** and **Google Play Console**.

---

## 1. General App Store Listing Information

| Attribute | Apple App Store | Google Play Store |
| :--- | :--- | :--- |
| **App Name** | Rooka - AI Fitness & Recovery | Rooka: AI Fitness & Recovery |
| **Subtitle / Short Description** (Max length) | AI Coaching, Recovery & Workouts (30 chars) | Personal AI fitness coach, recovery scores, physique & workout tracking. (80 chars) |
| **Primary Category** | Health & Fitness | Health & Fitness |
| **Secondary Category** | Sports | Sports |
| **Copyright** | © 2026 Rooka APP | N/A |
| **Content Rating** | 12+ (Infrequent/Mild Health/Medical Information) | Everyone / PEGI 3 (IARC Questionnaire) |

---

## 2. Keywords (Apple App Store - Max 100 Characters)

```text
fitness,workout,recovery,ai coach,strava,garmin,physique,body fat,gym,running,strength,health,calories
```

---

## 3. Full App Description (Apple & Google Play - Up to 4,000 Characters)

```text
Rooka is your intelligent AI fitness and recovery companion built to optimize your athletic performance, physique, and daily recovery.

Whether you are training for endurance, building muscle, or staying consistent, Rooka connects your workout activities with advanced AI insights to keep you accountable and performing at your peak.

KEY FEATURES:

• INTELLIGENT AI FITNESS COACH
Get instant answers, daily check-ins, and actionable training advice from your personal AI coach. Rooka learns your training habits, workout history, and recovery trends to deliver tailored suggestions.

• DAILY ROOKA RECOVERY SCORE
Track your body's readiness before every workout. Rooka evaluates your training load, volume, intensity, and recovery indicators to give you a clear daily Rooka Score.

• THIRD-PARTY WORKOUT SYNC (STRAVA & GARMIN)
Seamlessly connect your favorite fitness platforms. Import activities from Strava and Garmin Connect automatically to centralize your training data in one beautiful dashboard.

• PHYSIQUE & BODY COMPOSITION METRICS
Monitor your physical transformation over time. Log weight, body fat percentage, and physique progress photos with privacy-first storage.

• GAMIFICATION & STREAKS
Stay motivated with streak counters, level progression, and workout achievements designed to keep you moving every single day.

IMPORTANT DISCLAIMER:
Rooka is intended for general fitness, wellness, and educational purposes only. Rooka is not a medical device and does not provide medical diagnoses, treatment, or clinical advice. Always consult a physician before beginning any new exercise routine.

Terms of Service: https://rooka.io/terms
Privacy Policy: https://rooka.io/privacy
```

---

## 4. App Privacy Declarations (Apple Nutrition Labels)

When completing the **App Privacy** section in App Store Connect:

| Data Type | Collected? | Linked to User? | Used for Tracking? | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Contact Info** (Email, Name) | Yes | Yes | No | Account Setup, App Functionality |
| **Health & Fitness** (Workouts, Body Weight, Heart Rate) | Yes | Yes | No | Core App Functionality, Analytics |
| **User Content** (Chat messages, Photos) | Yes | Yes | No | Core App Functionality (AI Coach & Physique) |
| **Identifiers** (User ID, Device ID) | Yes | Yes | No | Account Management & App Security |
| **Diagnostics** (Crash data, performance) | Yes | No | No | App Performance & Bug Fixing |

---

## 5. Google Play Data Safety Form Declarations

When completing the **Data Safety** section in Google Play Console:

1. **Does your app collect or share any of the required user data types?** -> `Yes`
2. **Is all user data collected by your app encrypted in transit?** -> `Yes` (HTTPS/TLS)
3. **Do you provide a way for users to request that their data be deleted?** -> `Yes` (In-App + URL `https://rooka.io/privacy`)
4. **Data Types Selected:**
   - **Personal info:** Name, Email address, User IDs.
   - **Health and fitness:** Fitness info (Workouts, activities), Health info (Heart rate, recovery, physical metrics).
   - **Photos and videos:** Photos (Physique photos).
   - **Messages:** Other in-app messages (AI Coach queries).
   - **App info and performance:** Crash logs, Diagnostics.

---

## 6. App Reviewer Notes & Credentials (For Apple & Google Testers)

> **CRITICAL:** Apple and Google reviewers WILL reject the app if they cannot log in and test all features (including AI chat and Strava/Garmin connection screens).

Provide the following in **App Review Information / Test Credentials**:

```text
Demo Credentials for Reviewer:
Username/Email: reviewer-test@rooka.io
Password: [GENERATE_SECURE_DEMO_PASSWORD]

Notes for Reviewer:
- Rooka is an AI fitness & recovery tracking app.
- The demo account includes pre-loaded sample workouts, a sample recovery score, and sample physique metrics so you can test all screens immediately.
- To test the AI coach, navigate to the "Coach" tab and send any fitness query.
- Account deletion can be tested directly under Settings > Account > Delete Account.
```
