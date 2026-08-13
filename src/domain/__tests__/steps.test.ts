import {
  parseStepsJson,
  serializeStepsJson,
  createStep,
  addStep,
  updateStep,
  removeStep,
  duplicateStep,
} from '../steps';
import { WorkoutStep } from '../../types/plan';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runStepsTests() {
  console.log('[Steps Unit Tests] Running tests...');

  // Test 1: Empty and invalid inputs
  assert(parseStepsJson(null).length === 0, 'Null input should return empty array');
  assert(parseStepsJson('[]').length === 0, 'Empty JSON array string should return empty array');
  assert(parseStepsJson('invalid json').length === 0, 'Invalid JSON string should return empty array');

  // Test 2: Parsing valid JSON string with repeat block & assigning IDs recursively
  const jsonStr = JSON.stringify([
    { type: 'warmup', condition_type: 'time', condition_value: 10, target_type: 'no.target' },
    {
      type: 'repeat',
      iterations: 4,
      steps: [
        { type: 'interval', condition_type: 'time', condition_value: 3, target_type: 'heart.rate.zone', zone: 4 },
        { type: 'recovery', condition_type: 'time', condition_value: 1, target_type: 'heart.rate.zone', zone: 1 },
      ],
    },
  ]);

  const parsed = parseStepsJson(jsonStr);
  assert(parsed.length === 2, 'Parsed steps length should be 2');
  assert(typeof parsed[0].id === 'string' && parsed[0].id.length > 0, 'Step 0 should have an assigned ID');
  assert(typeof parsed[1].id === 'string' && parsed[1].id.length > 0, 'Repeat step 1 should have an assigned ID');
  assert(Array.isArray(parsed[1].steps) && parsed[1].steps.length === 2, 'Repeat block should contain 2 child steps');
  assert(typeof parsed[1].steps![0].id === 'string', 'Child step 0 in repeat block should have an assigned ID');
  assert(typeof parsed[1].steps![1].id === 'string', 'Child step 1 in repeat block should have an assigned ID');

  // Test 3: Round-trip serialization
  const serialized = serializeStepsJson(parsed);
  assert(typeof serialized === 'string', 'Serialized output should be a string');
  const roundTripped = parseStepsJson(serialized);
  assert(roundTripped.length === 2, 'Round-tripped steps length should match original');

  // Test 4: Creating repeat step and tree manipulation
  const repeatStep = createStep('repeat');
  assert(repeatStep.type === 'repeat', 'createStep should create repeat type');
  assert(repeatStep.iterations === 4, 'createStep repeat iterations should default to 4');
  assert(Array.isArray(repeatStep.steps) && repeatStep.steps.length === 2, 'createStep repeat should have 2 children');

  let stepsList = parseStepsJson(jsonStr);
  const newChild = createStep('interval', { condition_value: 5 });
  const repeatParentId = stepsList[1].id!;

  stepsList = addStep(stepsList, newChild, repeatParentId);
  assert(stepsList[1].steps!.length === 3, 'addStep should add child to repeat block');

  const targetChildId = stepsList[1].steps![0].id!;
  stepsList = updateStep(stepsList, targetChildId, { condition_value: 99 });
  assert(stepsList[1].steps![0].condition_value === 99, 'updateStep should update nested child property');

  stepsList = duplicateStep(stepsList, targetChildId);
  assert(stepsList[1].steps!.length === 4, 'duplicateStep should duplicate target child inside repeat block');

  stepsList = removeStep(stepsList, targetChildId);
  assert(stepsList[1].steps!.length === 3, 'removeStep should remove target child');

  console.log('[Steps Unit Tests] All Steps tests passed successfully!');
}

if (typeof require !== 'undefined' && require.main === module) {
  runStepsTests();
}
