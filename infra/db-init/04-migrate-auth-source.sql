-- Migration: add source column to auth_refresh_tokens
-- Safe to run on existing DB; skips if column already exists.

USE `srusun-ta252601002`;

ALTER TABLE auth_refresh_tokens
  ADD COLUMN IF NOT EXISTS source ENUM('mobile','admin') NOT NULL DEFAULT 'mobile'
    COMMENT 'Origin of the session: mobile app or admin dashboard.'
    AFTER user_sub;

ALTER TABLE auth_refresh_tokens
  ADD INDEX IF NOT EXISTS idx_refresh_user_source (user_sub, source);
