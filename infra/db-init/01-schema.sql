-- TA-Flowmeter MySQL 8.0 Schema  ·  v2 (scale edition)
-- Supports 10 000+ units across multiple buildings.
-- For fresh installs:  mysql -u <user> -p < db-init/01-schema.sql
-- For upgrades:        mysql -u <user> -p < db-init/03-migration-v2.sql

USE `srusun-ta252601002`;

-- -----------------------------------------
-- 1. BUILDINGS  (multi-tenant root)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS buildings (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL UNIQUE,   -- "TOWER-A", "BLOK-1", etc.
  name        VARCHAR(100) NOT NULL,
  address     TEXT         NULL,
  floors      TINYINT      NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO buildings (id, code, name) VALUES (1, 'DEFAULT', 'Default Building');

-- -----------------------------------------
-- 2. RESIDENTS
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS residents (
  email      VARCHAR(255) PRIMARY KEY,
  google_id  VARCHAR(255) UNIQUE,
  name       VARCHAR(255),
  picture    TEXT,
  role       ENUM('resident','admin') NOT NULL DEFAULT 'resident',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------
-- 3. UNITS
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS units (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  building_id          INT            NOT NULL DEFAULT 1,
  unit_no              VARCHAR(50)    NOT NULL UNIQUE,
  device_id            VARCHAR(100)   NOT NULL UNIQUE,
  resident_email       VARCHAR(255)   NULL,
  balance              DECIMAL(15,2)  NOT NULL DEFAULT 0,
  relay_status         TINYINT(1)     NOT NULL DEFAULT 1,
  valve_status         TINYINT(1)     NOT NULL DEFAULT 1,
  last_energy_reading  DECIMAL(15,4)  NOT NULL DEFAULT 0,
  last_water_reading   DECIMAL(15,4)  NOT NULL DEFAULT 0,
  created_at           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_units_resident FOREIGN KEY (resident_email) REFERENCES residents(email),
  CONSTRAINT fk_units_building FOREIGN KEY (building_id)    REFERENCES buildings(id)
);

CREATE INDEX idx_units_building  ON units (building_id);
CREATE INDEX idx_units_resident  ON units (resident_email);

-- -----------------------------------------
-- 4. METER READINGS  (partitioned time-series)
--    No FK on device_id — MySQL forbids FK on partitioned tables.
--    Referential integrity is enforced at application layer.
--    Partitioned monthly: full partition elimination on date-range queries.
--    At 10 k units × 1 reading/5 s → ~172 M rows/day; each monthly
--    partition fits in buffer pool independently.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS meter_readings (
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
  PARTITION p2027_01 VALUES LESS THAN (TO_DAYS('2027-02-01')),
  PARTITION p2027_02 VALUES LESS THAN (TO_DAYS('2027-03-01')),
  PARTITION p2027_03 VALUES LESS THAN (TO_DAYS('2027-04-01')),
  PARTITION p2027_04 VALUES LESS THAN (TO_DAYS('2027-05-01')),
  PARTITION p2027_05 VALUES LESS THAN (TO_DAYS('2027-06-01')),
  PARTITION p2027_06 VALUES LESS THAN (TO_DAYS('2027-07-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- Covers "latest N for device" and "device in date range" queries within each partition.
CREATE INDEX idx_mr_device_time ON meter_readings (device_id, time DESC);

-- -----------------------------------------
-- 5. TRANSACTIONS
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                VARCHAR(100)                       PRIMARY KEY,
  unit_id           INT                                NOT NULL,
  unit_no           VARCHAR(50)                        NOT NULL,
  amount_rp         DECIMAL(12,2)                      NOT NULL,
  method            ENUM('qris','transfer','ewallet')  NOT NULL,
  status            ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  gateway_reference VARCHAR(100)                       NULL,
  webhook_event_id  VARCHAR(255)                       NULL UNIQUE,
  created_at        DATETIME                           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at      DATETIME                           NULL,
  CONSTRAINT fk_transactions_unit FOREIGN KEY (unit_id) REFERENCES units(id)
);

CREATE INDEX idx_transactions_unit_id ON transactions (unit_id, created_at DESC);
CREATE INDEX idx_transactions_status  ON transactions (status);

-- -----------------------------------------
-- 6. TARIFFS
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS tariffs (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  utility_type   ENUM('electricity','water') NOT NULL,
  price_per_unit DECIMAL(10,4)               NOT NULL,
  effective_date DATE                        NOT NULL,
  created_at     DATETIME                    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tariffs_type_date ON tariffs (utility_type, effective_date DESC);

-- Seed default tariffs (Indonesian PLN R-1 / PDAM rates)
INSERT IGNORE INTO tariffs (utility_type, price_per_unit, effective_date)
VALUES ('electricity', 1444.70, '2024-01-01'),
       ('water',       5000.00, '2024-01-01');

-- -----------------------------------------
-- 7. AUTH REFRESH TOKENS
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  user_sub   VARCHAR(255) NOT NULL,
  unit_no    VARCHAR(50)  NULL,
  unit_id    INT          NULL,
  expires_at DATETIME     NOT NULL,
  revoked_at DATETIME     NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_sub) REFERENCES residents(email) ON DELETE CASCADE,
  CONSTRAINT fk_refresh_tokens_unit FOREIGN KEY (unit_id)  REFERENCES units(id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_user_sub   ON auth_refresh_tokens (user_sub);
CREATE INDEX idx_refresh_tokens_expires_at ON auth_refresh_tokens (expires_at);

-- -----------------------------------------
-- 8. ANOMALIES
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS anomalies (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  device_id    VARCHAR(100) NOT NULL,
  type         VARCHAR(50)  NOT NULL,
  severity     VARCHAR(20)  NOT NULL,
  description  TEXT         NOT NULL,
  action_taken TEXT         NULL,
  ml_score     DECIMAL(5,4) NULL,         -- Isolation Forest score [0,1]
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at  DATETIME     NULL,
  CONSTRAINT fk_anomalies_device FOREIGN KEY (device_id) REFERENCES units(device_id) ON DELETE CASCADE
);

CREATE INDEX idx_anomalies_device_time ON anomalies (device_id, created_at DESC);
CREATE INDEX idx_anomalies_unresolved  ON anomalies (resolved_at, device_id);

-- -----------------------------------------
-- 9. AUDIT LOGS
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  admin_email VARCHAR(255) NOT NULL,
  action      VARCHAR(50)  NOT NULL,
  entity      VARCHAR(100) NOT NULL,
  entity_id   VARCHAR(255) NULL,
  details     TEXT         NULL,
  result      VARCHAR(20)  NOT NULL DEFAULT 'success',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_admin ON audit_logs (admin_email, created_at DESC);
CREATE INDEX idx_audit_logs_time  ON audit_logs (created_at DESC);

-- -----------------------------------------
-- 10. CALIBRATION SETTINGS  (replaces in-memory AdminService.settings)
--     device_id NULL  = global default applied to all devices.
--     device_id set   = per-device override.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS calibration_settings (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  device_id       VARCHAR(100)   NULL UNIQUE,
  flowrate_factor DECIMAL(8,4)   NOT NULL DEFAULT 4.5500,
  power_factor    DECIMAL(8,4)   NOT NULL DEFAULT 1.0500,
  sampling_time   TINYINT        NOT NULL DEFAULT 5,
  updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Global default row (device_id = NULL)
INSERT IGNORE INTO calibration_settings (device_id, flowrate_factor, power_factor, sampling_time)
VALUES (NULL, 4.55, 1.05, 5);

-- -----------------------------------------
-- 11. LEGEND / LOOKUP TABLES
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS legend_switch_status (
  code        TINYINT(1) PRIMARY KEY,
  label       VARCHAR(20)  NOT NULL,
  description VARCHAR(100) NOT NULL
);
INSERT IGNORE INTO legend_switch_status VALUES
  (0, 'OFF/CLOSE', 'Device is powered off or valve is closed'),
  (1, 'ON/OPEN',   'Device is powered on or valve is open');

CREATE TABLE IF NOT EXISTS legend_anomaly_severity (
  code        VARCHAR(20) PRIMARY KEY,
  label       VARCHAR(40)  NOT NULL,
  description VARCHAR(150) NOT NULL
);
INSERT IGNORE INTO legend_anomaly_severity VALUES
  ('critical', 'Critical', 'Immediate action required — service may be offline'),
  ('warning',  'Warning',  'Attention recommended — early signs of a problem');

CREATE TABLE IF NOT EXISTS legend_anomaly_type (
  code        VARCHAR(50) PRIMARY KEY,
  label       VARCHAR(80)  NOT NULL,
  description VARCHAR(200) NOT NULL
);
INSERT IGNORE INTO legend_anomaly_type VALUES
  ('jailbreak',          'Jailbreak Detected',    'Tamper event — meter cover opened without authorisation'),
  ('water_leak',         'Water Leak',             'Sustained flow detected while valve is commanded closed'),
  ('device_offline',     'Device Offline',         'No telemetry received within the expected heartbeat window'),
  ('mcb_trip',           'MCB Trip',               'Circuit breaker tripped — power cut detected'),
  ('low_balance',        'Low Balance',            'Remaining credit is below the threshold for normal operation'),
  ('voltage_anomaly',    'Voltage Anomaly',        'Measured voltage outside +/- 10% of 220 V nominal'),
  ('sensor_malfunction', 'Sensor Malfunction',     'Sensor returning implausible or missing readings'),
  ('low_power_factor',   'Low Power Factor',       'Power factor below 0.7 — inefficient load detected'),
  ('zero_flow',          'Zero Flow',              'Meter reports zero flow while valve is open'),
  ('usage_spike',        'Usage Spike',            'Consumption jumped beyond normal variance'),
  ('backflow',           'Backflow',               'Reverse water flow detected — possible contamination risk'),
  ('ml_anomaly',         'ML Anomaly',             'Isolation Forest detected statistically anomalous sensor pattern');

CREATE TABLE IF NOT EXISTS legend_payment_method (
  code        VARCHAR(20) PRIMARY KEY,
  label       VARCHAR(40)  NOT NULL,
  description VARCHAR(150) NOT NULL
);
INSERT IGNORE INTO legend_payment_method VALUES
  ('qris',     'QRIS',          'Scan-to-pay via any QRIS-enabled e-wallet'),
  ('transfer', 'Bank Transfer', 'Manual inter-bank transfer'),
  ('ewallet',  'E-Wallet',      'Direct payment via e-wallet (e.g. GoPay, OVO)');

CREATE TABLE IF NOT EXISTS legend_transaction_status (
  code        VARCHAR(20) PRIMARY KEY,
  label       VARCHAR(40)  NOT NULL,
  description VARCHAR(150) NOT NULL
);
INSERT IGNORE INTO legend_transaction_status VALUES
  ('pending', 'Pending', 'Payment initiated but not yet confirmed by gateway'),
  ('success', 'Success', 'Payment confirmed and balance credited to unit'),
  ('failed',  'Failed',  'Payment rejected or timed out by the payment gateway');

-- -----------------------------------------
-- 12. DATA RETENTION
--     Partitions are pre-defined through 2027; p_future catches anything beyond.
--     New partitions can be added manually via ALTER TABLE ... REORGANIZE.
-- -----------------------------------------
-- NOTE: Run this as MySQL root (requires SUPER privilege) — not in this script:
--   SET GLOBAL event_scheduler = ON;
--   Or ask server admin: sudo mysql -e "SET GLOBAL event_scheduler = ON;"

-- Delete meter readings older than 1 year; fires daily at 03:00.
CREATE EVENT IF NOT EXISTS cleanup_old_partitions
  ON SCHEDULE EVERY 1 DAY
  STARTS (CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 3 HOUR)
  DO DELETE FROM meter_readings WHERE time < DATE_SUB(NOW(), INTERVAL 1 YEAR);

-- Seed data lives in db-init/02-seed-demo.sql.
