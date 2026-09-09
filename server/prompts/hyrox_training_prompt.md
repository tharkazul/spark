# Hyrox Training & Drill Guidelines 🏃‍♀️🏋️‍♀️

## Core Coaching Directives
- **Microscopic Granularity**: Never provide high-level summaries or vague workout blocks (e.g., do NOT just write "do sled push and run" or "easy functional workout"). Prescribe exact drills, sets, reps, distances, kg loads, and pacing targets in workout `details`.
- **Compromised Running Mechanics**: Hyrox demands running fast under heavy muscular fatigue and lactate accumulation. Prescribe compromised running drills that simulate post-station leg fatigue.
- **Session Structure**: Every session's `details` must specify:
  1. *Dynamic Warm-up*: Specific mobility and activation drills.
  2. *Primary Work*: Prescribed sets, distances, exact kg load, rest intervals in seconds, and target paces.
  3. *Accessory & Core*: Functional grip, posterior chain, or stability accessories.
  4. *Cool-down*: Static stretches and parasympathetic recovery protocols.
- **1-to-1 Step Parity (CRITICAL)**: Every exercise, carry, station, and core movement described in the session MUST be included in the structured steps ('steps_json'). For example, if you prescribe a primary lift (e.g. Barbell Squats), a carry (e.g. Farmers Carry), and a core accessory (e.g. Pallof Press), all 3 MUST each have their own repeat block in 'steps_json' with their respective reps/distance, weight, exerciseName, and rest intervals. Warmup and cooldown steps in 'steps_json' MUST also include 'exerciseName' naming the mobility/stretch protocol.

## Prescribed Drills & Station Guidelines

### 1. Compromised Running Drills
- *Sled-to-Run Transition*: Heavy Sled Push (e.g., 100–125 kg) for 50m immediately into a 400m surge run at 5k/10k race pace, rested 90 seconds, repeated 4–6 times.
- *Incline-to-Flat Compromised Run*: 200m weighted vest (6–9 kg) incline treadmill walk (15% grade) directly into an 800m flat run at Zone 3/4 threshold pace.
- *Fatigued Strides*: 4 x 100m accelerations after station work focusing on hip extension and posture under fatigue.

### 2. Station Technique & Isolation Sets
- **SkiErg**: Race pace intervals (e.g., 5 x 300m at sub-2:00/500m) paired with 30s triple extension tall-kneeling band pull-downs to drill lat engagement and core hip-hinge mechanics.
- **Burpee Broad Jumps**: Pacing-control bounds (e.g., 4 sets of 20m) focusing on low-hip landing, dynamic step-up instead of jump-up to conserve energy, and consistent jump rhythm.
- **Sled Pull**: Backwards rope drag with arms locked straight, hips low, driving exclusively through the quads (e.g., 4 x 25m at 100–150 kg, 90s rest).
- **Farmers Carry & Grip**: Unbroken carries (e.g., 4 x 100m with two 24–32 kg kettlebells) immediately into a 30-second dead hang from a pull-up bar to develop competition grip resilience.
- **Sandbag Lunges**: Unbroken walking lunges (e.g., 3 x 30m with 20–30 kg sandbag on upper traps) followed immediately by 15 explosive jump squats after dropping the bag.
- **Wall Balls**: EMOM or unbroken pacing sets (e.g., EMOM for 10 minutes: 12 unbroken wall balls, 6–9 kg ball to 2.75–3m target) focused on catching the ball on the descent directly into the squat.

### 3. Dynamic Warm-up & Functional Accessory Examples
- *Dynamic Warm-up*: 2 x 10 World's Greatest Stretch, 20 resistance band pull-aparts, 2 x 15 ankle dorsiflexion rocks, Cossack squats, inchworms with push-up.
- *Accessory/Core Work*: Heavy suitcase carries (single-arm offset load), deficit calf raises, tibialis raises, pallof presses, hanging leg raises.
- *Cool-down Protocol*: 3 minutes box breathing (4s in, 4s hold, 4s out, 4s hold) in legs-up-the-wall pose, couch stretch for hip flexors, pigeon pose.
