import { getDb } from "../db/index.js";
import type { PrayerFocusRow } from "../types.js";

export function createPrayerFocus(input: {
  title: string;
  durationWeeks?: number;
  leaderName?: string;
  originNote?: string;
  sharedWith?: string;
  reviewDate?: string;
  impressionIds?: number[];
}): PrayerFocusRow {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO prayer_focuses (
        title, duration_weeks, leader_name, origin_note, shared_with, review_date
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.title,
      input.durationWeeks ?? 4,
      input.leaderName ?? null,
      input.originNote ?? null,
      input.sharedWith ?? null,
      input.reviewDate ?? null,
    );

  const id = Number(result.lastInsertRowid);
  if (input.impressionIds?.length) {
    const link = db.prepare(
      `INSERT OR IGNORE INTO prayer_focus_impressions (prayer_focus_id, impression_id)
       VALUES (?, ?)`,
    );
    const tx = db.transaction((ids: number[]) => {
      for (const impressionId of ids) link.run(id, impressionId);
    });
    tx(input.impressionIds);
  }

  return getPrayerFocus(id)!;
}

export function getPrayerFocus(id: number): PrayerFocusRow | undefined {
  return getDb()
    .prepare("SELECT * FROM prayer_focuses WHERE id = ?")
    .get(id) as PrayerFocusRow | undefined;
}

export function listPrayerFocuses(status?: string): PrayerFocusRow[] {
  if (status) {
    return getDb()
      .prepare(
        `SELECT * FROM prayer_focuses WHERE status = ? ORDER BY datetime(created_at) DESC`,
      )
      .all(status) as PrayerFocusRow[];
  }
  return getDb()
    .prepare(`SELECT * FROM prayer_focuses ORDER BY datetime(created_at) DESC`)
    .all() as PrayerFocusRow[];
}

export function addPrayerUpdate(id: number, updateText: string): void {
  const current = getPrayerFocus(id);
  if (!current) return;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const next = current.updates
    ? `${current.updates}\n• [${stamp}] ${updateText}`
    : `• [${stamp}] ${updateText}`;
  getDb()
    .prepare(
      `UPDATE prayer_focuses SET updates = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(next, id);
}

export function setPrayerStatus(
  id: number,
  status: "active" | "paused" | "completed",
  reflection?: string,
): void {
  getDb()
    .prepare(
      `UPDATE prayer_focuses SET
        status = ?,
        reflection = COALESCE(?, reflection),
        updated_at = datetime('now')
      WHERE id = ?`,
    )
    .run(status, reflection ?? null, id);
}

export function countIntercessorsLinked(prayerFocusId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT i.watchman_id) AS c
       FROM prayer_focus_impressions pfi
       JOIN impressions i ON i.id = pfi.impression_id
       WHERE pfi.prayer_focus_id = ?`,
    )
    .get(prayerFocusId) as { c: number };
  return row.c;
}
