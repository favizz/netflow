-- TA-Flowmeter Migration: Schema Cleanup v3
-- Date: 2026-05-19
-- Targets: MySQL 8.0  (cumulative — includes all prior structural changes)
--
-- Changes:
--   1. anomalies           — remove ml_score (ML service removed)
--   2. audit_logs          — rename admin_email→actor, entity→target_type, entity_id→target
--   3. auth_refresh_tokens — drop unit_no & unit_id (sessions are now user-scoped)
--   4. transactions        — drop unit_id (redundant) & amount_rp (sum of parts)
--   5. calibration_settings— drop device_id, consolidate to one global row

USE `srusun-ta252601002`;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. anomalies: remove ml_score
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE anomalies
  DROP COLUMN IF EXISTS ml_score;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. audit_logs: rename fields for accuracy (not admin-only anymore)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE audit_logs
  CHANGE admin_email actor      VARCHAR(255) NOT NULL COMMENT 'Email or identifier of the actor (admin, system, unit number)',
  CHANGE entity      target_type VARCHAR(100) NOT NULL COMMENT 'Type of resource being acted on (e.g. unit, resident, device)',
  CHANGE entity_id   target      VARCHAR(255) NULL     COMMENT 'Specific identifier of the target resource';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. auth_refresh_tokens: drop unit scope — sessions are now user-wide
--    (unit_no/unit_id had no FK constraint; drop is unconditional)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE auth_refresh_tokens
  DROP COLUMN IF EXISTS unit_no,
  DROP COLUMN IF EXISTS unit_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. transactions: unit_id is redundant (unit_no is the business key);
--    amount_rp is redundant (= electricity_amount_rp + water_amount_rp)
--    (unit_id had no FK constraint; use IF EXISTS for safety)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE transactions
  DROP COLUMN IF EXISTS unit_id,
  DROP COLUMN IF EXISTS amount_rp;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. calibration_settings: per-device overrides removed; consolidate to 1 row
--    Guard: only run the restructure if device_id column still exists.
-- ─────────────────────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS _cleanup_calibration;
DELIMITER //
CREATE PROCEDURE _cleanup_calibration()
BEGIN
  -- Skip entirely if device_id column was already dropped
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'calibration_settings'
      AND COLUMN_NAME  = 'device_id'
  ) THEN
    -- Save global (or any) row before restructuring
    SET @_cf = IFNULL(
      (SELECT flowrate_factor FROM calibration_settings WHERE device_id IS NULL LIMIT 1),
      IFNULL((SELECT flowrate_factor FROM calibration_settings LIMIT 1), 4.5500)
    );
    SET @_cp = IFNULL(
      (SELECT power_factor FROM calibration_settings WHERE device_id IS NULL LIMIT 1),
      IFNULL((SELECT power_factor FROM calibration_settings LIMIT 1), 1.0500)
    );
    SET @_st = IFNULL(
      (SELECT sampling_time FROM calibration_settings WHERE device_id IS NULL LIMIT 1),
      IFNULL((SELECT sampling_time FROM calibration_settings LIMIT 1), 5)
    );

    TRUNCATE TABLE calibration_settings;

    INSERT INTO calibration_settings (flowrate_factor, power_factor, sampling_time)
    VALUES (@_cf, @_cp, @_st);

    ALTER TABLE calibration_settings DROP INDEX IF EXISTS device_id;
    ALTER TABLE calibration_settings DROP COLUMN device_id;
  END IF;
END //
DELIMITER ;

CALL _cleanup_calibration();
DROP PROCEDURE IF EXISTS _cleanup_calibration;
