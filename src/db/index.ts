import mysql from "mysql2/promise";
import { config } from "../config.js";

let pool: mysql.Pool | null = null;
let ready: Promise<void> | null = null;

/** Prefixed table names so we can share icf_english_db safely. */
export const tables = {
  users: `${config.mysql.tablePrefix}users`,
  impressions: `${config.mysql.tablePrefix}impressions`,
  prayerFocuses: `${config.mysql.tablePrefix}prayer_focuses`,
  prayerFocusImpressions: `${config.mysql.tablePrefix}prayer_focus_impressions`,
  draftImpressions: `${config.mysql.tablePrefix}draft_impressions`,
} as const;

function buildSchema(): string[] {
  const p = config.mysql.tablePrefix;
  const t = tables;
  return [
    `CREATE TABLE IF NOT EXISTS ${t.users} (
      telegram_id BIGINT NOT NULL PRIMARY KEY,
      display_name VARCHAR(255) NOT NULL,
      role VARCHAR(16) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ${p}users_role_chk CHECK (role IN ('watcher','leader','admin'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS ${t.impressions} (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      watchman_id BIGINT NOT NULL,
      watchman_name VARCHAR(255) NOT NULL,
      perceived TEXT NOT NULL,
      interpretation TEXT,
      type VARCHAR(32) NOT NULL,
      context VARCHAR(32) NOT NULL,
      urgency VARCHAR(16) NOT NULL DEFAULT 'none',
      prayed TINYINT NOT NULL DEFAULT 0,
      confidential TINYINT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'new',
      decision_notes TEXT,
      outcome TEXT,
      forwarded_to VARCHAR(255),
      topic_cluster VARCHAR(255),
      ai_recommendation TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT ${p}impressions_watchman_fk
        FOREIGN KEY (watchman_id) REFERENCES ${t.users}(telegram_id),
      KEY ${p}idx_impressions_status (status),
      KEY ${p}idx_impressions_watchman (watchman_id),
      KEY ${p}idx_impressions_created (created_at),
      KEY ${p}idx_impressions_cluster (topic_cluster)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS ${t.prayerFocuses} (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      duration_weeks INT NOT NULL DEFAULT 4,
      leader_name VARCHAR(255),
      origin_note TEXT,
      shared_with VARCHAR(255),
      review_date VARCHAR(32),
      updates TEXT,
      reflection TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT ${p}prayer_focuses_status_chk
        CHECK (status IN ('active','paused','completed'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS ${t.prayerFocusImpressions} (
      prayer_focus_id INT NOT NULL,
      impression_id INT NOT NULL,
      PRIMARY KEY (prayer_focus_id, impression_id),
      CONSTRAINT ${p}pfi_focus_fk
        FOREIGN KEY (prayer_focus_id) REFERENCES ${t.prayerFocuses}(id),
      CONSTRAINT ${p}pfi_impression_fk
        FOREIGN KEY (impression_id) REFERENCES ${t.impressions}(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS ${t.draftImpressions} (
      telegram_id BIGINT NOT NULL PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
}

export function getPool(): mysql.Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
    dateStrings: true,
    timezone: "Z",
  });
  return pool;
}

export async function initDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const db = getPool();
      // Verify we can reach the configured database before CREATE TABLE.
      const [dbRows] = await db.query("SELECT DATABASE() AS db");
      const currentDb = (dbRows as Array<{ db: string | null }>)[0]?.db;
      if (!currentDb) {
        throw new Error(
          `MySQL connected but DATABASE() is empty. Check MYSQL_DATABASE=${config.mysql.database}`,
        );
      }
      if (currentDb !== config.mysql.database) {
        throw new Error(
          `MySQL DATABASE()=${currentDb} but MYSQL_DATABASE=${config.mysql.database}`,
        );
      }

      for (const sql of buildSchema()) {
        try {
          await db.query(sql);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Failed creating schema in ${currentDb}: ${msg}\nSQL: ${sql.slice(0, 120)}…`,
          );
        }
      }

      const [tableRows] = await db.query(
        `SELECT TABLE_NAME AS name
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME`,
        [currentDb],
      );
      const names = (tableRows as Array<{ name: string }>)
        .map((r) => r.name)
        .join(", ");
      console.log(
        `MySQL connected: ${config.mysql.host}:${config.mysql.port}/${currentDb} (prefix=${config.mysql.tablePrefix || "(none)"})`,
      );
      console.log(`MySQL tables: ${names || "(none — CREATE failed?)"}`);
    })();
  }
  await ready;
}

export async function closeDb(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
  ready = null;
}

export async function queryRows<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await getPool().query(sql, params);
  return rows as T[];
}

export async function queryOne<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await queryRows<T>(sql, params);
  return rows[0];
}

export async function exec(
  sql: string,
  params: unknown[] = [],
): Promise<mysql.ResultSetHeader> {
  const [result] = await getPool().query(sql, params);
  return result as mysql.ResultSetHeader;
}

export function asNumber(value: unknown): number {
  return Number(value);
}

export async function getDbStatus(): Promise<{
  host: string;
  port: number;
  database: string;
  prefix: string;
  tables: string[];
  impressions: number;
  users: number;
  drafts: number;
}> {
  await initDb();
  const [dbRows] = await getPool().query("SELECT DATABASE() AS db");
  const database =
    (dbRows as Array<{ db: string | null }>)[0]?.db || config.mysql.database;

  const tableRows = await queryRows<{ name: string }>(
    `SELECT TABLE_NAME AS name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME`,
    [database],
  );

  let impressions = 0;
  let users = 0;
  let drafts = 0;
  try {
    impressions =
      asNumber(
        (
          await queryOne<{ c: number }>(
            `SELECT COUNT(*) AS c FROM ${tables.impressions}`,
          )
        )?.c,
      ) || 0;
    users =
      asNumber(
        (
          await queryOne<{ c: number }>(
            `SELECT COUNT(*) AS c FROM ${tables.users}`,
          )
        )?.c,
      ) || 0;
    drafts =
      asNumber(
        (
          await queryOne<{ c: number }>(
            `SELECT COUNT(*) AS c FROM ${tables.draftImpressions}`,
          )
        )?.c,
      ) || 0;
  } catch {
    // Tables may not exist yet in this schema.
  }

  return {
    host: config.mysql.host,
    port: config.mysql.port,
    database,
    prefix: config.mysql.tablePrefix,
    tables: tableRows.map((r) => r.name),
    impressions,
    users,
    drafts,
  };
}
