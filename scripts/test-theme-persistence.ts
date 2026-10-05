import assert from 'node:assert/strict';
import { defaultProfile, mergeStoredKodaState, normalizeStoredKodaState, parseStoredKodaState } from '../src/features/koda/persistence';
import type { ThemeId } from '../src/features/koda/types';

const themes: ThemeId[] = ['calm-light', 'calm-dark', 'calm-sky-light', 'calm-sky-dark', 'calm-lavender-light', 'calm-lavender-dark'];
const emotion = {
  id: 'theme-test-emotion', occurredAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
  event: 'A saved event', group: 'Joy', emotion: 'Interest', action: 'A saved action',
};
const profileFields = {
  version: '2', daysLeft: '45', level: '7', streak: '12', xp: '480',
  values: 'Keep these values', futureSelf: 'Keep this future self', focus: 'Keep this focus',
  milestone: 'Keep this milestone', emotionEntries: [emotion],
};
const stateFields = {
  goals: [], kodaDays: [], projects: [],
  habits: [{ id: 'theme-test-habit', title: 'Keep this habit', target: 'Daily', doneDays: [true], monthDays: [true], monthHistory: { '2026-09': [false, true] } }],
  pomodoro: { workMinutes: 35, breakMinutes: 7, longBreakMinutes: 20, sessionsBeforeLongBreak: 3, soundId: 'bell' },
};

function checkStoredTheme(storedTheme: unknown, expectedTheme: ThemeId) {
  const stored = { ...stateFields, profile: { ...profileFields, themeId: storedTheme } };
  const restored = parseStoredKodaState(JSON.stringify(stored));
  assert.ok(restored, 'The stored state must be restored');
  assert.deepEqual(restored.profile, { ...profileFields, themeId: expectedTheme }, `Profile data must survive theme ${String(storedTheme)}`);
  for (const key of ['goals', 'kodaDays', 'projects', 'habits', 'pomodoro'] as const) {
    assert.deepEqual(restored[key], stateFields[key], `Theme migration must preserve ${key}`);
  }
  assert.deepEqual(parseStoredKodaState(JSON.stringify(restored)), restored, 'Reload after saving must preserve the normalized state');
}

assert.equal(defaultProfile.themeId, 'calm-light');
for (const theme of themes) checkStoredTheme(theme, theme);
checkStoredTheme('koda-dark', 'calm-dark');
checkStoredTheme('reference-dark', 'calm-sky-dark');
for (const invalidTheme of [undefined, null, '', 'unknown-theme', 42, {}, []]) {
  checkStoredTheme(invalidTheme, 'calm-light');
}

const remoteEmotion = { ...emotion, id: 'theme-test-remote-emotion' };
const remote = normalizeStoredKodaState({ profile: { ...profileFields, themeId: 'calm-lavender-dark', emotionEntries: [remoteEmotion] } })!;
const blankLocal = normalizeStoredKodaState({ profile: { ...defaultProfile, emotionEntries: [emotion] } })!;
const mergedDefault = mergeStoredKodaState(remote, blankLocal);
assert.equal(mergedDefault.profile.focus, profileFields.focus, 'A new empty profile must not override remote fields');
assert.equal(mergedDefault.profile.themeId, 'calm-lavender-dark', 'A new empty profile must adopt the remote theme');
assert.deepEqual(new Set(mergedDefault.profile.emotionEntries?.map(entry => entry.id)), new Set([emotion.id, remoteEmotion.id]));

for (const theme of themes) {
  const local = normalizeStoredKodaState({ profile: { ...profileFields, focus: 'Locally edited focus', themeId: theme } })!;
  const merged = parseStoredKodaState(JSON.stringify(mergeStoredKodaState(remote, local)))!;
  assert.equal(merged.profile.themeId, theme, 'A populated local profile must retain its selected theme after merge and reload');
  assert.equal(merged.profile.focus, 'Locally edited focus');
  assert.equal(merged.profile.emotionEntries?.length, 2, 'Theme selection must not lose local or remote emotion history');
}

for (const [legacyTheme, expectedTheme] of [['koda-dark', 'calm-dark'], ['reference-dark', 'calm-sky-dark']] as const) {
  const legacyLocal = normalizeStoredKodaState({ profile: { ...defaultProfile, themeId: legacyTheme } })!;
  const blankRemote = normalizeStoredKodaState({ profile: defaultProfile })!;
  assert.equal(mergeStoredKodaState(blankRemote, legacyLocal).profile.themeId, expectedTheme, 'A legacy dark preference must survive merging with a new empty profile');
}

console.log('Theme persistence: six palettes, legacy migration, invalid fallback, profile/history preservation, merge and reload PASS');
