-- Intercession Watchmen — run in phpMyAdmin on database `icf_watchmen`
-- Expected tables (prefix watchmen_):
--   watchmen_users, watchmen_impressions, watchmen_prayer_focuses,
--   watchmen_prayer_focus_impressions, watchmen_draft_impressions

CREATE TABLE IF NOT EXISTS watchmen_users (
  telegram_id BIGINT NOT NULL PRIMARY KEY,
  display_name VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT watchmen_users_role_chk CHECK (role IN ('watcher','leader','admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS watchmen_impressions (
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
  CONSTRAINT watchmen_impressions_watchman_fk
    FOREIGN KEY (watchman_id) REFERENCES watchmen_users(telegram_id),
  KEY watchmen_idx_impressions_status (status),
  KEY watchmen_idx_impressions_watchman (watchman_id),
  KEY watchmen_idx_impressions_created (created_at),
  KEY watchmen_idx_impressions_cluster (topic_cluster)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS watchmen_prayer_focuses (
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
  CONSTRAINT watchmen_prayer_focuses_status_chk
    CHECK (status IN ('active','paused','completed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS watchmen_prayer_focus_impressions (
  prayer_focus_id INT NOT NULL,
  impression_id INT NOT NULL,
  PRIMARY KEY (prayer_focus_id, impression_id),
  CONSTRAINT watchmen_pfi_focus_fk
    FOREIGN KEY (prayer_focus_id) REFERENCES watchmen_prayer_focuses(id),
  CONSTRAINT watchmen_pfi_impression_fk
    FOREIGN KEY (impression_id) REFERENCES watchmen_impressions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS watchmen_draft_impressions (
  telegram_id BIGINT NOT NULL PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
