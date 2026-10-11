/**
 * 5,000 PULL-UPS CHALLENGE — APPLICATION LOGIC
 * Dark Monochrome + Warm Ivory Edition (Single "Сделал фактически" input)
 */

// 1. Initial 30-day target plan
const INITIAL_TARGETS = [
  150, 160, 180, 100, 180, 160, 100, 180, 200, 100,
  200, 180, 100, 200, 220, 200, 100, 200, 220, 100,
  220, 200, 100, 220, 200, 100, 220, 200, 100, 210
];

const TOTAL_GOAL = INITIAL_TARGETS.reduce((a, b) => a + b, 0);
const STORAGE_KEY = 'pullup_challenge_v3';
const USERS_STORAGE_KEY = 'pullup_users_db_v1';
const ACTIVE_USER_KEY = 'pullup_active_user_id';
const DEFAULT_FIREBASE_URL = 'https://pullups-10k-default-rtdb.firebaseio.com';
const CLOUD_URL_KEY = 'pullup_cloud_url';

// 17 Ranks / Statuses System (1..17 from Beginner to Legend 5,000)
const USER_RANKS = [
  { level: 1, minReps: 0, title: 'Начинающий', colorClass: 'rank-color-green', colorHex: '#4ADE80' },
  { level: 2, minReps: 150, title: 'Новичок', colorClass: 'rank-color-green', colorHex: '#4ADE80' },
  { level: 3, minReps: 300, title: 'Любитель', colorClass: 'rank-color-green', colorHex: '#4ADE80' },
  { level: 4, minReps: 500, title: 'Практик', colorClass: 'rank-color-green', colorHex: '#4ADE80' },
  { level: 5, minReps: 850, title: 'Энтузиаст', colorClass: 'rank-color-yellow', colorHex: '#FACC15' },
  { level: 6, minReps: 1200, title: 'Атлет', colorClass: 'rank-color-yellow', colorHex: '#FACC15' },
  { level: 7, minReps: 1550, title: 'Крепыш', colorClass: 'rank-color-yellow', colorHex: '#FACC15' },
  { level: 8, minReps: 2000, title: 'Турникмен', colorClass: 'rank-color-yellow', colorHex: '#FACC15' },
  { level: 9, minReps: 2500, title: 'Экватор силы', colorClass: 'rank-color-orange', colorHex: '#FB923C' },
  { level: 10, minReps: 2900, title: 'Штурмовик', colorClass: 'rank-color-orange', colorHex: '#FB923C' },
  { level: 11, minReps: 3300, title: 'Стальной хват', colorClass: 'rank-color-orange', colorHex: '#FB923C' },
  { level: 12, minReps: 3700, title: 'Мастер перекладины', colorClass: 'rank-color-orange', colorHex: '#FB923C' },
  { level: 13, minReps: 4100, title: 'Гладиатор', colorClass: 'rank-color-orange', colorHex: '#FB923C' },
  { level: 14, minReps: 4500, title: 'Титан', colorClass: 'rank-color-red', colorHex: '#EF4444' },
  { level: 15, minReps: 4700, title: 'Железный монстр', colorClass: 'rank-color-red', colorHex: '#EF4444' },
  { level: 16, minReps: 4850, title: 'Властелин гравитации', colorClass: 'rank-color-red', colorHex: '#EF4444' },
  { level: 17, minReps: 5000, title: 'Легенда 5 000', colorClass: 'rank-color-red', colorHex: '#EF4444' }
];

function getUserRank(completedReps) {
  const reps = Math.max(0, completedReps || 0);
  let currentRank = USER_RANKS[0];
  for (let i = USER_RANKS.length - 1; i >= 0; i--) {
    if (reps >= USER_RANKS[i].minReps) {
      currentRank = USER_RANKS[i];
      break;
    }
  }
  const nextRank = USER_RANKS.find(r => r.level === currentRank.level + 1) || null;
  const repsToNext = nextRank ? Math.max(0, nextRank.minReps - reps) : 0;
  return {
    ...currentRank,
    nextRank,
    repsToNext
  };
}

function renderRankBadge(rank, size = 'normal') {
  return `
    <span class="user-rank-badge ${rank.colorClass} ${size === 'large' ? 'rank-badge-large' : ''}">
      <span class="rank-circle-num">${rank.level}</span>
      <span class="rank-title">${escapeHtml(rank.title)}</span>
    </span>
  `;
}

function checkRankLevelUp(oldReps, newReps) {
  const oldRank = getUserRank(oldReps);
  const newRank = getUserRank(newReps);
  if (newRank.level > oldRank.level) {
    showToast(`🎉 Поздравляем! Получен статус ${newRank.level} «${newRank.title}»!`, 'success');
    triggerConfetti();
  }
}

// State definition
let state = {
  days: [], // Array of { day: 1..30, target: number, originalTarget: number, completed: boolean, shortfall: number | null }
  history: [] // Record of rollovers
};

let currentFilter = 'all';
let activeModalDay = null; // Currently selected day for rollover pop-up

function playSuccessChime() {}
function playVictoryFanfare() {}

// ==========================================================================
// Authentication & Multi-User Helpers
// ==========================================================================

function getAllUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading users db:', e);
  }
  return [];
}

function saveAllUsers(users) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Error saving users db:', e);
  }
}

function getActiveUserId() {
  try {
    return localStorage.getItem(ACTIVE_USER_KEY) || null;
  } catch (e) {
    return null;
  }
}

function setActiveUserId(userId) {
  try {
    if (userId) {
      localStorage.setItem(ACTIVE_USER_KEY, userId);
    } else {
      localStorage.removeItem(ACTIVE_USER_KEY);
    }
  } catch (e) {
    console.error('Error setting active user id:', e);
  }
}

function getActiveUser() {
  const activeId = getActiveUserId();
  if (!activeId) return null;
  const users = getAllUsers();
  return users.find(u => u.id === activeId) || null;
}

async function hashPassword(password) {
  const salt = '_salt_pullup10k_';
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const enc = new TextEncoder();
      const data = enc.encode(password + salt);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('Subtle crypto failed, using fallback hash:', e);
    }
  }
  let hash = 5381;
  const str = password + salt;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(16);
}

function getCloudDbUrl() {
  try {
    const custom = localStorage.getItem(CLOUD_URL_KEY);
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  } catch (e) {}
  return DEFAULT_FIREBASE_URL;
}

async function getCloudUserKey(username) {
  const clean = (username || '').trim().toLowerCase();
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const enc = new TextEncoder();
      const data = enc.encode('usr_key_' + clean);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return 'u_' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    } catch (e) {}
  }
  let hash = 5381;
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) + hash) + clean.charCodeAt(i);
    hash |= 0;
  }
  return 'u_' + Math.abs(hash).toString(16);
}

async function fetchCloudUser(userKey) {
  try {
    const base = getCloudDbUrl();
    if (!base) return null;
    const res = await fetch(`${base}/users/${encodeURIComponent(userKey)}.json`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('fetchCloudUser error:', err);
    return null;
  }
}

async function saveCloudUserRecord(record) {
  try {
    const base = getCloudDbUrl();
    if (!base || !record || !record.id) return false;
    const res = await fetch(`${base}/users/${encodeURIComponent(record.id)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    return res.ok;
  } catch (err) {
    console.warn('saveCloudUserRecord error:', err);
    return false;
  }
}

async function patchCloudUserState(userKey, challengeState) {
  try {
    const base = getCloudDbUrl();
    if (!base || !userKey) return false;
    const res = await fetch(`${base}/users/${encodeURIComponent(userKey)}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        challengeState: challengeState
      })
    });
    return res.ok;
  } catch (err) {
    console.warn('patchCloudUserState error:', err);
    return false;
  }
}

let lastCloudCheckTime = 0;
async function checkCloudUpdatesForActiveUser(force = false) {
  const activeUser = getActiveUser();
  if (!activeUser) return;

  const now = Date.now();
  if (!force && now - lastCloudCheckTime < 8000) return;
  lastCloudCheckTime = now;

  try {
    const cloudUser = await fetchCloudUser(activeUser.id);
    if (!cloudUser || !cloudUser.challengeState || !Array.isArray(cloudUser.challengeState.days)) return;

    const currentStr = JSON.stringify(state.days);
    const cloudStr = JSON.stringify(cloudUser.challengeState.days);

    if (currentStr !== cloudStr) {
      state = JSON.parse(JSON.stringify(cloudUser.challengeState));
      saveState(false);
      render();
      showToast('Синхронизировано: данные обновлены с облака', 'info');
    }
  } catch (err) {
    console.warn('checkCloudUpdatesForActiveUser error:', err);
  }
}

function getUserInitials(name) {
  if (!name) return 'П';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, Math.min(2, name.length)).toUpperCase();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================================================
// Initialization & Persistence
// ==========================================================================

function initApp() {
  checkForUrlSync();
  loadState();
  setupEventListeners();
  setupAuthEventListeners();
  setupSyncEventListeners();
  updateAuthHeaderUI();
  updateCloudStatusUI();
  render();
  checkCloudUpdatesForActiveUser(true);

  if (!getActiveUser()) {
    openAuthModal('register', true);
  }

  window.addEventListener('focus', () => checkCloudUpdatesForActiveUser(false));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkCloudUpdatesForActiveUser(false);
  });
}

function getDefaultState() {
  return {
    days: INITIAL_TARGETS.map((target, idx) => ({
      day: idx + 1,
      target: target,
      originalTarget: target,
      completed: false,
      shortfall: null
    })),
    history: []
  };
}

function loadState() {
  try {
    const activeUser = getActiveUser();
    if (activeUser && activeUser.challengeState) {
      const parsed = activeUser.challengeState;
      if (parsed && Array.isArray(parsed.days) && parsed.days.length === 30) {
        const matchesPlan = parsed.days.every((d, i) => d.originalTarget === INITIAL_TARGETS[i]);
        if (matchesPlan) {
          state = parsed;
          return;
        }
      }
    } else if (!activeUser) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.days) && parsed.days.length === 30) {
          const matchesPlan = parsed.days.every((d, i) => d.originalTarget === INITIAL_TARGETS[i]);
          if (matchesPlan) {
            state = parsed;
            return;
          }
        }
      }
    }
  } catch (err) {
    console.error('Error loading saved state:', err);
  }
  state = getDefaultState();
  saveState();
}

