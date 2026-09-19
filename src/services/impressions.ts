import { asNumber, exec, queryOne, queryRows, tables } from "../db/index.js";
import type {
  ContextType,
  ImpressionRow,
  ImpressionType,
  Status,
  Urgency,
} from "../types.js";

export type DraftPayload = {
  step:
    | "perceived"
    | "interpretation"
    | "type"
    | "context"
    | "urgency"
    | "prayed"
    | "confidential"
    | "confirm";
  perceived?: string;
  interpretation?: string;
  type?: ImpressionType;
  context?: ContextType;
  urgency?: Urgency;
  prayed?: boolean;
  confidential?: boolean;
  /** Bot prompt message to edit so the wizard stays one message. */
  promptChatId?: number;
  promptMessageId?: number;
};

export type CreateImpressionInput = {
  watchmanId: number;
  watchmanName: string;
  perceived: string;
  interpretation?: string;
  type: ImpressionType;
  context: ContextType;
  urgency: Urgency;
  prayed: boolean;
  confidential: boolean;
  topicCluster?: string | null;
  aiRecommendation?: string | null;
};

function mapImpression(row: ImpressionRow): ImpressionRow {
  return {
    ...row,
    id: Number(row.id),
    watchman_id: Number(row.watchman_id),
    prayed: Number(row.prayed),
    confidential: Number(row.confidential),
  };
}

/** In-process cache so submit still works if MySQL upsert is flaky. */
const draftCache = new Map<number, DraftPayload>();

function cloneDraft(draft: DraftPayload): DraftPayload {
  return JSON.parse(JSON.stringify(draft)) as DraftPayload;
}

function parseDraftPayload(payload: unknown): DraftPayload | null {
  if (payload == null) return null;
  if (typeof payload === "object") return payload as DraftPayload;
  const raw = typeof payload === "string" ? payload : String(payload);
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as DraftPayload;
  } catch {
    return null;
  }
}

export async function getDraft(telegramId: number): Promise<DraftPayload | null> {
  const cached = draftCache.get(telegramId);
  if (cached) return cloneDraft(cached);

  const row = await queryOne<{ payload: unknown }>(
    `SELECT payload FROM ${tables.draftImpressions} WHERE telegram_id = ?`,
    [telegramId],
  );
  if (!row) return null;
  const draft = parseDraftPayload(row.payload);
  if (draft) draftCache.set(telegramId, cloneDraft(draft));
  return draft;
}

export async function saveDraft(
  telegramId: number,
  draft: DraftPayload,
): Promise<void> {
  const payload = JSON.stringify(draft);
  draftCache.set(telegramId, cloneDraft(draft));
  // Bound params on UPDATE — works on MySQL 8 and MariaDB (no AS-alias / VALUES()).
  await exec(
    `INSERT INTO ${tables.draftImpressions} (telegram_id, payload, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       payload = ?,
       updated_at = NOW()`,
    [telegramId, payload, payload],
  );
}

export async function clearDraft(telegramId: number): Promise<void> {
  draftCache.delete(telegramId);
  await exec(`DELETE FROM ${tables.draftImpressions} WHERE telegram_id = ?`, [
    telegramId,
  ]);
}

export async function createImpression(
  input: CreateImpressionInput,
): Promise<ImpressionRow> {
  const result = await exec(
    `INSERT INTO ${tables.impressions} (
      watchman_id, watchman_name, perceived, interpretation, type, context,
      urgency, prayed, confidential, topic_cluster, ai_recommendation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.watchmanId,
      input.watchmanName,
      input.perceived,
      input.interpretation ?? null,
      input.type,
      input.context,
      input.urgency,
      input.prayed ? 1 : 0,
      input.confidential ? 1 : 0,
      input.topicCluster ?? null,
      input.aiRecommendation ?? null,
    ],
  );

  return (await getImpression(Number(result.insertId)))!;
}

export async function getImpression(
  id: number,
): Promise<ImpressionRow | undefined> {
  const row = await queryOne<ImpressionRow>(
    `SELECT * FROM ${tables.impressions} WHERE id = ?`,
    [id],
  );
  return row ? mapImpression(row) : undefined;
}

export async function listOwnImpressions(
  watchmanId: number,
  limit = 10,
): Promise<ImpressionRow[]> {
  const rows = await queryRows<ImpressionRow>(
    `SELECT * FROM ${tables.impressions}
     WHERE watchman_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [watchmanId, limit],
  );
  return rows.map(mapImpression);
}

