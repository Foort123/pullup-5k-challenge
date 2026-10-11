const assert = require('assert');

// 1. Plan array (sums to exactly 5,000)
const INITIAL_TARGETS = [
  150, 160, 180, 100, 180, 160, 100, 180, 200, 100,
  200, 180, 100, 200, 220, 200, 100, 200, 220, 100,
  220, 200, 100, 220, 200, 100, 220, 200, 100, 210
];

const TOTAL_GOAL = INITIAL_TARGETS.reduce((a, b) => a + b, 0);

console.log('--- TEST 1: Initial Sum Verification ---');
console.log('Initial Sum:', TOTAL_GOAL);
assert.strictEqual(TOTAL_GOAL, 5000, 'Initial sum must be exactly 5,000');
assert.strictEqual(INITIAL_TARGETS.length, 30, 'Must have exactly 30 days');

let state = {
  days: INITIAL_TARGETS.map((target, idx) => ({
    day: idx + 1,
    target: target,
    originalTarget: target,
    completed: false,
    shortfall: null
  })),
  history: []
};

function calculateStats() {
  let completedReps = 0;
  let completedDaysCount = 0;
  let totalTargetsSum = 0;

  state.days.forEach(d => {
    totalTargetsSum += d.target;
    if (d.completed) {
      completedReps += d.target;
      completedDaysCount++;
    }
  });

  const remainingReps = Math.max(0, TOTAL_GOAL - completedReps);
  const remainingDays = 30 - completedDaysCount;
  const percentage = TOTAL_GOAL > 0 ? (completedReps / TOTAL_GOAL) * 100 : 0;
  const avgRepsRemaining = remainingDays > 0 ? (remainingReps / remainingDays).toFixed(1) : '0';
  const firstUncompletedIndex = state.days.findIndex(d => !d.completed);

  return {
    completedReps,
    completedDaysCount,
    remainingReps,
    remainingDays,
    totalTargetsSum,
    percentage,
    avgRepsRemaining,
    firstUncompletedIndex
  };
}

function applyShortfallRollover(shortfall) {
  const stats = calculateStats();
  const firstIdx = stats.firstUncompletedIndex;

  if (firstIdx === -1) {
    return { success: false, error: 'Все дни уже отмечены как выполненные.' };
  }

  const day = state.days[firstIdx];
  const dayNum = day.day;
  const currentTarget = day.target;

  if (isNaN(shortfall) || shortfall < 1) {
    return { success: false, error: 'Укажите положительное число повторов недобора.' };
  }

  if (shortfall >= currentTarget) {
    return {
      success: false,
      error: `Недобор (${shortfall}) превышает цель текущего дня (${currentTarget}).`
    };
  }

  const otherUncompleted = state.days.filter(d => !d.completed && d.day !== dayNum);
  const m = otherUncompleted.length;

  if (m === 0) {
    return {
      success: false,
      error: 'Не осталось других незавершённых дней для распределения повторов.'
    };
  }

  day.target = currentTarget - shortfall;
  day.completed = true;
  day.shortfall = shortfall;

  const baseAdd = Math.floor(shortfall / m);
  const remainder = shortfall % m;

  for (let k = 0; k < m; k++) {
    const extra = baseAdd + (k < remainder ? 1 : 0);
    otherUncompleted[k].target += extra;
  }

  state.history.push({
    date: new Date().toISOString(),
    day: dayNum,
    shortfall: shortfall,
    distributedToCount: m,
    baseAdd: baseAdd,
    remainder: remainder
  });

  return {
    success: true,
    dayNum: dayNum,
    actualDone: day.target,
    distributedCount: m,
    baseAdd: baseAdd,
    remainder: remainder
  };
}