function saveState(triggerCloud = true) {
  try {
    const activeUser = getActiveUser();
    if (activeUser) {
      const users = getAllUsers();
      const idx = users.findIndex(u => u.id === activeUser.id);
      if (idx !== -1) {
        users[idx].challengeState = JSON.parse(JSON.stringify(state));
        users[idx].updatedAt = new Date().toISOString();
        saveAllUsers(users);
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const storageStatus = document.getElementById('storage-status');
    if (storageStatus) {
      storageStatus.textContent = 'Сохранено (' + new Date().toLocaleTimeString() + ')';
    }
    if (triggerCloud) {
      syncToCloudAsync();
    }
  } catch (err) {
    console.error('Error saving state:', err);
  }
}

// ==========================================================================
// Calculations & Core Logic
// ==========================================================================

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

/**
 * Toggles a day's completion status.
 */
function toggleDay(dayNumber) {
  if (!getActiveUser()) {
    openAuthModal('register', true);
    showToast('Для отметки дней необходимо зарегистрироваться или войти', 'info');
    return;
  }

  const oldReps = calculateStats().completedReps;
  const day = state.days.find(d => d.day === dayNumber);
  if (!day) return;

  day.completed = !day.completed;
  
  if (day.completed) {
    playSuccessChime();
    const stats = calculateStats();
    if (stats.completedReps >= TOTAL_GOAL) {
      triggerConfetti();
      playVictoryFanfare();
      showToast(`Поздравляем! Цель в ${TOTAL_GOAL.toLocaleString('ru-RU')} подтягиваний выполнена!`, 'success');
    } else {
      showToast(`День ${day.day} завершён (+${day.target} в зачёт)`, 'success');
    }
  } else {
    showToast(`День ${day.day}: отметка снята`, 'info');
  }

  saveState();
  render();

  const newReps = calculateStats().completedReps;
  checkRankLevelUp(oldReps, newReps);
}

/**
 * Shortfall rollover logic for first uncompleted day (Hero card)
 */
function applyShortfallRollover(shortfall) {
  const stats = calculateStats();
  const firstIdx = stats.firstUncompletedIndex;

  if (firstIdx === -1) {
    return { success: false, error: 'Все 30 дней уже завершены.' };
  }

  return applyShortfallForSpecificDay(state.days[firstIdx].day, shortfall);
}

/**
 * Shortfall rollover for any specific uncompleted day (Modal pop-up / pencil)
 */
function applyShortfallForSpecificDay(dayNum, shortfall) {
  if (!getActiveUser()) {
    openAuthModal('register', true);
    showToast('Для переноса недобора необходимо зарегистрироваться или войти', 'info');
    return { success: false, error: 'Требуется регистрация' };
  }

  const day = state.days.find(d => d.day === dayNum);
  if (!day) return { success: false, error: 'День не найден.' };
  if (day.completed) return { success: false, error: 'Этот день уже выполнен.' };

  if (!Number.isInteger(shortfall) || shortfall <= 0) {
    return { success: false, error: 'Введите корректное число повторов.' };
  }

  if (shortfall > day.target) {
    return { 
      success: false, 
      error: `Недобор (${shortfall}) превышает цель текущего дня (${day.target}).` 
    };
  }

  // Identify all other uncompleted days
  const otherUncompleted = state.days.filter(d => !d.completed && d.day !== dayNum);
  const m = otherUncompleted.length;

  if (m === 0) {
    return { 
      success: false, 
      error: 'Нет других незавершённых дней, на которые можно перенести повторы.' 
    };
  }

  const baseAdd = Math.floor(shortfall / m);
  const remainder = shortfall % m;

  const oldReps = calculateStats().completedReps;

  // Decrease target & mark completed
  day.target -= shortfall;
  day.completed = true;
  day.shortfall = (day.shortfall || 0) + shortfall;

  // Distribute shortfall evenly over remaining uncompleted days
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

  saveState();
  playSuccessChime();
  triggerConfetti();

  const newReps = calculateStats().completedReps;
  checkRankLevelUp(oldReps, newReps);

  return {
    success: true,
    dayNum: dayNum,
    actualDone: day.target,
    distributedCount: m,
    baseAdd: baseAdd,
    remainder: remainder
  };
}

// ==========================================================================
// Reset: Reset All or Specific Day
// ==========================================================================

function resetChallenge() {
  state = getDefaultState();
  saveState();
  render();
  showToast(`Все 30 дней сброшены к исходным целям (${TOTAL_GOAL.toLocaleString('ru-RU')})`, 'info');
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

  state.history = state.history.filter(h => h.day !== dayNum);

  const currentTotal = state.days.reduce((acc, d) => acc + d.target, 0);
  if (currentTotal !== TOTAL_GOAL && otherUncompleted.length > 0) {
    const discrepancy = TOTAL_GOAL - currentTotal;
    otherUncompleted[0].target += discrepancy;
  }

  saveState();
  render();
  return { success: true, dayNum };
}

let currentSelectedResetDay = 1;

function selectResetDayItem(dayNum) {
  const day = state.days.find(d => d.day === dayNum);
  if (!day) return;

  currentSelectedResetDay = dayNum;

  // Sync hidden select
  const select = document.getElementById('select-reset-day');
  if (select) select.value = dayNum;

  // Update Trigger UI
  const triggerDay = document.getElementById('dropdown-trigger-day');
  const triggerTarget = document.getElementById('dropdown-trigger-target');
  const triggerStatus = document.getElementById('dropdown-trigger-status');

  if (triggerDay) triggerDay.textContent = `День ${day.day}`;
  if (triggerTarget) triggerTarget.textContent = `${day.target} повт.`;

  if (triggerStatus) {
    triggerStatus.className = 'trigger-status-pill';
    if (day.completed) {
      triggerStatus.classList.add('status-completed');
      triggerStatus.textContent = 'Выполнен';
    } else if (day.shortfall) {
      triggerStatus.classList.add('status-modified');
      triggerStatus.textContent = `Недобор -${day.shortfall}`;
    } else if (day.target !== day.originalTarget) {
      const diff = day.target - day.originalTarget;
      triggerStatus.classList.add('status-modified');
      triggerStatus.textContent = diff > 0 ? `+${diff} повт.` : `${diff} повт.`;
    } else {
      triggerStatus.classList.add('status-pending');
      triggerStatus.textContent = 'В плане';
    }
  }

  // Update active state in dropdown menu items
  const menuItems = document.querySelectorAll('.custom-dropdown-item');
  menuItems.forEach(item => {
    const itemDay = parseInt(item.getAttribute('data-day'), 10);
    if (itemDay === dayNum) {
      item.classList.add('selected');
      if (!item.querySelector('.item-check')) {
        const rightContainer = item.querySelector('.item-right');
        if (rightContainer) {
          rightContainer.insertAdjacentHTML('beforeend', '<svg class="item-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>');
        }
      }
    } else {
      item.classList.remove('selected');
      const check = item.querySelector('.item-check');
      if (check) check.remove();
    }
  });

  // Update quickbar chips active state
  const chips = document.querySelectorAll('.quickbar-chip');
  chips.forEach(chip => {
    const chipDay = parseInt(chip.getAttribute('data-day'), 10);
    if (chipDay === dayNum) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  // Close dropdown menu
  closeCustomDropdown();
}

function openCustomDropdown() {
  const dropdown = document.getElementById('custom-day-dropdown');
  const menu = document.getElementById('custom-dropdown-menu');
  const trigger = document.getElementById('custom-dropdown-trigger');
  if (dropdown && menu) {
    dropdown.classList.add('open');
    menu.style.display = 'block';
    if (trigger) trigger.setAttribute('aria-expanded', 'true');

    // Scroll to selected item
    const selectedItem = menu.querySelector('.custom-dropdown-item.selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }
}

function closeCustomDropdown() {
  const dropdown = document.getElementById('custom-day-dropdown');
  const menu = document.getElementById('custom-dropdown-menu');
  const trigger = document.getElementById('custom-dropdown-trigger');
  if (dropdown && menu) {
    dropdown.classList.remove('open');
    menu.style.display = 'none';
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }
}

function toggleCustomDropdown() {
  const menu = document.getElementById('custom-dropdown-menu');
  if (menu && menu.style.display === 'block') {
    closeCustomDropdown();
  } else {
    openCustomDropdown();
  }
}

function populateResetDaySelect() {
  const select = document.getElementById('select-reset-day');
  const menu = document.getElementById('custom-dropdown-menu');
  const quickbar = document.getElementById('modified-days-quickbar');
  const chipsContainer = document.getElementById('modified-days-chips');

  if (select) select.innerHTML = '';
  if (menu) menu.innerHTML = '';
  if (chipsContainer) chipsContainer.innerHTML = '';

  let preferredDay = 1;
  const modifiedDays = [];

  state.days.forEach((d) => {
    // 1. Native hidden select option
    if (select) {
      const opt = document.createElement('option');
      opt.value = d.day;
      opt.textContent = `День ${d.day}`;
      select.appendChild(opt);
    }

    // Determine status info
    let statusClass = 'pending';
    let statusText = 'В плане';
    if (d.completed) {
      statusClass = 'completed';
      statusText = 'Выполнен';
      modifiedDays.push(d);
    } else if (d.shortfall) {
      statusClass = 'modified';
      statusText = `Недобор -${d.shortfall}`;
      modifiedDays.push(d);
    } else if (d.target !== d.originalTarget) {
      const diff = d.target - d.originalTarget;
      statusClass = 'modified';
      statusText = diff > 0 ? `+${diff} повт.` : `${diff} повт.`;
      modifiedDays.push(d);
    }

    if (modifiedDays.length > 0 && preferredDay === 1 && (d.completed || d.target !== d.originalTarget)) {
      preferredDay = d.day;
    }

    // 2. Custom menu item
    if (menu) {
      const item = document.createElement('div');
      item.className = 'custom-dropdown-item';
      item.setAttribute('data-day', d.day);
      item.setAttribute('role', 'option');
      item.innerHTML = `
        <div class="item-left">
          <span class="item-day">День ${d.day}</span>
          <span class="item-target">${d.target} повт.</span>
        </div>
        <div class="item-right">
          <span class="item-status-pill status-${statusClass}">${statusText}</span>
        </div>
      `;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectResetDayItem(d.day);
      });
      menu.appendChild(item);
    }
  });

  // 3. Render quickbar chips if any days have changes
  if (quickbar && chipsContainer) {
    if (modifiedDays.length > 0) {
      quickbar.style.display = 'flex';
      modifiedDays.forEach(d => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'quickbar-chip';
        chip.setAttribute('data-day', d.day);
        const tag = d.completed ? 'выполнен' : (d.target !== d.originalTarget ? 'изменён' : 'недобор');
        chip.textContent = `День ${d.day} (${tag})`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          selectResetDayItem(d.day);
        });
        chipsContainer.appendChild(chip);
      });
    } else {
      quickbar.style.display = 'none';
    }
  }

  // Pre-select preferred day
  selectResetDayItem(preferredDay);
}

// ==========================================================================
// Modal Window for Day Rollover (Triggered by Pencil Icon)
// ==========================================================================

function openDayRolloverModal(dayNumber) {
  if (!getActiveUser()) {
    openAuthModal('register', true);
    showToast('Для переноса недобора необходимо зарегистрироваться или войти', 'info');
    return;
  }

  const day = state.days.find(d => d.day === dayNumber);
  if (!day) return;

  if (day.completed) {
    showToast(`День ${dayNumber} уже отмечен выполненным. Чтобы перенести недобор, сначала снимите отметку.`, 'info');
    return;
  }

  activeModalDay = dayNumber;
  const modal = document.getElementById('modal-day-rollover');
  const title = document.getElementById('modal-rollover-title');
  const subtitle = document.getElementById('modal-rollover-subtitle');
  const actualInput = document.getElementById('modal-input-actual');
  const errorBox = document.getElementById('modal-rollover-error');

  title.textContent = `Перенос подтягиваний — День ${dayNumber}`;
  subtitle.textContent = `Текущая цель дня: ${day.target} повторений`;
  actualInput.value = '';
  errorBox.style.display = 'none';

  updateModalRolloverPreview();
  modal.style.display = 'flex';
  setTimeout(() => actualInput.focus(), 50);
}

function closeDayRolloverModal() {
  const modal = document.getElementById('modal-day-rollover');
  if (modal) modal.style.display = 'none';
  activeModalDay = null;
}

function updateModalRolloverPreview() {
  if (activeModalDay === null) return;
  const day = state.days.find(d => d.day === activeModalDay);
  if (!day) return;

  const summaryBox = document.getElementById('modal-rollover-summary');
  const actualInput = document.getElementById('modal-input-actual');
  const rawVal = actualInput ? actualInput.value.trim() : '';

  if (rawVal === '') {
    summaryBox.style.display = 'none';
    summaryBox.innerHTML = '';
    return;
  }

  const val = parseInt(rawVal, 10);
  if (isNaN(val) || val < 0) {
    summaryBox.style.display = 'none';
    summaryBox.innerHTML = '';
    return;
  }

  summaryBox.style.display = 'block';

  if (val > day.target) {
    summaryBox.innerHTML = `
      <div class="rollover-preview-info">
        <div style="color: var(--color-danger-text); font-size: 13px; line-height: 1.4;">
          Введено <strong>${val}</strong> повторений при цели <strong>${day.target}</strong>. Для переноса недобора укажите число меньше цели дня.
        </div>
      </div>
    `;
    return;
  }

  if (val === day.target) {
    summaryBox.innerHTML = `
      <div class="rollover-preview-info">
        <div class="preview-info-row">
          <span class="preview-info-label">Зачёт за День ${day.day}:</span>
          <span class="preview-info-value"><strong>${val}</strong> из ${day.target} повторений (100%)</span>
        </div>
        <div class="preview-distribution-note">
          Недобора нет. День будет закрыт полностью без изменений для других дней.
        </div>
      </div>
    `;
    return;
  }

  const otherUncompleted = state.days.filter(d => !d.completed && d.day !== activeModalDay);
  const m = otherUncompleted.length;

  const shortfall = day.target - val;
  if (m === 0) {
    summaryBox.innerHTML = `
      <div class="rollover-preview-info">
        <div style="color: var(--color-danger-text); font-size: 13px;">
          Нет других незавершённых дней для распределения повторений.
        </div>
      </div>
    `;
    return;
  }

  const baseAdd = Math.floor(shortfall / m);
  const remainder = shortfall % m;

  let distText = '';
  if (remainder === 0) {
    distText = `по <strong>+${baseAdd}</strong> на каждый день`;
  } else {
    distText = `по <strong>+${baseAdd}..+${baseAdd + 1}</strong> на день`;
  }

  const daysWord = plural(m, 'оставшийся день', 'оставшихся дня', 'оставшихся дней');

  summaryBox.innerHTML = `
    <div class="rollover-preview-info">
      <div class="preview-info-row">
        <span class="preview-info-label">Зачёт за День ${day.day}:</span>
        <span class="preview-info-value"><strong>${val}</strong> из ${day.target} повторений</span>
      </div>
      <div class="preview-info-row">
        <span class="preview-info-label">Недобор к переносу:</span>
        <span class="preview-info-value"><strong>${shortfall}</strong> повторений</span>
      </div>
      <div class="preview-distribution-note">
        Недобор перенесётся на <strong>${m}</strong> ${daysWord} (${distText}).
      </div>
    </div>
  `;
}

// ==========================================================================
// Copying & Export/Import
// ==========================================================================

function formatPlanText() {
  let text = 'План челленджа «5 000 подтягиваний»:\n\n';
  let total = 0;
  state.days.forEach(d => {
    let diff = '';
    if (d.target !== d.originalTarget) {
      const delta = d.target - d.originalTarget;
      diff = delta > 0 ? ` (+${delta})` : ` (${delta})`;
    }
    text += `День ${d.day}: ${d.target}${diff}\n`;
    total += d.target;
  });
  text += `\nИтого: ${total.toLocaleString('ru-RU')} подтягиваний`;
  return text;
}

function formatProgressText() {
  const stats = calculateStats();
  let text = 'Прогресс челленджа:\n';
  text += `Выполнено: ${stats.completedReps.toLocaleString('ru-RU')} / ${TOTAL_GOAL.toLocaleString('ru-RU')} (${stats.percentage.toFixed(1)}%)\n`;
  text += `Завершено дней: ${stats.completedDaysCount} из 30\n`;
  text += `Осталось: ${stats.remainingReps.toLocaleString('ru-RU')} подтягиваний\n`;
  text += `Среднее на оставшиеся дни: ${stats.avgRepsRemaining} повторов/день\n\n`;
  text += 'Состояние по дням:\n';

  state.days.forEach(d => {
    const mark = d.completed ? '[V]' : '[ ]';
    const statusText = d.completed ? 'выполнено' : 'ожидает';
    let notes = '';
    if (d.shortfall) {
      notes = `, недобор ${d.shortfall}`;
    } else if (d.target !== d.originalTarget) {
      const diff = d.target - d.originalTarget;
      notes = diff > 0 ? `, увеличена на +${diff}` : `, уменьшена на ${diff}`;
    }
    text += `${mark} День ${d.day}: ${d.target} (${statusText}${notes})\n`;
  });

  return text;
}

async function copyToClipboard(text, successMessage) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast(successMessage, 'success');
      return;
    }
  } catch (err) {
    console.warn('Clipboard API error, trying fallback', err);
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast(successMessage, 'success');
  } catch (err) {
    showToast('Не удалось скопировать данные в буфер', 'error');
  } finally {
    document.body.removeChild(textarea);
  }
}

