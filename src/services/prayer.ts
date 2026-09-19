import { asNumber, exec, getPool, queryOne, queryRows, tables } from "../db/index.js";
import type { PrayerFocusRow } from "../types.js";

function mapFocus(row: PrayerFocusRow): PrayerFocusRow {
  return {
    ...row,
    id: Number(row.id),
    duration_weeks: Number(row.duration_weeks),
  };
}

export async function createPrayerFocus(input: {
  title: string;
  durationWeeks?: number;
  leaderName?: string;
  originNote?: string;
  sharedWith?: string;
  reviewDate?: string;
  impressionIds?: number[];
}): Promise<PrayerFocusRow> {
  const result = await exec(
    `INSERT INTO ${tables.prayerFocuses} (
      title, duration_weeks, leader_name, origin_note, shared_with, review_date
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.title,
      input.durationWeeks ?? 4,
      input.leaderName ?? null,
      input.originNote ?? null,
      input.sharedWith ?? null,
      input.reviewDate ?? null,
    ],
  );

  const id = Number(result.insertId);
  if (input.impressionIds?.length) {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      for (const impressionId of input.impressionIds) {
        await conn.query(
          `INSERT IGNORE INTO ${tables.prayerFocusImpressions} (prayer_focus_id, impression_id)
           VALUES (?, ?)`,
          [id, impressionId],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  return (await getPrayerFocus(id))!;
}

export async function getPrayerFocus(
  id: number,
): Promise<PrayerFocusRow | undefined> {
  const row = await queryOne<PrayerFocusRow>(
    `SELECT * FROM ${tables.prayerFocuses} WHERE id = ?`,
    [id],
  );
  return row ? mapFocus(row) : undefined;
}

export async function listPrayerFocuses(
  status?: string,
): Promise<PrayerFocusRow[]> {
  if (status) {
    const rows = await queryRows<PrayerFocusRow>(
      `SELECT * FROM ${tables.prayerFocuses} WHERE status = ? ORDER BY created_at DESC`,
      [status],
    );
    return rows.map(mapFocus);
  }
  const rows = await queryRows<PrayerFocusRow>(
    `SELECT * FROM ${tables.prayerFocuses} ORDER BY created_at DESC`,
  );
  return rows.map(mapFocus);
}

export async function addPrayerUpdate(
  id: number,
  updateText: string,
): Promise<void> {
  const current = await getPrayerFocus(id);
  if (!current) return;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const next = current.updates
    ? `${current.updates}\n• [${stamp}] ${updateText}`
    : `• [${stamp}] ${updateText}`;
  await exec(
    `UPDATE ${tables.prayerFocuses} SET updates = ?, updated_at = NOW() WHERE id = ?`,
    [next, id],
  );
}

export async function setPrayerStatus(
  id: number,
  status: "active" | "paused" | "completed",
  reflection?: string,
): Promise<void> {
  await exec(
    `UPDATE ${tables.prayerFocuses} SET
      status = ?,
      reflection = COALESCE(?, reflection),
      updated_at = NOW()
    WHERE id = ?`,
    [status, reflection ?? null, id],
  );
}

export async function countIntercessorsLinked(
  prayerFocusId: number,
): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(DISTINCT i.watchman_id) AS c
     FROM ${tables.prayerFocusImpressions} pfi
     JOIN ${tables.impressions} i ON i.id = pfi.impression_id
     WHERE pfi.prayer_focus_id = ?`,
    [prayerFocusId],
  );
  return asNumber(row?.c);
}