export async function listImpressionsForLeaders(opts?: {
  status?: Status;
  includeConfidential?: boolean;
  limit?: number;
}): Promise<ImpressionRow[]> {
  const limit = opts?.limit ?? 20;
  const includeConfidential = opts?.includeConfidential ?? true;
  const params: Array<string | number> = [];
  const where: string[] = [];

  if (opts?.status) {
    where.push("status = ?");
    params.push(opts.status);
  }
  if (!includeConfidential) {
    where.push("confidential = 0");
  }

  const sql = `SELECT * FROM ${tables.impressions}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY
      CASE urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT ?`;
  params.push(limit);

  return (await queryRows<ImpressionRow>(sql, params)).map(mapImpression);
}

export async function updateImpressionStatus(
  id: number,
  status: Status,
  extras?: {
    decisionNotes?: string;
    outcome?: string;
    forwardedTo?: string;
  },
): Promise<void> {
  await exec(
    `UPDATE ${tables.impressions} SET
      status = ?,
      decision_notes = COALESCE(?, decision_notes),
      outcome = COALESCE(?, outcome),
      forwarded_to = COALESCE(?, forwarded_to),
      updated_at = NOW()
    WHERE id = ?`,
    [
      status,
      extras?.decisionNotes ?? null,
      extras?.outcome ?? null,
      extras?.forwardedTo ?? null,
      id,
    ],
  );
}

export async function setAiFields(
  id: number,
  topicCluster: string | null,
  aiRecommendation: string | null,
): Promise<void> {
  await exec(
    `UPDATE ${tables.impressions} SET
      topic_cluster = ?,
      ai_recommendation = ?,
      updated_at = NOW()
    WHERE id = ?`,
    [topicCluster, aiRecommendation, id],
  );
}

export async function countByStatus(): Promise<Record<string, number>> {
  const rows = await queryRows<{ status: string; c: number }>(
    `SELECT status, COUNT(*) AS c FROM ${tables.impressions} GROUP BY status`,
  );
  return Object.fromEntries(rows.map((r) => [r.status, asNumber(r.c)]));
}

export async function topicRadar(days = 10): Promise<
  Array<{
    topic: string;
    count: number;
    watchmen: number;
    sample_ids: string;
  }>
> {
  const windowDays = Math.max(1, Math.min(365, Number(days) || 10));
  const rows = await queryRows<{
    topic: string;
    count: number;
    watchmen: number;
    sample_ids: string;
  }>(
    `SELECT
       COALESCE(topic_cluster, CONCAT(context, ' / ', type)) AS topic,
       COUNT(*) AS count,
       COUNT(DISTINCT watchman_id) AS watchmen,
       GROUP_CONCAT(id) AS sample_ids
     FROM ${tables.impressions}
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${windowDays} DAY)
       AND confidential = 0
     GROUP BY topic
     HAVING COUNT(*) >= 2 AND COUNT(DISTINCT watchman_id) >= 2
     ORDER BY count DESC
     LIMIT 15`,
  );
  return rows.map((r) => ({
    ...r,
    count: asNumber(r.count),
    watchmen: asNumber(r.watchmen),
  }));
}

export async function learningSummary(): Promise<{
  total: number;
  completed: number;
  noAction: number;
  repeatedTopics: Array<{ topic: string; c: number }>;
}> {
  const total =
    asNumber(
      (
        await queryOne<{ c: number }>(
          `SELECT COUNT(*) AS c FROM ${tables.impressions}`,
        )
      )?.c,
    ) || 0;
  const completed =
    asNumber(
      (
        await queryOne<{ c: number }>(
          `SELECT COUNT(*) AS c FROM ${tables.impressions} WHERE status = 'completed'`,
        )
      )?.c,
    ) || 0;
  const noAction =
    asNumber(
      (
        await queryOne<{ c: number }>(
          `SELECT COUNT(*) AS c FROM ${tables.impressions} WHERE status = 'no_action'`,
        )
      )?.c,
    ) || 0;
  const repeatedTopics = (
    await queryRows<{ topic: string; c: number }>(
      `SELECT COALESCE(topic_cluster, context) AS topic, COUNT(*) AS c
       FROM ${tables.impressions}
       GROUP BY topic
       HAVING c >= 2
       ORDER BY c DESC
       LIMIT 10`,
    )
  ).map((r) => ({ topic: r.topic, c: asNumber(r.c) }));

  return { total, completed, noAction, repeatedTopics };
}
