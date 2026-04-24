-- TA-Flowmeter  ·  Migration v2  (scale edition)
-- Run this on EXISTING deployments that already have v1 schema.
-- Fresh installs: use 01-schema.sql directly (already includes all changes).
--
-- Usage:  mysql -u <user> -p ta_db < db-init/03-migration-v2.sql

USE ta_db;

-- ── Step 1: Add buildings table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buildings (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(20)  NOT NULL UNIQUE,
  name       VARCHAR(100) NOT NULL,
  address    TEXT         NULL,
  floors     TINYINT      NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT IGNORE INTO buildings (id, code, name) VALUES (1, 'DEFAULT', 'Default Building');

-- ── Step 2: Add building_id to units ───────────────────────────────────────
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS building_id INT NOT NULL DEFAULT 1 AFTER id,
  ADD CONSTRAINT IF NOT EXISTS fk_units_building
    FOREIGN KEY (building_id) REFERENCES buildings(id);

CREATE INDEX IF NOT EXISTS idx_units_building ON units (building_id);
CREATE INDEX IF NOT EXISTS idx_units_resident ON units (resident_email);

-- ── Step 3: Calibration settings table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS calibration_settings (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  device_id       VARCHAR(100)   NULL UNIQUE,
  flowrate_factor DECIMAL(8,4)   NOT NULL DEFAULT 4.5500,
  power_factor    DECIMAL(8,4)   NOT NULL DEFAULT 1.0500,
  sampling_time   TINYINT        NOT NULL DEFAULT 5,
  updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO calibration_settings (device_id, flowrate_factor, power_factor, sampling_time)
VALUES (NULL, 4.55, 1.05, 5);

-- ── Step 4: Add ml_score column to anomalies ──────────────────────────────
ALTER TABLE anomalies
  ADD COLUMN IF NOT EXISTS ml_score DECIMAL(5,4) NULL AFTER action_taken;

CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved ON anomalies (resolved_at, device_id);

-- ── Step 5: Convert meter_readings to partitioned table ───────────────────
-- WARNING: This step involves a full-table copy. On large tables (>100 M rows)
--          schedule during a maintenance window. The FK on device_id is dropped
--          because MySQL does not support FK on partitioned tables.
--
-- 5a. Drop the existing FK constraint.
ALTER TABLE meter_readings DROP FOREIGN KEY IF EXISTS fk_meter_readings_device;

-- 5b. Rename old table, create partitioned table, copy data, drop old table.
RENAME TABLE meter_readings TO meter_readings_old;

CREATE TABLE meter_readings (
  time         DATETIME      NOT NULL,
  device_id    VARCHAR(100)  NOT NULL,
  voltage      DECIMAL(10,4) NULL,
  current      DECIMAL(10,4) NULL,
  power        DECIMAL(10,4) NULL,
  energy_total DECIMAL(15,4) NULL,
  water_flow   DECIMAL(10,4) NULL,
  water_total  DECIMAL(15,4) NULL,
  PRIMARY KEY (time, device_id)
)
PARTITION BY RANGE (TO_DAYS(time)) (
  PARTITION p2024_01 VALUES LESS THAN (TO_DAYS('2024-02-01')),
  PARTITION p2024_02 VALUES LESS THAN (TO_DAYS('2024-03-01')),
  PARTITION p2024_03 VALUES LESS THAN (TO_DAYS('2024-04-01')),
  PARTITION p2024_04 VALUES LESS THAN (TO_DAYS('2024-05-01')),
  PARTITION p2024_05 VALUES LESS THAN (TO_DAYS('2024-06-01')),
  PARTITION p2024_06 VALUES LESS THAN (TO_DAYS('2024-07-01')),
  PARTITION p2024_07 VALUES LESS THAN (TO_DAYS('2024-08-01')),
  PARTITION p2024_08 VALUES LESS THAN (TO_DAYS('2024-09-01')),
  PARTITION p2024_09 VALUES LESS THAN (TO_DAYS('2024-10-01')),
  PARTITION p2024_10 VALUES LESS THAN (TO_DAYS('2024-11-01')),
  PARTITION p2024_11 VALUES LESS THAN (TO_DAYS('2024-12-01')),
  PARTITION p2024_12 VALUES LESS THAN (TO_DAYS('2025-01-01')),
  PARTITION p2025_01 VALUES LESS THAN (TO_DAYS('2025-02-01')),
  PARTITION p2025_02 VALUES LESS THAN (TO_DAYS('2025-03-01')),
  PARTITION p2025_03 VALUES LESS THAN (TO_DAYS('2025-04-01')),
  PARTITION p2025_04 VALUES LESS THAN (TO_DAYS('2025-05-01')),
  PARTITION p2025_05 VALUES LESS THAN (TO_DAYS('2025-06-01')),
  PARTITION p2025_06 VALUES LESS THAN (TO_DAYS('2025-07-01')),
  PARTITION p2025_07 VALUES LESS THAN (TO_DAYS('2025-08-01')),
  PARTITION p2025_08 VALUES LESS THAN (TO_DAYS('2025-09-01')),
  PARTITION p2025_09 VALUES LESS THAN (TO_DAYS('2025-10-01')),
  PARTITION p2025_10 VALUES LESS THAN (TO_DAYS('2025-11-01')),
  PARTITION p2025_11 VALUES LESS THAN (TO_DAYS('2025-12-01')),
  PARTITION p2025_12 VALUES LESS THAN (TO_DAYS('2026-01-01')),
  PARTITION p2026_01 VALUES LESS THAN (TO_DAYS('2026-02-01')),
  PARTITION p2026_02 VALUES LESS THAN (TO_DAYS('2026-03-01')),
  PARTITION p2026_03 VALUES LESS THAN (TO_DAYS('2026-04-01')),
  PARTITION p2026_04 VALUES LESS THAN (TO_DAYS('2026-05-01')),
  PARTITION p2026_05 VALUES LESS THAN (TO_DAYS('2026-06-01')),
  PARTITION p2026_06 VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2026_07 VALUES LESS THAN (TO_DAYS('2026-08-01')),
  PARTITION p2026_08 VALUES LESS THAN (TO_DAYS('2026-09-01')),
  PARTITION p2026_09 VALUES LESS THAN (TO_DAYS('2026-10-01')),
  PARTITION p2026_10 VALUES LESS THAN (TO_DAYS('2026-11-01')),
  PARTITION p2026_11 VALUES LESS THAN (TO_DAYS('2026-12-01')),
  PARTITION p2026_12 VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

CREATE INDEX idx_mr_device_time ON meter_readings (device_id, time DESC);

-- Copy existing data
INSERT INTO meter_readings SELECT * FROM meter_readings_old;
DROP TABLE meter_readings_old;

-- ── Step 6: Add partition management events ────────────────────────────────
SET GLOBAL event_scheduler = ON;

DROP EVENT IF EXISTS cleanup_old_meter_readings;

CREATE EVENT IF NOT EXISTS cleanup_old_partitions
  ON SCHEDULE EVERY 1 DAY
  STARTS (CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 3 HOUR)
  DO DELETE FROM meter_readings WHERE time < DATE_SUB(NOW(), INTERVAL 1 YEAR);

-- ── Step 7: Seed default tariffs if not already present ──────────────────
INSERT IGNORE INTO tariffs (utility_type, price_per_unit, effective_date)
VALUES ('electricity', 1444.70, '2024-01-01'),
       ('water',       5000.00, '2024-01-01');

SELECT 'Migration v2 complete.' AS status;