function exportJSON() {
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'progress.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Файл progress.json успешно выгружен', 'success');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && Array.isArray(parsed.days) && parsed.days.length === 30) {
        state = parsed;
        saveState();
        render();
        showToast('Прогресс успешно импортирован', 'success');
      } else {
        showToast('Неверный формат файла progress.json', 'error');
      }
    } catch (err) {
      showToast('Ошибка при чтении JSON-файла', 'error');
    }
  };
  reader.readAsText(file);
}

// ==========================================================================
// 17 Ranks Modal System
// ==========================================================================

function openRanksModal() {
  const modal = document.getElementById('modal-ranks');
  if (!modal) return;
  renderRanksModalList();
  modal.style.display = 'flex';
}

function closeRanksModal() {
  const modal = document.getElementById('modal-ranks');
  if (modal) modal.style.display = 'none';
}

function renderRanksModalList() {
  const container = document.getElementById('ranks-grid-list');
  if (!container) return;
  const stats = calculateStats();
  const currentRank = getUserRank(stats.completedReps);

  container.innerHTML = USER_RANKS.map(rank => {
    const isActive = rank.level === currentRank.level;
    const isPassed = stats.completedReps >= rank.minReps && !isActive;

    return `
      <div class="rank-list-item ${isActive ? 'rank-item-active' : ''}">
        <div class="rank-item-left">
          <span class="user-rank-badge ${rank.colorClass}">
            <span class="rank-circle-num">${rank.level}</span>
            <span class="rank-title">${escapeHtml(rank.title)}</span>
          </span>
          <span class="rank-item-reps">
            ${rank.minReps === 0 ? 'Старт (0 повторов)' : `от ${rank.minReps.toLocaleString('ru-RU')} повторов`}
          </span>
        </div>
        <div>
          ${isActive ? '<span class="rank-active-badge">Ваш статус</span>' : (isPassed ? '<span class="rank-passed-check">✓</span>' : '')}
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================================
// UI Rendering
// ==========================================================================

function render() {
  const stats = calculateStats();

  // 1. Stats Counter updates
  document.getElementById('stat-completed').textContent = stats.completedReps.toLocaleString('ru-RU');
  document.getElementById('stat-remaining').textContent = stats.remainingReps.toLocaleString('ru-RU');
  document.getElementById('stat-days-done').textContent = `${stats.completedDaysCount} / 30`;
  const statPercentEl = document.getElementById('stat-percent');
  if (statPercentEl) {
    statPercentEl.textContent = `${stats.percentage.toFixed(1)}%`;
  }
  const todayTargetEl = document.getElementById('stat-today-target');
  if (todayTargetEl) {
    if (stats.firstUncompletedIndex !== -1) {
      const curDay = state.days[stats.firstUncompletedIndex];
      todayTargetEl.textContent = `${curDay.target} повторений`;
    } else {
      todayTargetEl.textContent = 'Выполнено';
    }
  }
  const avgRemainingEl = document.getElementById('stat-avg-remaining');
  if (avgRemainingEl) {
    avgRemainingEl.textContent = stats.avgRepsRemaining;
  }
  document.getElementById('stat-total-sum').textContent = stats.totalTargetsSum.toLocaleString('ru-RU');

  const totalTargetEl = document.getElementById('stat-total-target');
  if (totalTargetEl) {
    totalTargetEl.textContent = TOTAL_GOAL.toLocaleString('ru-RU');
  }

  // Linear progress bar
  document.getElementById('progress-bar-fill').style.width = `${Math.min(100, stats.percentage)}%`;

  // SVG Radial meter: circumference = 2 * Math.PI * 82 = 515.22
  const circumference = 515.22;
  const offset = circumference - (stats.percentage / 100) * circumference;
  const radialMeter = document.getElementById('radial-meter');
  if (radialMeter) {
    radialMeter.style.strokeDashoffset = offset;
  }

  // Active day badge & Rollover preview
  const activeDayBadge = document.getElementById('active-day-badge');
  const rolloverCurrentDay = document.getElementById('rollover-current-day');
  const rolloverCurrentTarget = document.getElementById('rollover-current-target');
  const rolloverBtn = document.getElementById('btn-apply-rollover');

  if (stats.firstUncompletedIndex !== -1) {
    const curDay = state.days[stats.firstUncompletedIndex];
    if (activeDayBadge) activeDayBadge.textContent = `Текущий день: ${curDay.day}`;
    if (rolloverCurrentDay) rolloverCurrentDay.textContent = `День ${curDay.day}`;
    if (rolloverCurrentTarget) rolloverCurrentTarget.textContent = `${curDay.target} повторений`;
    if (rolloverBtn) rolloverBtn.disabled = false;
  } else {
    if (activeDayBadge) activeDayBadge.textContent = 'Челлендж завершён';
    if (rolloverCurrentDay) rolloverCurrentDay.textContent = 'Все завершены';
    if (rolloverCurrentTarget) rolloverCurrentTarget.textContent = '—';
    if (rolloverBtn) rolloverBtn.disabled = true;
  }

  // Filter counters
  document.getElementById('filter-count-pending').textContent = 30 - stats.completedDaysCount;
  document.getElementById('filter-count-completed').textContent = stats.completedDaysCount;

  // 2. Render Days Grid
  renderDaysGrid(stats.firstUncompletedIndex);

  // 3. Render Crypto Analytics Chart
  renderCryptoChart();

  // 4. Update Rollover live summary if hero inputs exist
  updateRolloverPreviewText();

  // 5. Update Ranks UI
  const currentRank = getUserRank(stats.completedReps);

  const heroRankContainer = document.getElementById('hero-rank-container');
  if (heroRankContainer) {
    heroRankContainer.innerHTML = renderRankBadge(currentRank);
    heroRankContainer.onclick = openRanksModal;
    heroRankContainer.style.cursor = 'pointer';
    heroRankContainer.title = 'Нажмите, чтобы посмотреть все 17 статусов';
  }

  const headerRankEl = document.getElementById('header-rank-badge-slot');
  if (headerRankEl) {
    headerRankEl.innerHTML = renderRankBadge(currentRank);
  }

  const popoverRankSlot = document.getElementById('user-popover-rank-slot');
  if (popoverRankSlot) {
    popoverRankSlot.innerHTML = renderRankBadge(currentRank, 'large');
  }


  // 6. Update user popover stats if active
  const popoverReps = document.getElementById('user-popover-stat-reps');
  const popoverDays = document.getElementById('user-popover-stat-days');
  if (popoverReps) popoverReps.textContent = `${stats.completedReps.toLocaleString('ru-RU')} из ${TOTAL_GOAL.toLocaleString('ru-RU')}`;
  if (popoverDays) popoverDays.textContent = `${stats.completedDaysCount} из 30`;
}

function renderDaysGrid(firstUncompletedIdx) {
  const grid = document.getElementById('days-grid');
  grid.innerHTML = '';

  state.days.forEach((day, idx) => {
    if (currentFilter === 'pending' && day.completed) return;
    if (currentFilter === 'completed' && !day.completed) return;

    const isCurrent = (idx === firstUncompletedIdx);
    const card = document.createElement('div');
    card.className = `day-card ${day.completed ? 'completed' : ''} ${isCurrent ? 'is-current' : ''}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `День ${day.day}, цель: ${day.target} подтягиваний, ${day.completed ? 'выполнен' : 'не выполнен'}`);

    let diffTagHtml = '';
    const diff = day.target - day.originalTarget;
    if (day.shortfall) {
      diffTagHtml = `<span class="target-diff-tag decreased">Недобор: -${day.shortfall}</span>`;
    } else if (diff > 0) {
      diffTagHtml = `<span class="target-diff-tag increased">+${diff} перенос</span>`;
    } else if (diff < 0) {
      diffTagHtml = `<span class="target-diff-tag decreased">${diff} перенос</span>`;
    }

    card.innerHTML = `
      <div class="day-card-header">
        <span class="day-number-badge">ДЕНЬ ${day.day}</span>
        <div class="day-card-header-actions">
          <button type="button" class="day-pencil-btn" data-day="${day.day}" title="Перенести подтягивания для дня ${day.day}" aria-label="Перенести подтягивания для дня ${day.day}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </button>
          <div class="day-checkbox-custom" title="${day.completed ? 'Снять отметку' : 'Отметить выполненным'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
      </div>
      <div class="day-card-body">
        <div class="day-target-display">
          <span class="target-num">${day.target}</span>
          <span class="target-unit">повт.</span>
        </div>
        ${diffTagHtml}
      </div>
      <div class="day-card-footer">
        <span class="day-status-label">${day.completed ? 'Выполнен' : (isCurrent ? 'Активен' : 'Ожидает')}</span>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.day-pencil-btn')) {
        e.stopPropagation();
        openDayRolloverModal(day.day);
        return;
      }
      toggleDay(day.day);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDay(day.day);
      }
    });

    grid.appendChild(card);
  });
}

function updateRolloverPreviewText() {
  const summaryBox = document.getElementById('rollover-summary-text');
  if (!summaryBox) return;
  const stats = calculateStats();
  const summaryBoxContainer = document.getElementById('rollover-summary-box');
  const errorBox = document.getElementById('rollover-error');
  if (errorBox) errorBox.style.display = 'none';

  if (stats.firstUncompletedIndex === -1) {
    if (summaryBoxContainer) summaryBoxContainer.style.display = 'flex';
    summaryBox.innerHTML = 'Все дни челленджа закрыты. Перенос недобора недоступен.';
    return;
  }

  const curDay = state.days[stats.firstUncompletedIndex];
  const actualDoneInput = document.getElementById('input-actual-done');
  const rawVal = actualDoneInput ? actualDoneInput.value.trim() : '';

  if (rawVal === '') {
    if (summaryBoxContainer) summaryBoxContainer.style.display = 'none';
    summaryBox.innerHTML = '';
    return;
  }

  const val = parseInt(rawVal, 10);

  if (isNaN(val) || val < 0) {
    if (summaryBoxContainer) summaryBoxContainer.style.display = 'none';
    summaryBox.innerHTML = '';
    return;
  }

  if (summaryBoxContainer) summaryBoxContainer.style.display = 'block';

  if (val > curDay.target) {
    summaryBox.innerHTML = `
      <div class="rollover-preview-info">
        <div style="color: var(--color-danger-text); font-size: 13px; line-height: 1.4;">
          Введено <strong>${val}</strong> повторений при цели <strong>${curDay.target}</strong>. Для переноса недобора укажите число меньше цели дня.
        </div>
      </div>
    `;
    return;
  }

  if (val === curDay.target) {
    summaryBox.innerHTML = `
      <div class="rollover-preview-info">
        <div class="preview-info-row">
          <span class="preview-info-label">Зачёт за День ${curDay.day}:</span>
          <span class="preview-info-value"><strong>${val}</strong> из ${curDay.target} повторений (100%)</span>
        </div>
        <div class="preview-distribution-note">
          Недобора нет. День будет закрыт полностью без изменений для других дней.
        </div>
      </div>
    `;
    return;
  }

  const shortfall = curDay.target - val;
  const remainingDays = 30 - (stats.completedDaysCount + 1);
  if (remainingDays <= 0) {
    summaryBox.innerHTML = `
      <div class="rollover-preview-info">
        <div style="color: var(--color-danger-text); font-size: 13px;">
          Не осталось других незавершённых дней для распределения.
        </div>
      </div>
    `;
    return;
  }

  const baseAdd = Math.floor(shortfall / remainingDays);
  const remainder = shortfall % remainingDays;

  let distText = '';
  if (remainder === 0) {
    distText = `по <strong>+${baseAdd}</strong> на каждый день`;
  } else {
    distText = `по <strong>+${baseAdd}..+${baseAdd + 1}</strong> на день`;
  }

  const daysWord = plural(remainingDays, 'оставшийся день', 'оставшихся дня', 'оставшихся дней');

  summaryBox.innerHTML = `
    <div class="rollover-preview-info">
      <div class="preview-info-row">
        <span class="preview-info-label">Зачёт за День ${curDay.day}:</span>
        <span class="preview-info-value"><strong>${val}</strong> из ${curDay.target} повторений</span>
      </div>
      <div class="preview-info-row">
        <span class="preview-info-label">Недобор к переносу:</span>
        <span class="preview-info-value"><strong>${shortfall}</strong> повторений</span>
      </div>
      <div class="preview-distribution-note">
        Недобор распределится на <strong>${remainingDays}</strong> ${daysWord} (${distText}).
      </div>
    </div>
  `;
}

function plural(n, one, two, five) {
  n = Math.abs(n) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return five;
  if (n1 > 1 && n1 < 5) return two;
  if (n1 === 1) return one;
  return five;
}

// ==========================================================================
// Stepper Helper
// ==========================================================================

function setupStepperButtons(minusBtnId, plusBtnId, inputId, getTargetFn, onUpdateFn) {
  const minusBtn = document.getElementById(minusBtnId);
  const plusBtn = document.getElementById(plusBtnId);
  const input = document.getElementById(inputId);
  if (!minusBtn || !plusBtn || !input) return;

  const step = (delta) => {
    let val = parseInt(input.value, 10);
    const target = getTargetFn ? getTargetFn() : 300;
    if (isNaN(val)) {
      val = delta < 0 ? Math.max(0, target - 1) : target;
    } else {
      val = Math.max(0, val + delta);
    }
    input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (onUpdateFn) onUpdateFn();
  };

  minusBtn.addEventListener('click', (e) => {
    e.preventDefault();
    step(-1);
  });

  plusBtn.addEventListener('click', (e) => {
    e.preventDefault();
    step(1);
  });
}

// ==========================================================================
// Crypto Analytics & Chart System
// ==========================================================================

let currentChartMode = 'daily'; // 'daily' | 'cumulative'
let chartHoverIndex = null;

function getSmoothSvgPath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function renderCryptoChart() {
  const svg = document.getElementById('crypto-chart-svg');
  if (!svg) return;

  const stats = calculateStats();
  const totalDays = state.days.length; // 30
  const targets = state.days.map(d => d.target);
  const peakTarget = Math.max(...targets);
  const minTarget = Math.min(...targets);
  const avgTarget = (targets.reduce((a, b) => a + b, 0) / totalDays).toFixed(1);

  // Update Bottom Metric Chips
  const metricPeak = document.getElementById('chart-metric-peak');
  const metricMin = document.getElementById('chart-metric-min');
  const metricAvg = document.getElementById('chart-metric-avg');
  const metricDone = document.getElementById('chart-metric-done');
  const liveBadge = document.getElementById('chart-live-badge');

  if (metricPeak) metricPeak.textContent = `${peakTarget} повторений`;
  if (metricMin) metricMin.textContent = `${minTarget} повторений`;
  if (metricAvg) metricAvg.textContent = `${avgTarget} повторения`;
  if (metricDone) metricDone.textContent = `${stats.completedDaysCount} из 30 дней`;
  if (liveBadge) {
    liveBadge.textContent = currentChartMode === 'daily' ? '30 ДНЕЙ • ОБЪЁМ' : '30 ДНЕЙ • ПРОГРЕСС';
  }

  // Update tabs active state
  const tabDaily = document.getElementById('btn-chart-mode-daily');
  const tabCumulative = document.getElementById('btn-chart-mode-cumulative');
  if (tabDaily && tabCumulative) {
    if (currentChartMode === 'daily') {
      tabDaily.classList.add('active');
      tabCumulative.classList.remove('active');
    } else {
      tabCumulative.classList.add('active');
      tabDaily.classList.remove('active');
    }
  }

  // Viewport coordinates
  const svgW = 540;
  const svgH = 180;
  const padL = 38;
  const padR = 20;
  const padT = 20;
  const padB = 26;
  const chartW = svgW - padL - padR; // 482
  const chartH = svgH - padT - padB; // 134

  let baselineValues = [];
  let currentValues = [];
  let yMin = 0;
  let yMax = 100;
  let gridTicks = [];

  if (currentChartMode === 'daily') {
    baselineValues = INITIAL_TARGETS.slice();
    currentValues = state.days.map(d => d.target);
    const allVals = baselineValues.concat(currentValues);
    const maxVal = Math.max(...allVals);
    const minVal = Math.min(...allVals);

    yMin = Math.max(0, Math.floor((minVal - 30) / 50) * 50);
    yMax = Math.ceil((maxVal + 30) / 50) * 50;

    const step = (yMax - yMin) > 250 ? 100 : 50;
    for (let v = yMin; v <= yMax; v += step) {
      gridTicks.push(v);
    }
  } else {
    // Cumulative trajectory
    let sumBase = 0;
    baselineValues = INITIAL_TARGETS.map(t => {
      sumBase += t;
      return sumBase;
    });

    let sumCur = 0;
    currentValues = state.days.map(d => {
      sumCur += d.target;
      return sumCur;
    });

    yMin = 0;
    yMax = TOTAL_GOAL;
    gridTicks = [0, 1000, 2000, 3000, 4000, 5000];
  }

  const getY = (val) => {
    const ratio = (val - yMin) / (yMax - yMin);
    return padT + (1 - Math.max(0, Math.min(1, ratio))) * chartH;
  };

  const getX = (idx) => {
    return padL + (idx / (totalDays - 1)) * chartW;
  };

  // 1. Grid group
  const gridGroup = document.getElementById('chart-grid-group');
  if (gridGroup) {
    let gridHtml = '';
    // Horizontal lines & Y labels
    gridTicks.forEach(tickVal => {
      const y = getY(tickVal);
      const labelText = currentChartMode === 'daily'
        ? tickVal
        : (tickVal >= 1000 ? (tickVal / 1000) + 'k' : tickVal);
      gridHtml += `
        <line class="chart-grid-line" x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" />
        <text class="chart-grid-label" x="${padL - 6}" y="${y}" text-anchor="end">${labelText}</text>
      `;
    });

    // X axis ticks (Days: 1, 5, 10, 15, 20, 25, 30)
    const xDays = [1, 5, 10, 15, 20, 25, 30];
    xDays.forEach(dNum => {
      const x = getX(dNum - 1);
      gridHtml += `
        <line class="chart-grid-line" x1="${x}" y1="${padT}" x2="${x}" y2="${padT + chartH}" style="opacity: 0.35;" />
        <text class="chart-axis-label" x="${x}" y="${padT + chartH + 16}">${dNum}</text>
      `;
    });
    gridGroup.innerHTML = gridHtml;
  }

  // 2. Compute path points
  const baselinePoints = baselineValues.map((v, i) => ({ x: getX(i), y: getY(v) }));
  const currentPoints = currentValues.map((v, i) => ({ x: getX(i), y: getY(v) }));

  // Baseline path (dashed)
  const baselinePathEl = document.getElementById('chart-path-baseline');
  if (baselinePathEl) {
    baselinePathEl.setAttribute('d', getSmoothSvgPath(baselinePoints));
  }

  // Main glowing line
  const linePathEl = document.getElementById('chart-path-line');
  if (linePathEl) {
    linePathEl.setAttribute('d', getSmoothSvgPath(currentPoints));
  }

  // Area path
  const areaPathEl = document.getElementById('chart-path-area');
  if (areaPathEl) {
    const smoothLine = getSmoothSvgPath(currentPoints);
    const bottomY = padT + chartH;
    const lastX = currentPoints[currentPoints.length - 1].x;
    const firstX = currentPoints[0].x;
    const areaD = `${smoothLine} L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`;
    areaPathEl.setAttribute('d', areaD);
  }

  // 3. Render Dots
  const dotsGroup = document.getElementById('chart-dots-group');
  if (dotsGroup) {
    let dotsHtml = '';
    currentPoints.forEach((pt, i) => {
      const day = state.days[i];
      const isCurrent = (i === stats.firstUncompletedIndex);
      let dotClass = 'dot-pending';
      let r = 3;

      if (day.completed) {
        dotClass = 'dot-completed';
        r = 3.5;
      } else if (isCurrent) {
        dotClass = 'dot-active';
        r = 4.5;
      }

      dotsHtml += `
        <circle class="chart-dot ${dotClass}" cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${r}" data-day="${day.day}" />
      `;
    });
    dotsGroup.innerHTML = dotsHtml;

    // Attach click listener on dots
    dotsGroup.querySelectorAll('.chart-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const dNum = parseInt(dot.getAttribute('data-day'), 10);
        const targetDay = state.days.find(d => d.day === dNum);
        if (targetDay && !targetDay.completed) {
          openDayRolloverModal(dNum);
        } else {
          const dayCards = document.querySelectorAll('.day-card');
          if (dayCards[dNum - 1]) {
            dayCards[dNum - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
            dayCards[dNum - 1].classList.add('pulse-highlight');
            setTimeout(() => dayCards[dNum - 1].classList.remove('pulse-highlight'), 1200);
          }
        }
      });
    });
  }

  // 4. Update HUD bar default state
  updateChartHudFocus(chartHoverIndex !== null ? chartHoverIndex : (stats.firstUncompletedIndex !== -1 ? stats.firstUncompletedIndex : 0));
}

function updateChartHudFocus(dayIndex) {
  if (dayIndex < 0 || dayIndex >= state.days.length) return;
  const day = state.days[dayIndex];
  const orig = INITIAL_TARGETS[dayIndex];
  const diff = day.target - orig;

  const labelFocus = document.getElementById('hud-label-focus');
  const valueFocus = document.getElementById('hud-value-focus');
  const statusTag = document.getElementById('hud-status-tag');
  const diffTag = document.getElementById('hud-diff-tag');

  if (labelFocus) labelFocus.textContent = `День ${day.day}:`;

  if (valueFocus) {
    if (currentChartMode === 'daily') {
      valueFocus.textContent = `${day.target} повторений`;
    } else {
      let cum = 0;
      for (let i = 0; i <= dayIndex; i++) cum += state.days[i].target;
      valueFocus.textContent = `${cum.toLocaleString('ru-RU')} из ${TOTAL_GOAL.toLocaleString('ru-RU')}`;
    }
  }

  if (statusTag) {
    statusTag.className = 'crypto-hud-tag';
    if (day.completed) {
      statusTag.classList.add('status-completed');
      statusTag.textContent = 'Выполнен';
    } else if (day.shortfall) {
      statusTag.classList.add('status-modified');
      statusTag.textContent = `Недобор -${day.shortfall}`;
    } else {
      const stats = calculateStats();
      if (dayIndex === stats.firstUncompletedIndex) {
        statusTag.classList.add('status-active');
        statusTag.textContent = 'Активен';
      } else {
        statusTag.textContent = 'В плане';
      }
    }
  }

  if (diffTag) {
    diffTag.className = 'crypto-hud-diff';
    if (diff > 0) {
      diffTag.classList.add('positive');
      diffTag.textContent = `+${diff} повторений`;
    } else if (diff < 0) {
      diffTag.classList.add('negative');
      diffTag.textContent = `${diff} повторений`;
    } else {
      diffTag.textContent = '0 повторений';
    }
  }
}

function setupCryptoChartInteractions() {
  const viewport = document.getElementById('crypto-chart-viewport');
  const svg = document.getElementById('crypto-chart-svg');
  const tooltip = document.getElementById('crypto-tooltip');
  const crosshairGroup = document.getElementById('chart-crosshair-group');
  const crosshairLine = document.getElementById('chart-crosshair-line');
  const crosshairDot = document.getElementById('chart-crosshair-dot');
  const crosshairPulse = document.getElementById('chart-crosshair-pulse');
  const ttDay = document.getElementById('tt-day');
  const ttTarget = document.getElementById('tt-target');
  const ttStatus = document.getElementById('tt-status');

  const tabDaily = document.getElementById('btn-chart-mode-daily');
  const tabCumulative = document.getElementById('btn-chart-mode-cumulative');

  if (tabDaily) {
    tabDaily.addEventListener('click', () => {
      if (currentChartMode !== 'daily') {
        currentChartMode = 'daily';
        renderCryptoChart();
      }
    });
  }

  if (tabCumulative) {
    tabCumulative.addEventListener('click', () => {
      if (currentChartMode !== 'cumulative') {
        currentChartMode = 'cumulative';
        renderCryptoChart();
      }
    });
  }

  if (!viewport || !svg) return;

  const handlePointerMove = (e) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const relX = clientX - rect.left;
    const svgX = (relX / rect.width) * 540;

    const padL = 38;
    const chartW = 482;
    const clampedX = Math.max(padL, Math.min(padL + chartW, svgX));

    const ratio = (clampedX - padL) / chartW;
    const dayIndex = Math.max(0, Math.min(29, Math.round(ratio * 29)));
    chartHoverIndex = dayIndex;

    const day = state.days[dayIndex];
    if (!day) return;

    const exactX = padL + (dayIndex / 29) * chartW;

    const svgH = 180;
    const padT = 20;
    const padB = 26;
    const chartH = svgH - padT - padB;

    let targetVal = day.target;
    let yMin = 0;
    let yMax = 100;

    if (currentChartMode === 'daily') {
      const allVals = INITIAL_TARGETS.concat(state.days.map(d => d.target));
      const maxVal = Math.max(...allVals);
      const minVal = Math.min(...allVals);
      yMin = Math.max(0, Math.floor((minVal - 30) / 50) * 50);
      yMax = Math.ceil((maxVal + 30) / 50) * 50;
    } else {
      let cum = 0;
      for (let i = 0; i <= dayIndex; i++) cum += state.days[i].target;
      targetVal = cum;
      yMin = 0;
      yMax = TOTAL_GOAL;
    }

    const yRatio = (targetVal - yMin) / (yMax - yMin);
    const exactY = padT + (1 - Math.max(0, Math.min(1, yRatio))) * chartH;

    if (crosshairGroup) crosshairGroup.style.display = 'block';
    if (crosshairLine) {
      crosshairLine.setAttribute('x1', exactX.toFixed(1));
      crosshairLine.setAttribute('x2', exactX.toFixed(1));
      crosshairLine.setAttribute('y1', padT);
      crosshairLine.setAttribute('y2', padT + chartH);
    }
    if (crosshairDot) {
      crosshairDot.setAttribute('cx', exactX.toFixed(1));
      crosshairDot.setAttribute('cy', exactY.toFixed(1));
    }
    if (crosshairPulse) {
      crosshairPulse.setAttribute('cx', exactX.toFixed(1));
      crosshairPulse.setAttribute('cy', exactY.toFixed(1));
    }

    updateChartHudFocus(dayIndex);

    if (tooltip) {
      tooltip.style.display = 'block';
      const pixelX = (exactX / 540) * rect.width;
      const pixelY = (exactY / 180) * rect.height;

      const ttHalfWidth = 72;
      const clampedPixelX = Math.max(ttHalfWidth + 6, Math.min(rect.width - ttHalfWidth - 6, pixelX));
      const clampedPixelY = Math.max(38, pixelY);

      tooltip.style.left = `${clampedPixelX}px`;
      tooltip.style.top = `${clampedPixelY}px`;

      if (ttDay) ttDay.textContent = `День ${day.day}`;
      if (ttTarget) {
        if (currentChartMode === 'daily') {
          ttTarget.textContent = `${day.target} повторений`;
        } else {
          ttTarget.textContent = `${targetVal.toLocaleString('ru-RU')} из ${TOTAL_GOAL.toLocaleString('ru-RU')}`;
        }
      }
      if (ttStatus) {
        if (day.completed) {
          ttStatus.textContent = 'Выполнен';
        } else if (day.shortfall) {
          ttStatus.textContent = `Недобор -${day.shortfall}`;
        } else {
          const stats = calculateStats();
          ttStatus.textContent = (dayIndex === stats.firstUncompletedIndex ? 'Активен' : 'В плане');
        }
      }
    }
  };

  const handlePointerLeave = () => {
    chartHoverIndex = null;
    if (crosshairGroup) crosshairGroup.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
    const stats = calculateStats();
    updateChartHudFocus(stats.firstUncompletedIndex !== -1 ? stats.firstUncompletedIndex : 0);
  };

  viewport.addEventListener('mousemove', handlePointerMove);
  viewport.addEventListener('mouseleave', handlePointerLeave);
  viewport.addEventListener('touchmove', handlePointerMove, { passive: true });
  viewport.addEventListener('touchend', handlePointerLeave);
}

// ==========================================================================
// Event Listeners & Interactions
// ==========================================================================

function setupEventListeners() {



  // Reset Modal Interactions
  const resetModal = document.getElementById('modal-reset');
  const btnResetHeader = document.getElementById('btn-reset');
  const btnCloseResetModal = document.getElementById('btn-close-reset-modal');
  const tabResetSpecific = document.getElementById('tab-reset-specific');
  const tabResetAll = document.getElementById('tab-reset-all');
  const panelResetSpecific = document.getElementById('panel-reset-specific');
  const panelResetAll = document.getElementById('panel-reset-all');
  const selectResetDay = document.getElementById('select-reset-day');
  const btnConfirmResetDay = document.getElementById('btn-confirm-reset-day');
  const btnConfirmResetAll = document.getElementById('btn-confirm-reset-all');
  const btnCancelResetSpecific = document.getElementById('btn-cancel-reset-specific');
  const btnCancelResetAll = document.getElementById('btn-cancel-reset-all');

  function openResetModal() {
    if (!getActiveUser()) {
      openAuthModal('register', true);
      showToast('Для сброса необходимо зарегистрироваться или войти', 'info');
      return;
    }
    populateResetDaySelect();
    tabResetSpecific.classList.add('active');
    tabResetAll.classList.remove('active');
    panelResetSpecific.style.display = 'block';
    panelResetAll.style.display = 'none';
    resetModal.style.display = 'flex';
  }

  function closeResetModal() {
    closeCustomDropdown();
    resetModal.style.display = 'none';
  }

  btnResetHeader.addEventListener('click', openResetModal);
  if (btnCloseResetModal) btnCloseResetModal.addEventListener('click', closeResetModal);
  if (btnCancelResetSpecific) btnCancelResetSpecific.addEventListener('click', closeResetModal);
  if (btnCancelResetAll) btnCancelResetAll.addEventListener('click', closeResetModal);

  resetModal.addEventListener('click', (e) => {
    if (e.target === resetModal) closeResetModal();
  });

  tabResetSpecific.addEventListener('click', () => {
    tabResetSpecific.classList.add('active');
    tabResetAll.classList.remove('active');
    panelResetSpecific.style.display = 'block';
    panelResetAll.style.display = 'none';
    closeCustomDropdown();
  });

  tabResetAll.addEventListener('click', () => {
    tabResetAll.classList.add('active');
    tabResetSpecific.classList.remove('active');
    panelResetAll.style.display = 'block';
    panelResetSpecific.style.display = 'none';
    closeCustomDropdown();
  });

  const customDropdownTrigger = document.getElementById('custom-dropdown-trigger');
  if (customDropdownTrigger) {
    customDropdownTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCustomDropdown();
    });
  }

  // Close custom dropdown on outside click
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('custom-day-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
      closeCustomDropdown();
    }
  });

  // Close custom dropdown on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCustomDropdown();
    }
  });

  if (btnConfirmResetDay) {
    btnConfirmResetDay.addEventListener('click', () => {
      const selectedDayNum = currentSelectedResetDay || (selectResetDay ? parseInt(selectResetDay.value, 10) : 1);
      const res = resetSpecificDay(selectedDayNum);
      if (!res.success) {
        showToast(res.error, 'error');
        return;
      }
      closeResetModal();
      showToast(`День ${selectedDayNum} сброшен к исходному состоянию`, 'info');
    });
  }

  if (btnConfirmResetAll) {
    btnConfirmResetAll.addEventListener('click', () => {
      closeResetModal();
      resetChallenge();
    });
  }

  // Rollover Pop-up Modal (Pencil trigger)
  const rolloverModal = document.getElementById('modal-day-rollover');
  const modalActualInput = document.getElementById('modal-input-actual');
  const btnCloseRolloverModal = document.getElementById('btn-close-rollover-modal');
  const btnCancelRolloverModal = document.getElementById('btn-cancel-rollover-modal');
  const modalRolloverForm = document.getElementById('modal-rollover-form');

  if (btnCloseRolloverModal) {
    btnCloseRolloverModal.addEventListener('click', closeDayRolloverModal);
  }
  if (btnCancelRolloverModal) {
    btnCancelRolloverModal.addEventListener('click', closeDayRolloverModal);
  }
  if (rolloverModal) {
    rolloverModal.addEventListener('click', (e) => {
      if (e.target === rolloverModal) closeDayRolloverModal();
    });
  }

  if (modalActualInput) {
    modalActualInput.addEventListener('input', updateModalRolloverPreview);
  }

  if (modalRolloverForm) {
    modalRolloverForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (activeModalDay === null) return;

      const day = state.days.find(d => d.day === activeModalDay);
      if (!day) return;

      const errorBox = document.getElementById('modal-rollover-error');
      errorBox.style.display = 'none';

      const act = parseInt(modalActualInput.value, 10);
      if (isNaN(act) || act < 0) {
        errorBox.textContent = 'Введите корректное число выполненных повторений.';
        errorBox.style.display = 'block';
        showToast('Введите корректное число повторений', 'error');
        return;
      }

      if (act > day.target) {
        errorBox.textContent = `Фактическое число (${act}) больше цели дня (${day.target}). Для переноса укажите число меньше цели.`;
        errorBox.style.display = 'block';
        showToast('Число превышает цель дня', 'error');
        return;
      }

      if (act === day.target) {
        day.completed = true;
        saveState();
        playSuccessChime();
        closeDayRolloverModal();
        showToast(`День ${day.day} выполнен полностью (${day.target} повторений)`, 'success');
        render();
        return;
      }

      const shortfall = day.target - act;
      const result = applyShortfallForSpecificDay(activeModalDay, shortfall);

      if (!result.success) {
        errorBox.textContent = result.error;
        errorBox.style.display = 'block';
        showToast(result.error, 'error');
        return;
      }

      closeDayRolloverModal();
      showToast(`День ${result.dayNum} зачтён (${result.actualDone} повторений). Недобор распределён по ${result.distributedCount} дней`, 'success');
      render();
    });
  }

  // Ranks Modal Interactions
  const modalRanks = document.getElementById('modal-ranks');
  const btnCloseRanksModal = document.getElementById('btn-close-ranks-modal');
  if (btnCloseRanksModal) {
    btnCloseRanksModal.addEventListener('click', closeRanksModal);
  }
  if (modalRanks) {
    modalRanks.addEventListener('click', (e) => {
      if (e.target === modalRanks) closeRanksModal();
    });
  }

  // Escape key closes modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalRanks && modalRanks.style.display === 'flex') {
        closeRanksModal();
      }
      if (rolloverModal && rolloverModal.style.display === 'flex') {
        closeDayRolloverModal();
      }
      if (resetModal && resetModal.style.display === 'flex') {
        closeResetModal();
      }
      closeAuthModal();
      closeSyncModal();
      const popover = document.getElementById('user-dropdown-popover');
      const menuContainer = document.getElementById('user-profile-menu-container');
      if (popover && popover.style.display !== 'none') {
        popover.style.display = 'none';
        if (menuContainer) menuContainer.classList.remove('open');
        const trigger = document.getElementById('btn-user-profile');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
    }
  });

  // Crypto Chart System Interactions
  setupCryptoChartInteractions();

  setupStepperButtons(
    'btn-modal-step-minus',
    'btn-modal-step-plus',
    'modal-input-actual',
    () => {
      const day = state.days.find(d => d.day === activeModalDay);
      return day ? day.target : 300;
    },
    updateModalRolloverPreview
  );

  // Filter pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      const stats = calculateStats();
      renderDaysGrid(stats.firstUncompletedIndex);
    });
  });

  // JSON export & import
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);

  document.getElementById('file-import-json').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      importJSON(e.target.files[0]);
      e.target.value = '';
    }
  });
}

// ==========================================================================
// Authentication UI & Controller
// ==========================================================================

function updateAuthHeaderUI() {
  const container = document.getElementById('auth-header-container');
  if (!container) return;

  const activeUser = getActiveUser();

  if (!activeUser) {
    container.innerHTML = `
      <button id="btn-auth-open" class="btn btn-secondary" type="button">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        Войти
      </button>
    `;
    const btn = document.getElementById('btn-auth-open');
    if (btn) {
      btn.addEventListener('click', () => openAuthModal('login'));
    }
    return;
  }

  const initials = getUserInitials(activeUser.username);
  const stats = calculateStats();
  const currentRank = getUserRank(stats.completedReps);

  container.innerHTML = `
    <div class="user-profile-menu-container" id="user-profile-menu-container">
      <button id="btn-user-profile" class="user-profile-trigger" type="button" aria-expanded="false" aria-label="Меню пользователя">
        <span class="user-avatar-badge">${escapeHtml(initials)}</span>
        <span class="user-profile-name">${escapeHtml(activeUser.username)}</span>
        <span id="header-rank-badge-slot">${renderRankBadge(currentRank)}</span>
        <svg class="user-chevron-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <div id="user-dropdown-popover" class="user-dropdown-popover" style="display: none;">
        <div class="user-popover-header">
          <div class="user-popover-avatar">${escapeHtml(initials)}</div>
          <div class="user-popover-info">
            <div class="user-popover-username">${escapeHtml(activeUser.username)}</div>
            <div id="user-popover-rank-slot" style="margin-top: 4px;">${renderRankBadge(currentRank, 'large')}</div>
          </div>
        </div>

        <div class="user-popover-stats">
          <div class="user-popover-stat-item">
            <span class="user-popover-stat-label">Выполнено:</span>
            <span class="user-popover-stat-val" id="user-popover-stat-reps">${stats.completedReps.toLocaleString('ru-RU')} из 5 000</span>
          </div>
          <div class="user-popover-stat-item">
            <span class="user-popover-stat-label">Дней завершено:</span>
            <span class="user-popover-stat-val" id="user-popover-stat-days">${stats.completedDaysCount} из 30</span>
          </div>
        </div>

        <div class="user-popover-divider"></div>

        <button type="button" id="btn-auth-switch-user" class="user-popover-action">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
          </svg>
          Сменить профиль
        </button>

        <button type="button" id="btn-auth-logout" class="user-popover-action text-danger">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Выйти из профиля
        </button>
      </div>
    </div>
  `;

  const trigger = document.getElementById('btn-user-profile');
  const menuContainer = document.getElementById('user-profile-menu-container');
  const popover = document.getElementById('user-dropdown-popover');
  const btnSwitch = document.getElementById('btn-auth-switch-user');
  const btnLogout = document.getElementById('btn-auth-logout');

  if (trigger && popover && menuContainer) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = popover.style.display !== 'none';
      if (isOpen) {
        popover.style.display = 'none';
        menuContainer.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      } else {
        popover.style.display = 'flex';
        menuContainer.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  }

  if (btnSwitch) {
    btnSwitch.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popover) popover.style.display = 'none';
      if (menuContainer) menuContainer.classList.remove('open');
      openAuthModal('login');
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popover) popover.style.display = 'none';
      if (menuContainer) menuContainer.classList.remove('open');
      logoutUser();
    });
  }
}

function openAuthModal(initialTab = 'register', isMandatory = false) {
  const modal = document.getElementById('modal-auth');
  if (!modal) return;

  const activeUser = getActiveUser();
  const mandatory = isMandatory || !activeUser;

  const btnClose = document.getElementById('btn-close-auth-modal');
  const btnCancelLogin = document.getElementById('btn-cancel-auth-login');
  const btnCancelRegister = document.getElementById('btn-cancel-auth-register');

  if (btnClose) btnClose.style.display = mandatory ? 'none' : 'flex';
  if (btnCancelLogin) btnCancelLogin.style.display = mandatory ? 'none' : 'inline-flex';
  if (btnCancelRegister) btnCancelRegister.style.display = mandatory ? 'none' : 'inline-flex';

  switchAuthTab(initialTab);
  clearAuthErrors();

  modal.style.display = 'flex';
  setTimeout(() => {
    if (initialTab === 'login') {
      const el = document.getElementById('input-login-username');
      if (el) el.focus();
    } else {
      const el = document.getElementById('input-register-username');
      if (el) el.focus();
    }
  }, 60);
}

function closeAuthModal() {
  if (!getActiveUser()) {
    showToast('Для продолжения необходимо зарегистрироваться или войти', 'info');
    return;
  }
  const modal = document.getElementById('modal-auth');
  if (modal) modal.style.display = 'none';
  clearAuthErrors();
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tab-auth-login');
  const tabRegister = document.getElementById('tab-auth-register');
  const formLogin = document.getElementById('form-auth-login');
  const formRegister = document.getElementById('form-auth-register');
  const title = document.getElementById('auth-modal-title');
  const subtitle = document.getElementById('auth-modal-subtitle');

  clearAuthErrors();

  const activeUser = getActiveUser();

  if (tab === 'login') {
    if (tabLogin) tabLogin.classList.add('active');
    if (tabRegister) tabRegister.classList.remove('active');
    if (formLogin) formLogin.style.display = 'flex';
    if (formRegister) formRegister.style.display = 'none';
    if (title) title.textContent = 'Вход в аккаунт';
    if (subtitle) {
      subtitle.textContent = activeUser 
        ? 'Переключитесь на другой профиль'
        : 'Войдите под своим ником для загрузки статистики';
    }
  } else {
    if (tabRegister) tabRegister.classList.add('active');
    if (tabLogin) tabLogin.classList.remove('active');
    if (formRegister) formRegister.style.display = 'flex';
    if (formLogin) formLogin.style.display = 'none';
    if (title) title.textContent = 'Регистрация профиля';
    if (subtitle) {
      subtitle.textContent = 'Создайте аккаунт по нику и паролю для синхронизации ПК и телефона';
    }
  }
}

function clearAuthErrors() {
  const errLogin = document.getElementById('auth-login-error');
  const errRegister = document.getElementById('auth-register-error');
  if (errLogin) {
    errLogin.textContent = '';
    errLogin.style.display = 'none';
  }
  if (errRegister) {
    errRegister.textContent = '';
    errRegister.style.display = 'none';
  }
}

async function handleRegister(username, password, confirmPassword) {
  const errBox = document.getElementById('auth-register-error');
  const submitBtn = document.getElementById('btn-submit-auth-register');
  const cleanUsername = (username || '').trim();

  if (cleanUsername.length < 2) {
    if (errBox) {
      errBox.textContent = 'Имя пользователя должно содержать не менее 2 символов.';
      errBox.style.display = 'block';
    }
    return;
  }

  if (!password || password.length < 4) {
    if (errBox) {
      errBox.textContent = 'Пароль должен содержать не менее 4 символов.';
      errBox.style.display = 'block';
    }
    return;
  }

  if (password !== confirmPassword) {
    if (errBox) {
      errBox.textContent = 'Пароли не совпадают.';
      errBox.style.display = 'block';
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Создание...';
  }

  try {
    const userKey = await getCloudUserKey(cleanUsername);

    // Check cloud and local for existing username
    const cloudUser = await fetchCloudUser(userKey);
    const users = getAllUsers();
    const localExists = users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase());

    if (cloudUser || localExists) {
      if (errBox) {
        errBox.textContent = `Пользователь с ником «${cleanUsername}» уже зарегистрирован. Войдите во вкладке «Вход».`;
        errBox.style.display = 'block';
      }
      return;
    }

    const passwordHash = await hashPassword(password);
    const stateToSave = JSON.parse(JSON.stringify(state || getDefaultState()));
    const newUser = {
      id: userKey,
      username: cleanUsername,
      passwordHash: passwordHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      challengeState: stateToSave
    };

    // Save to Firebase Cloud RTDB
    await saveCloudUserRecord(newUser);

    // Save to local cache
    users.push(newUser);
    saveAllUsers(users);

    setActiveUserId(newUser.id);
    state = JSON.parse(JSON.stringify(stateToSave));
    saveState(false);

    closeAuthModal();
    updateAuthHeaderUI();
    render();
    showToast(`Добро пожаловать, ${cleanUsername}! Профиль синхронизирован с облаком`, 'success');

    const regForm = document.getElementById('form-auth-register');
    if (regForm) regForm.reset();
  } catch (err) {
    console.error('Registration error:', err);
    if (errBox) {
      errBox.textContent = 'Ошибка при создании профиля. Проверьте интернет-соединение.';
      errBox.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Создать аккаунт';
    }
  }
}

async function handleLogin(username, password) {
  const errBox = document.getElementById('auth-login-error');
  const submitBtn = document.getElementById('btn-submit-auth-login');
  const cleanUsername = (username || '').trim();

  if (!cleanUsername) {
    if (errBox) {
      errBox.textContent = 'Введите имя пользователя.';
      errBox.style.display = 'block';
    }
    return;
  }

  if (!password) {
    if (errBox) {
      errBox.textContent = 'Введите пароль.';
      errBox.style.display = 'block';
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Вход...';
  }

  try {
    const userKey = await getCloudUserKey(cleanUsername);
    const enteredHash = await hashPassword(password);

    // Fetch from Firebase Cloud Database first
    let user = await fetchCloudUser(userKey);

    // Fallback to local storage if offline or not in cloud yet
    if (!user) {
      const users = getAllUsers();
      user = users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase() || u.id === userKey);
    }

    if (!user) {
      if (errBox) {
        errBox.textContent = `Пользователь «${cleanUsername}» не найден. Зарегистрируйтесь, если у вас ещё нет аккаунта.`;
        errBox.style.display = 'block';
      }
      return;
    }

    if (user.passwordHash && user.passwordHash !== enteredHash) {
      if (errBox) {
        errBox.textContent = 'Неверный пароль. Попробуйте снова.';
        errBox.style.display = 'block';
      }
      return;
    }

    // Cache user locally
    const users = getAllUsers();
    const idx = users.findIndex(u => u.id === user.id || u.username.toLowerCase() === user.username.toLowerCase());
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...user };
    } else {
      users.push(user);
    }
    saveAllUsers(users);

    setActiveUserId(user.id);

    // Load state
    if (user.challengeState && Array.isArray(user.challengeState.days) && user.challengeState.days.length === 30) {
      state = JSON.parse(JSON.stringify(user.challengeState));
    } else {
      loadState();
    }

    saveState(false);
    closeAuthModal();
    updateAuthHeaderUI();
    render();
    showToast(`Вы вошли как ${user.username}. Статистика загружена!`, 'success');

    const loginForm = document.getElementById('form-auth-login');
    if (loginForm) loginForm.reset();
  } catch (err) {
    console.error('Login error:', err);
    if (errBox) {
      errBox.textContent = 'Ошибка при входе. Проверьте интернет-соединение.';
      errBox.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Войти';
    }
  }
}

function logoutUser() {
  saveState(true);
  setActiveUserId(null);
  loadState();
  updateAuthHeaderUI();
  render();
  showToast('Вы вышли из профиля', 'info');
  openAuthModal('login', true);
}

function setupPasswordToggles() {
  document.querySelectorAll('.btn-toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      if (isPassword) {
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        `;
        btn.setAttribute('aria-label', 'Скрыть пароль');
      } else {
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        `;
        btn.setAttribute('aria-label', 'Показать пароль');
      }
    });
  });
}

function setupAuthEventListeners() {
  const modalAuth = document.getElementById('modal-auth');
  const btnCloseAuth = document.getElementById('btn-close-auth-modal');
  const tabLogin = document.getElementById('tab-auth-login');
  const tabRegister = document.getElementById('tab-auth-register');
  const linkToRegister = document.getElementById('link-switch-to-register');
  const linkToLogin = document.getElementById('link-switch-to-login');
  const btnCancelLogin = document.getElementById('btn-cancel-auth-login');
  const btnCancelRegister = document.getElementById('btn-cancel-auth-register');
  const formLogin = document.getElementById('form-auth-login');
  const formRegister = document.getElementById('form-auth-register');

  if (btnCloseAuth) btnCloseAuth.addEventListener('click', closeAuthModal);
  if (btnCancelLogin) btnCancelLogin.addEventListener('click', closeAuthModal);
  if (btnCancelRegister) btnCancelRegister.addEventListener('click', closeAuthModal);

  if (modalAuth) {
    modalAuth.addEventListener('click', (e) => {
      if (e.target === modalAuth) closeAuthModal();
    });
  }

  if (tabLogin) tabLogin.addEventListener('click', () => switchAuthTab('login'));
  if (tabRegister) tabRegister.addEventListener('click', () => switchAuthTab('register'));

  if (linkToRegister) linkToRegister.addEventListener('click', () => switchAuthTab('register'));
  if (linkToLogin) linkToLogin.addEventListener('click', () => switchAuthTab('login'));

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('input-login-username');
      const passwordInput = document.getElementById('input-login-password');
      if (usernameInput && passwordInput) {
        await handleLogin(usernameInput.value, passwordInput.value);
      }
    });
  }

  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('input-register-username');
      const passwordInput = document.getElementById('input-register-password');
      const confirmInput = document.getElementById('input-register-confirm');

      if (usernameInput && passwordInput && confirmInput) {
        await handleRegister(
          usernameInput.value,
          passwordInput.value,
          confirmInput.value
        );
      }
    });
  }

  setupPasswordToggles();

  document.addEventListener('click', (e) => {
    const menuContainer = document.getElementById('user-profile-menu-container');
    const popover = document.getElementById('user-dropdown-popover');
    if (menuContainer && popover && !menuContainer.contains(e.target)) {
      popover.style.display = 'none';
      menuContainer.classList.remove('open');
      const trigger = document.getElementById('btn-user-profile');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  });
}


// ==========================================================================
// Device Synchronization (QR Code, Sync Code, Cloud Database)
// ==========================================================================

function utf8ToBase64(str) {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
      return String.fromCharCode('0x' + p1);
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (e) {
    console.error('Error encoding to base64:', e);
    return '';
  }
}

function base64ToUtf8(str) {
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return decodeURIComponent(Array.prototype.map.call(atob(b64), function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  } catch (e) {
    console.error('Error decoding base64:', e);
    return null;
  }
}

function packState(stateObj, username) {
  let mask = 0;
  stateObj.days.forEach((d, i) => {
    if (d.completed) mask |= (1 << i);
  });

  const diffs = {};
  stateObj.days.forEach(d => {
    if (d.target !== d.originalTarget || d.shortfall) {
      diffs[d.day] = [d.target, d.shortfall || 0];
    }
  });

  const payload = {
    u: username || 'Пользователь',
    m: mask,
    d: diffs
  };

  return utf8ToBase64(JSON.stringify(payload));
}

function unpackState(b64) {
  try {
    const jsonStr = base64ToUtf8(b64);
    if (!jsonStr) return null;
    const payload = JSON.parse(jsonStr);

    if (typeof payload !== 'object' || typeof payload.m !== 'number') return null;

    const days = INITIAL_TARGETS.map((orig, i) => {
      const dayNum = i + 1;
      const completed = !!(payload.m & (1 << i));
      const diff = payload.d && payload.d[dayNum];
      const target = diff ? diff[0] : orig;
      const shortfall = diff && diff[1] ? diff[1] : null;
      return {
        day: dayNum,
        target,
        originalTarget: orig,
        completed,
        shortfall
      };
    });

    return {
      username: payload.u || 'Пользователь',
      state: { days, history: [] }
    };
  } catch (e) {
    console.error('Error unpacking sync state:', e);
    return null;
  }
}

function getSyncUrl() {
  const activeUser = getActiveUser();
  const username = activeUser ? activeUser.username : 'Гость';
  const packed = packState(state, username);
  const base = window.location.href.split('#')[0];
  return base + '#sync=' + packed;
}

function openSyncModal(initialTab = 'qr') {
  const modal = document.getElementById('modal-sync');
  if (!modal) return;

  switchSyncTab(initialTab);
  updateSyncQrAndCodes();

  modal.style.display = 'flex';
}

function closeSyncModal() {
  const modal = document.getElementById('modal-sync');
  if (modal) modal.style.display = 'none';
  const errBox = document.getElementById('sync-import-error');
  if (errBox) {
    errBox.style.display = 'none';
    errBox.textContent = '';
  }
}

function switchSyncTab(tab) {
  const tabQr = document.getElementById('tab-sync-qr');
  const tabEnter = document.getElementById('tab-sync-enter');
  const tabCloud = document.getElementById('tab-sync-cloud');
  const panelQr = document.getElementById('panel-sync-qr');
  const panelEnter = document.getElementById('panel-sync-enter');
  const panelCloud = document.getElementById('panel-sync-cloud');

  [tabQr, tabEnter, tabCloud].forEach(t => t && t.classList.remove('active'));
  [panelQr, panelEnter, panelCloud].forEach(p => p && (p.style.display = 'none'));

  if (tab === 'qr') {
    if (tabQr) tabQr.classList.add('active');
    if (panelQr) panelQr.style.display = 'block';
    updateSyncQrAndCodes();
  } else if (tab === 'enter') {
    if (tabEnter) tabEnter.classList.add('active');
    if (panelEnter) panelEnter.style.display = 'block';
    const input = document.getElementById('input-sync-code-value');
    if (input) setTimeout(() => input.focus(), 60);
  } else if (tab === 'cloud') {
    if (tabCloud) tabCloud.classList.add('active');
    if (panelCloud) panelCloud.style.display = 'block';
    updateCloudStatusUI();
  }
}

function updateSyncQrAndCodes() {
  const syncUrl = getSyncUrl();
  const activeUser = getActiveUser();
  const username = activeUser ? activeUser.username : 'Гость';
  const packed = packState(state, username);

  const codeDisplay = document.getElementById('sync-code-display');
  if (codeDisplay) codeDisplay.value = packed;

  const qrContainer = document.getElementById('sync-qr-code');
  if (qrContainer && typeof qrcode === 'function') {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(syncUrl);
      qr.make();
      qrContainer.innerHTML = qr.createSvgTag({ scalable: true });
    } catch (err) {
      console.warn('QR Code generation error:', err);
      qrContainer.innerHTML = '<div style="color:#000; font-size:12px; text-align:center;">QR-код недоступен</div>';
    }
  }
}

function updateCloudStatusUI() {
  const cloudInput = document.getElementById('input-cloud-url');
  const statusBox = document.getElementById('cloud-sync-status-box');
  const currentUrl = getCloudDbUrl();
  const customUrl = localStorage.getItem(CLOUD_URL_KEY) || '';

  if (cloudInput) cloudInput.value = customUrl || DEFAULT_FIREBASE_URL;
  if (statusBox) {
    statusBox.style.display = 'block';
    const isDefault = currentUrl === DEFAULT_FIREBASE_URL;
    statusBox.innerHTML = `
      <div style="color: var(--text-accent); font-weight: 600; display: flex; align-items: center; gap: 6px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #4ADE80; display: inline-block;"></span>
        База данных подключена (${isDefault ? 'Firebase' : 'Пользовательский URL'})
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px; word-break: break-all;">
        ${escapeHtml(currentUrl)}
      </div>
      <div style="font-size: 11px; color: var(--text-secondary); margin-top: 5px;">
        Любые изменения на ПК и телефоне синхронизируются под вашим ником.
      </div>
    `;
  }
}

async function syncToCloudAsync() {
  const activeUser = getActiveUser();
  if (!activeUser) return;

  try {
    await patchCloudUserState(activeUser.id, state);
  } catch (e) {
    console.warn('Background cloud sync failed:', e);
  }
}

function checkForUrlSync() {
  if (typeof window === 'undefined' || !window.location || !window.location.hash) return;
  const hash = window.location.hash;
  if (!hash.startsWith('#sync=')) return;

  const raw = hash.slice(6);
  if (!raw) return;

  const result = unpackState(raw);
  if (!result || !result.state) return;

  state = result.state;
  const username = result.username || 'Пользователь';

  const users = getAllUsers();
  let user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    user = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      username: username,
      passwordHash: '',
      createdAt: new Date().toISOString(),
      challengeState: JSON.parse(JSON.stringify(state))
    };
    users.push(user);
    saveAllUsers(users);
  } else {
    user.challengeState = JSON.parse(JSON.stringify(state));
    saveAllUsers(users);
  }

  setActiveUserId(user.id);
  saveState();

  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  showToast(`Профиль «${username}» успешно синхронизирован с другого устройства!`, 'success');
}

function setupSyncEventListeners() {
  const btnSyncOpen = document.getElementById('btn-sync-open');
  const modalSync = document.getElementById('modal-sync');
  const btnCloseSync = document.getElementById('btn-close-sync-modal');
  const btnCancelEnter = document.getElementById('btn-cancel-sync-enter');

  const tabQr = document.getElementById('tab-sync-qr');
  const tabEnter = document.getElementById('tab-sync-enter');
  const tabCloud = document.getElementById('tab-sync-cloud');

  const btnCopyCode = document.getElementById('btn-copy-sync-code');
  const btnCopyUrl = document.getElementById('btn-copy-sync-url');
  const btnApplyCode = document.getElementById('btn-apply-sync-code');
  const btnSaveCloud = document.getElementById('btn-save-cloud-config');
  const btnClearCloud = document.getElementById('btn-clear-cloud-config');

  if (btnSyncOpen) btnSyncOpen.addEventListener('click', () => openSyncModal('qr'));
  if (btnCloseSync) btnCloseSync.addEventListener('click', closeSyncModal);
  if (btnCancelEnter) btnCancelEnter.addEventListener('click', closeSyncModal);

  if (modalSync) {
    modalSync.addEventListener('click', (e) => {
      if (e.target === modalSync) closeSyncModal();
    });
  }

  if (tabQr) tabQr.addEventListener('click', () => switchSyncTab('qr'));
  if (tabEnter) tabEnter.addEventListener('click', () => switchSyncTab('enter'));
  if (tabCloud) tabCloud.addEventListener('click', () => switchSyncTab('cloud'));

  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', () => {
      const codeInput = document.getElementById('sync-code-display');
      if (codeInput && codeInput.value) {
        copyToClipboard(codeInput.value, 'Код синхронизации скопирован в буфер');
      }
    });
  }

  if (btnCopyUrl) {
    btnCopyUrl.addEventListener('click', () => {
      const url = getSyncUrl();
      copyToClipboard(url, 'Прямая ссылка для телефона скопирована в буфер');
    });
  }

  if (btnApplyCode) {
    btnApplyCode.addEventListener('click', () => {
      const input = document.getElementById('input-sync-code-value');
      const errBox = document.getElementById('sync-import-error');
      let val = input ? input.value.trim() : '';

      if (errBox) errBox.style.display = 'none';

      if (!val) {
        if (errBox) {
          errBox.textContent = 'Вставьте код или ссылку синхронизации.';
          errBox.style.display = 'block';
        }
        return;
      }

      if (val.includes('#sync=')) {
        val = val.split('#sync=')[1];
      }

      const unpacked = unpackState(val);
      if (!unpacked || !unpacked.state) {
        if (errBox) {
          errBox.textContent = 'Неверный код синхронизации. Проверьте правильность введённых данных.';
          errBox.style.display = 'block';
        }
        return;
      }

      state = unpacked.state;
      const username = unpacked.username || 'Пользователь';

      const users = getAllUsers();
      let user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user) {
        user = {
          id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          username: username,
          passwordHash: '',
          createdAt: new Date().toISOString(),
          challengeState: JSON.parse(JSON.stringify(state))
        };
        users.push(user);
        saveAllUsers(users);
      } else {
        user.challengeState = JSON.parse(JSON.stringify(state));
        saveAllUsers(users);
      }

      setActiveUserId(user.id);
      saveState();
      closeSyncModal();
      updateAuthHeaderUI();
      render();
      showToast(`Прогресс профиля «${username}» успешно синхронизирован!`, 'success');
      if (input) input.value = '';
    });
  }

  if (btnSaveCloud) {
    btnSaveCloud.addEventListener('click', async () => {
      const input = document.getElementById('input-cloud-url');
      const url = input ? input.value.trim() : '';
      if (!url) {
        localStorage.removeItem(CLOUD_URL_KEY);
        updateCloudStatusUI();
        showToast('Восстановлен адрес базы данных по умолчанию', 'info');
        await syncToCloudAsync();
        return;
      }
      localStorage.setItem(CLOUD_URL_KEY, url);
      updateCloudStatusUI();
      showToast('Настройки облака сохранены. Проверяем синхронизацию...', 'info');
      await syncToCloudAsync();
      showToast('Облачная синхронизация активна!', 'success');
    });
  }

  if (btnClearCloud) {
    btnClearCloud.addEventListener('click', () => {
      localStorage.removeItem(CLOUD_URL_KEY);
      updateCloudStatusUI();
      showToast('Сброшено к стандартной базе Firebase', 'info');
    });
  }
}

// Toast System (Dark Graphite + Warm Ivory)
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✓',
    error: '×',
    info: '•'
  };

  const iconColor = type === 'success' ? '#F0E4D0' : (type === 'error' ? '#D96B6B' : '#B8B6B0');

  toast.innerHTML = `
    <span style="font-weight: 700; color: ${iconColor}">
      ${iconMap[type] || '•'}
    </span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'all 0.4s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px)';
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

// Confetti Particle System (Warm Ivory & Platinum Monochrome)
function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#F5EBDD', '#F0E4D0', '#D8C9B4', '#E6DEC8', '#B8B6B0', '#FFFFFF'];

  for (let i = 0; i < 90; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.8) * 16,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10,
      alpha: 1
    });
  }

  let animationId = null;
  function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.rotation += p.vRot;
      p.alpha -= 0.012;

      if (p.alpha > 0) {
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (alive > 0) {
      animationId = requestAnimationFrame(update);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(animationId);
    }
  }

  update();
}

// Boot up
window.addEventListener('DOMContentLoaded', initApp);