function resetSpecificDay(dayNum) {
  const day = state.days.find(d => d.day === dayNum);
  if (!day) return { success: false, error: 'День не найден.' };

  if (!day.completed && day.target === day.originalTarget && !day.shortfall) {
    return { success: false, error: `День ${dayNum} уже находится в исходном состоянии.` };
  }

  const diff = day.target - day.originalTarget;

  let otherUncompleted = state.days.filter(d => !d.completed && d.day !== dayNum);
  if (otherUncompleted.length === 0) {
    otherUncompleted = state.days.filter(d => d.day !== dayNum);
  }
  const m = otherUncompleted.length;

  if (m > 0 && diff !== 0) {
    if (diff < 0) {
      const needed = Math.abs(diff);
      const baseSub = Math.floor(needed / m);
      const remSub = needed % m;
      for (let k = 0; k < m; k++) {
        otherUncompleted[k].target -= (baseSub + (k < remSub ? 1 : 0));
      }
    } else {
      const extra = diff;
      const baseAdd = Math.floor(extra / m);
      const remAdd = extra % m;
      for (let k = 0; k < m; k++) {
        otherUncompleted[k].target += (baseAdd + (k < remAdd ? 1 : 0));
      }
    }
  }

  day.target = day.originalTarget;
  day.completed = false;
  day.shortfall = null;

  let currentTotal = state.days.reduce((acc, d) => acc + d.target, 0);
  if (currentTotal !== TOTAL_GOAL && otherUncompleted.length > 0) {
    const discrepancy = TOTAL_GOAL - currentTotal;
    otherUncompleted[0].target += discrepancy;
  }

  return { success: true, dayNum };
}

console.log('--- TEST 2: Initial Stats ---');
let stats = calculateStats();
assert.strictEqual(stats.completedReps, 0);
assert.strictEqual(stats.remainingReps, 5000);
assert.strictEqual(stats.completedDaysCount, 0);
assert.strictEqual(stats.firstUncompletedIndex, 0);
console.log('Initial stats pass!');

console.log('--- TEST 3: Toggle Day 1 ---');
state.days[0].completed = true;
stats = calculateStats();
assert.strictEqual(stats.completedReps, 150);
assert.strictEqual(stats.remainingReps, 5000 - 150);
assert.strictEqual(stats.completedDaysCount, 1);
assert.strictEqual(stats.firstUncompletedIndex, 1);
console.log('Day 1 completion pass!');

console.log('--- TEST 4: Rollover Shortfall on Day 2 ---');
// Day 2 target is 160. Shortfall = 20 -> actualDone = 140
const res = applyShortfallRollover(20);
assert.strictEqual(res.success, true);
assert.strictEqual(res.actualDone, 140);
assert.strictEqual(state.days[1].completed, true);
assert.strictEqual(state.days[1].target, 140);

stats = calculateStats();
assert.strictEqual(stats.totalTargetsSum, 5000, 'Total targets sum MUST remain 5,000!');
assert.strictEqual(stats.completedReps, 150 + 140, 'Completed reps must equal 290');
assert.strictEqual(stats.completedDaysCount, 2);
console.log('Rollover execution and sum integrity pass!');

console.log('--- TEST 5: Reset Specific Day (Day 2 with shortfall) ---');
const resetRes = resetSpecificDay(2);
assert.strictEqual(resetRes.success, true);
assert.strictEqual(state.days[1].target, 160, 'Day 2 target must be restored to 160');
assert.strictEqual(state.days[1].completed, false, 'Day 2 completed must be false');
assert.strictEqual(state.days[1].shortfall, null, 'Day 2 shortfall must be null');

stats = calculateStats();
assert.strictEqual(stats.totalTargetsSum, 5000, 'Total targets sum MUST remain 5,000 after specific day reset!');
assert.strictEqual(stats.completedReps, 150, 'Only Day 1 should remain completed');
assert.strictEqual(stats.completedDaysCount, 1);
console.log('Reset specific day passes with 5,000 sum integrity!');

console.log('--- TEST 6: Reset Specific Day (Day 1 normal completion) ---');
const resetDay1Res = resetSpecificDay(1);
assert.strictEqual(resetDay1Res.success, true);
assert.strictEqual(state.days[0].completed, false);
stats = calculateStats();
assert.strictEqual(stats.completedReps, 0);
assert.strictEqual(stats.totalTargetsSum, 5000);
console.log('Reset day 1 normal completion passes!');

console.log('All tests passed successfully!');
