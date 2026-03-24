-- Migration: replace PIN-based auth with Google OAuth
-- Run this against the database before deploying the updated backend.

-- 1. Residents table (admin-registered email allowlist)
CREATE TABLE IF NOT EXISTS residents (
  email       VARCHAR(255) PRIMARY KEY,
  google_id   VARCHAR(255) UNIQUE,
  name        VARCHAR(255),
  picture     TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Link units to residents (nullable; one resident can own many units)
ALTER TABLE units ADD COLUMN resident_email VARCHAR(255) NULL REFERENCES residents(email);

-- 3. Migrate auth_refresh_tokens: user_sub → varchar (stores email now)
ALTER TABLE auth_refresh_tokens
  MODIFY COLUMN user_sub VARCHAR(255) NOT NULL,
  MODIFY COLUMN unit_no VARCHAR(32) NULL,
  ADD COLUMN unit_id INT NULL;

-- 4. Seed first registered resident
INSERT IGNORE INTO residents (email, name)
VALUES ('18222070@std.stei.itb.ac.id', 'Penghuni 18222070');
