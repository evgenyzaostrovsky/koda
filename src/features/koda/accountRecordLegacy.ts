import type { JournalEntry, Note, PlannerItem } from './types';
import { defaultJournalEntry, journalMoodByName, journalMoodByValue } from './constants';
import { journalRowId } from './syncCoordinator';
import { journalDateKey, parseNotes, parsePlannerItems, parseJournalEntries } from './persistence';
import { plannerRowsForAccount } from './plannerPrivacy';
import { displayTimeValue, normalizeTimeValue, sleepDurationMinutes } from './utils';

export type RecordDomain = 'planner' | 'journal' | 'notes';
export type AppRecord = PlannerItem | JournalEntry | Note;
const notesTableMissing = (error: any) => error?.code === '42P01' || error?.code === 'PGRST205';

export async function normalizeLegacyJournal(owner: string, entries: JournalEntry[]): Promise<JournalEntry[]> {
  return Promise.all(entries.map(async entry => ({ ...entry, id: await journalRowId(`user:${owner}`, entry.id) })));
}

/** Read-only import of legacy rows. A failed read must never become an empty successful import. */
export async function loadLegacyRecords(client: any, owner: string, domain: RecordDomain): Promise<AppRecord[]> {
  if (domain === 'planner') {
    const result = await client.from('planner_events').select('*').eq('owner_key', `user:${owner}`);
    if (result.error) throw result.error;
    const records = (result.data ?? []).map((row: any) => ({ id: row.id, date: row.event_date, time: row.event_time?.slice(0, 5) ?? '', title: row.title,
      done: Boolean(row.done), failed: Boolean(row.failed), subtasks: Array.isArray(row.subtasks) ? row.subtasks : [],
      sourceType: 'planner', sourceId: null, ownerId: null, updatedAt: row.updated_at, deletedAt: null }));
    if (!parsePlannerItems(JSON.stringify(records))) throw new Error('Invalid legacy planner rows');
    return records;
  }
  if (domain === 'journal') {
    const result = await client.from('journal_entries').select('*').eq('user_id', owner);
    if (result.error) throw result.error;
    const records = (result.data ?? []).map((row: any, index: number) => ({ ...defaultJournalEntry, id: row.id, title: `Запись ${index + 1}`, text: row.content ?? '',
      sleepStart: displayTimeValue(row.sleep_start_time) || defaultJournalEntry.sleepStart,
      wakeTime: displayTimeValue(row.wake_time) || defaultJournalEntry.wakeTime, tags: row.day_tags ?? [],
      mood: row.mood in journalMoodByName ? journalMoodByName[row.mood as keyof typeof journalMoodByName] : defaultJournalEntry.mood,
      createdAt: row.created_at || row.updated_at }));
    if (!parseJournalEntries(JSON.stringify(records))) throw new Error('Invalid legacy journal rows');
    return records;
  }
  // Older clients used the profile fallback while the notes table was missing.
  // Read both even after the table recovers, or fallback-only notes disappear
  // forever when we initialize the authoritative record document.
  const [result, fallback] = await Promise.all([
    client.from('notes').select('*').eq('user_id', owner),
    client.from('user_app_state').select('profile').eq('user_id', owner).maybeSingle(),
  ]);
  if (fallback.error) throw fallback.error;
  const embedded = fallback.data?.profile?.__kodaNotes;
  const notes = embedded === undefined ? null : parseNotes(JSON.stringify(embedded));
  if (embedded !== undefined && !notes) throw new Error('Invalid legacy notes fallback');
  if (notes?.some(note => note.userId && note.userId !== owner)) throw new Error('Foreign legacy note');
  if (result.error) {
    // A confirmed absent table contains no rows. Unlike a failed network read,
    // this permits a new installation to bootstrap from its profile fallback.
    if (notesTableMissing(result.error)) return notes ?? [];
    // A fallback is not proof that the inaccessible table contains no other
    // notes. Initializing from it during a network failure would hide those rows.
    throw result.error;
  }
  const rows: Note[] = (result.data ?? []).map((row: any) => ({ id: row.id, userId: owner, title: row.title, content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
    pinned: Boolean(row.pinned), createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at ?? null }));
  if (!parseNotes(JSON.stringify(rows))) throw new Error('Invalid legacy notes rows');
  const merged = new Map(rows.map(note => [note.id, note]));
  for (const note of notes ?? []) {
    const existing = merged.get(note.id);
    if (!existing || (!existing.deletedAt && (note.deletedAt || Date.parse(note.updatedAt) > Date.parse(existing.updatedAt)))) merged.set(note.id, note);
  }
  return [...merged.values()];
}

/** Compatibility mirrors are not authoritative; upgraded clients read the CAS document. */
export async function mirrorAccountRecords(client: any, owner: string, domain: RecordDomain, records: AppRecord[], deletedIds: string[], isCurrent?: () => boolean | Promise<boolean>) {
  const checkCurrent = async () => { if (isCurrent && !(await isCurrent())) throw new Error('Mirror account changed'); };
  if (domain === 'notes') {
    const rows = (records as Note[]).map(note => ({ id: note.id, user_id: owner, title: note.title.trim() || 'Без названия', content: note.content,
      pinned: note.pinned, created_at: note.createdAt, updated_at: note.updatedAt, deleted_at: note.deletedAt }));
    if (rows.length) { await checkCurrent(); const result = await client.from('notes').upsert(rows, { onConflict: 'id' }); if (notesTableMissing(result.error)) return; if (result.error) throw result.error; }
    if (deletedIds.length) { await checkCurrent(); const result = await client.from('notes').update({ deleted_at: new Date().toISOString() }).eq('user_id', owner).in('id', deletedIds); if (notesTableMissing(result.error)) return; if (result.error) throw result.error; }
    return;
  }
  const table = domain === 'planner' ? 'planner_events' : 'journal_entries';
  const rows = domain === 'planner' ? plannerRowsForAccount(owner, records as PlannerItem[]) : await Promise.all((records as JournalEntry[]).map(async entry => ({
    id: await journalRowId(`user:${owner}`, entry.id), owner_key: `user:${owner}`, user_id: owner, entry_date: journalDateKey(entry), content: entry.text,
    mood: journalMoodByValue[entry.mood], sleep_start_time: normalizeTimeValue(entry.sleepStart), wake_time: normalizeTimeValue(entry.wakeTime),
    sleep_duration_minutes: sleepDurationMinutes(entry.sleepStart, entry.wakeTime), day_tags: entry.tags, created_at: entry.createdAt,
  })));
  if (rows.length) {
    await checkCurrent();
    let result = await client.from(table).upsert(rows, { onConflict: 'id' });
    if (domain === 'planner' && ['42703', 'PGRST204'].includes(result.error?.code) && /failed|subtasks/i.test(result.error?.message ?? '')) {
      await checkCurrent();
      const compatible = rows.map(row => { const { failed, subtasks, ...rest } = row as Record<string, unknown>; return rest; });
      result = await client.from(table).upsert(compatible, { onConflict: 'id' });
    }
    if (result.error) throw result.error;
  }
  if (deletedIds.length) {
    const ids = domain === 'journal' ? await Promise.all(deletedIds.map(id => journalRowId(`user:${owner}`, id))) : deletedIds;
    await checkCurrent();
    const result = await client.from(table).delete().eq(domain === 'planner' ? 'owner_key' : 'user_id', domain === 'planner' ? `user:${owner}` : owner).in('id', ids);
    if (result.error) throw result.error;
  }
}
