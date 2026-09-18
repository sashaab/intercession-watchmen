import { getDb } from "../db/index.js";
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

export function getDraft(telegramId: number): DraftPayload | null {
  const row = getDb()
    .prepare("SELECT payload FROM draft_impressions WHERE telegram_id = ?")
    .get(telegramId) as { payload: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.payload) as DraftPayload;
}

export function saveDraft(telegramId: number, draft: DraftPayload): void {
  getDb()
    .prepare(
      `INSERT INTO draft_impressions (telegram_id, payload, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(telegram_id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = datetime('now')`,
    )
    .run(telegramId, JSON.stringify(draft));
}

export function clearDraft(telegramId: number): void {
  getDb()
    .prepare("DELETE FROM draft_impressions WHERE telegram_id = ?")
    .run(telegramId);
}

export function createImpression(input: CreateImpressionInput): ImpressionRow {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO impressions (
        watchman_id, watchman_name, perceived, interpretation, type, context,
        urgency, prayed, confidential, topic_cluster, ai_recommendation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
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
    );

  return getImpression(Number(result.lastInsertRowid))!;
}

export function getImpression(id: number): ImpressionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM impressions WHERE id = ?")
    .get(id) as ImpressionRow | undefined;
}

export function listOwnImpressions(
  watchmanId: number,
  limit = 10,
): ImpressionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM impressions
       WHERE watchman_id = ?
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
    )
    .all(watchmanId, limit) as ImpressionRow[];
}

export function listImpressionsForLeaders(opts?: {
  status?: Status;
  includeConfidential?: boolean;
  limit?: number;
}): ImpressionRow[] {
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

  const sql = `SELECT * FROM impressions
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY
      CASE urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
      datetime(created_at) DESC
    LIMIT ?`;
  params.push(limit);

  return getDb().prepare(sql).all(...params) as ImpressionRow[];
}

export function updateImpressionStatus(
  id: number,
  status: Status,
  extras?: {
    decisionNotes?: string;
    outcome?: string;
    forwardedTo?: string;
  },
): void {
  getDb()
    .prepare(
      `UPDATE impressions SET
        status = ?,
        decision_notes = COALESCE(?, decision_notes),
        outcome = COALESCE(?, outcome),
        forwarded_to = COALESCE(?, forwarded_to),
        updated_at = datetime('now')
      WHERE id = ?`,
    )
    .run(
      status,
      extras?.decisionNotes ?? null,
      extras?.outcome ?? null,
      extras?.forwardedTo ?? null,
      id,
    );
}

export function setAiFields(
  id: number,
  topicCluster: string | null,
  aiRecommendation: string | null,
): void {
  getDb()
    .prepare(
      `UPDATE impressions SET
        topic_cluster = ?,
        ai_recommendation = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
    )
    .run(topicCluster, aiRecommendation, id);
}

export function countByStatus(): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT status, COUNT(*) AS c FROM impressions GROUP BY status`,
    )
    .all() as Array<{ status: string; c: number }>;
  return Object.fromEntries(rows.map((r) => [r.status, r.c]));
}

export function topicRadar(days = 10): Array<{
  topic: string;
  count: number;
  watchmen: number;
  sample_ids: string;
}> {
  return getDb()
    .prepare(
      `SELECT
         COALESCE(topic_cluster, context || ' / ' || type) AS topic,
         COUNT(*) AS count,
         COUNT(DISTINCT watchman_id) AS watchmen,
         GROUP_CONCAT(id) AS sample_ids
       FROM impressions
       WHERE datetime(created_at) >= datetime('now', ?)
         AND confidential = 0
       GROUP BY topic
       HAVING COUNT(*) >= 2 AND COUNT(DISTINCT watchman_id) >= 2
       ORDER BY count DESC
       LIMIT 15`,
    )
    .all(`-${days} days`) as Array<{
    topic: string;
    count: number;
    watchmen: number;
    sample_ids: string;
  }>;
}

export function learningSummary(): {
  total: number;
  completed: number;
  noAction: number;
  repeatedTopics: Array<{ topic: string; c: number }>;
} {
  const db = getDb();
  const total = (
    db.prepare("SELECT COUNT(*) AS c FROM impressions").get() as { c: number }
  ).c;
  const completed = (
    db
      .prepare("SELECT COUNT(*) AS c FROM impressions WHERE status = 'completed'")
      .get() as { c: number }
  ).c;
  const noAction = (
    db
      .prepare("SELECT COUNT(*) AS c FROM impressions WHERE status = 'no_action'")
      .get() as { c: number }
  ).c;
  const repeatedTopics = db
    .prepare(
      `SELECT COALESCE(topic_cluster, context) AS topic, COUNT(*) AS c
       FROM impressions
       GROUP BY topic
       HAVING c >= 2
       ORDER BY c DESC
       LIMIT 10`,
    )
    .all() as Array<{ topic: string; c: number }>;

  return { total, completed, noAction, repeatedTopics };
}
