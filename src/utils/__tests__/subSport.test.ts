// Ball and racket sports get their own medallion from the title or sport type.
// Run: npx sucrase-node src/utils/__tests__/subSport.test.ts
import assert from 'assert';

// disciplineConfig requires PNGs; stub require for images outside Metro.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request: string, ...rest: any[]) {
  if (/\.png$/.test(request)) return request;
  if (request === 'react-native') return {};
  if (request.endsWith('constants/theme')) return { sportColor: () => '#000' };
  return origLoad.call(this, request, ...rest);
};
const { detectSubSport } = require('../disciplineConfig');

const cases: [string | undefined, string | undefined, string | null][] = [
  ['Run', 'Hockey training', 'HOCKEY'],
  ['Run', 'Hockey', 'HOCKEY'],
  ['Run', 'Wedstrijd voetbal', 'FOOTBALL'],
  ['Run', 'Padel met vrienden', 'PADEL'],
  ['Run', 'Tennis les', 'TENNIS'],
  ['Run', 'Tafeltennis', null],
  ['Run', 'Easy run', null],
  ['Soccer', 'Evening match', 'FOOTBALL'],
  ['Tennis', undefined, 'TENNIS'],
  ['Workout', 'Basketball pickup', 'BASKETBALL'],
  ['Cardio', 'Beach volleyball', 'VOLLEYBALL'],
  ['Walk', '9 holes golf', 'GOLF'],
  ['Strength', 'Gym for hockey', null],
  ['WeightTraining', 'Rugby strength', null],
  ['Bike', 'Spinning before hockey', null],
  ['Swim', 'Golfslag', null],
  ['Rest', 'Hockey tomorrow', null],
  [undefined, undefined, null],
];
for (const [sport, title, want] of cases) {
  assert.strictEqual(detectSubSport(sport, title), want, `${sport} / ${title}`);
}
console.log(`✅ ${cases.length} sub-sport cases`);
