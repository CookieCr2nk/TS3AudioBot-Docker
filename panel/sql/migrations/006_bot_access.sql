-- Optional passwords, who may create bots, and which user a bot belongs to.
-- Safe to run again.

ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_create_bots TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS assignee_user_id BIGINT UNSIGNED NULL;

ALTER TABLE ts_bots ADD CONSTRAINT fk_ts_bots_assignee
  FOREIGN KEY IF NOT EXISTS (assignee_user_id) REFERENCES users (id) ON DELETE SET NULL;
