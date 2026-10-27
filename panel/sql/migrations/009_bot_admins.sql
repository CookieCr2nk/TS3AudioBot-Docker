-- TeamSpeak UIDs that may administer one bot template.
-- Safe to run again.

CREATE TABLE IF NOT EXISTS bot_admins (
  bot_id BIGINT UNSIGNED NOT NULL,
  useruid VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (bot_id, useruid),
  CONSTRAINT fk_bot_admins_bot FOREIGN KEY (bot_id) REFERENCES ts_bots (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
