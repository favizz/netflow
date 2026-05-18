-- TA-Flowmeter MySQL 8.0 Schema  ·  v2 (scale edition)
-- Supports 10 000+ units across multiple buildings.

USE `srusun-ta252601002`;

-- 1. BUILDINGS
CREATE TABLE IF NOT EXISTS buildings (
  id          INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Unique internal identifier for the building.',
  code        VARCHAR(20)  NOT NULL UNIQUE   COMMENT 'Human-readable building code used for filtering.',
  name        VARCHAR(100) NOT NULL          COMMENT 'Official name of the building or tower.',
  address     TEXT         NULL              COMMENT 'Physical street address of the building.',
  floors      TINYINT      NOT NULL DEFAULT 1 COMMENT 'Total number of floors in the structure.',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp when the building record was created.'
);

-- 2. RESIDENTS
CREATE TABLE IF NOT EXISTS residents (
  email              VARCHAR(255) PRIMARY KEY COMMENT 'Primary email address used as the unique identifier.',
  google_id          VARCHAR(255) UNIQUE      COMMENT 'Unique identifier provided by Google OAuth.',
  name               VARCHAR(255)             COMMENT 'Full name of the resident or administrator.',
  picture            TEXT                     COMMENT 'URL to the profile picture from OAuth provider.',
  role               ENUM('resident','admin') NOT NULL DEFAULT 'resident' COMMENT 'Access level determining available features.',
  telegram_chat_id   VARCHAR(64)  NULL DEFAULT NULL COMMENT 'Identifier for Telegram bot notifications.',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp when the resident joined.'
);

-- 3. UNITS
CREATE TABLE IF NOT EXISTS units (
  id                   INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Unique internal identifier for the unit.',
  building_id          INT            NOT NULL DEFAULT 1 COMMENT 'Link to the parent building record.',
  unit_no              VARCHAR(50)    NOT NULL UNIQUE   COMMENT 'Display number for the unit, e.g., A-101.',
  device_id            VARCHAR(100)   NULL     UNIQUE   COMMENT 'Unique hardware ID of the installed meter.',
  resident_email       VARCHAR(255)   NULL              COMMENT 'Link to the resident currently assigned to this unit.',
  token_electricity    DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT 'Remaining electricity credit in kWh units.',
  token_water          DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT 'Remaining water credit in m3 units.',
  relay_status         TINYINT(1)     NOT NULL DEFAULT 1 COMMENT 'Current electricity relay state, 1 for ON.',
  valve_status         TINYINT(1)     NOT NULL DEFAULT 1 COMMENT 'Current water valve state, 1 for OPEN.',
  last_energy_reading  DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT 'Last processed cumulative energy reading in kWh.',
  last_water_reading   DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT 'Last processed cumulative water reading in m3.',
  created_at           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp when the unit was registered.',
  CONSTRAINT fk_units_resident FOREIGN KEY (resident_email) REFERENCES residents(email),
  CONSTRAINT fk_units_building FOREIGN KEY (building_id)    REFERENCES buildings(id)
);

-- 4. METER READINGS (Partitioned Time-Series)
CREATE TABLE IF NOT EXISTS meter_readings (
  time         DATETIME      NOT NULL         COMMENT 'Server timestamp when the reading was recorded.',
  device_id    VARCHAR(100)  NOT NULL         COMMENT 'Hardware ID of the device that sent the data.',
  voltage      DECIMAL(10,4) NULL             COMMENT 'Measured line voltage in Volts.',
  current      DECIMAL(10,4) NULL             COMMENT 'Measured line current in Amperes.',
  power        DECIMAL(10,4) NULL             COMMENT 'Calculated active power in Watts.',
  energy_total DECIMAL(15,4) NULL             COMMENT 'Cumulative energy register from meter in kWh.',
  water_flow   DECIMAL(10,4) NULL             COMMENT 'Instantaneous water flow rate in L/min.',
  water_total  DECIMAL(15,4) NULL             COMMENT 'Cumulative water volume from sensor in m3.',
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
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- 5. TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id                      VARCHAR(100) PRIMARY KEY COMMENT 'Unique transaction ID generated by the system.',
  unit_no                 VARCHAR(50)   NOT NULL   COMMENT 'Unit number at the time of purchase.',
  electricity_amount_rp   DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Portion of payment allocated for electricity.',
  water_amount_rp         DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Portion of payment allocated for water.',
  method                  ENUM('qris','transfer','ewallet') NOT NULL COMMENT 'Payment channel used for the transaction.',
  status                  ENUM('pending','success','failed') NOT NULL DEFAULT 'pending' COMMENT 'Current lifecycle state of the payment.',
  gateway_reference       VARCHAR(100)  NULL       COMMENT 'Unique identifier from the payment provider.',
  webhook_event_id        VARCHAR(255)  NULL UNIQUE COMMENT 'Identifier to prevent duplicate processing of callbacks.',
  created_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp when the payment was initiated.',
  confirmed_at            DATETIME      NULL       COMMENT 'Timestamp when the payment was successfully settled.'
);

-- 6. TARIFFS
CREATE TABLE IF NOT EXISTS tariffs (
  id             INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Unique identifier for the tariff record.',
  utility_type   ENUM('electricity','water') NOT NULL COMMENT 'Type of utility this price applies to.',
  price_per_unit DECIMAL(10,4)               NOT NULL COMMENT 'Cost per kWh or m3 in Rupiah.',
  effective_date DATE                        NOT NULL COMMENT 'Date when this tariff starts being active.',
  created_at     DATETIME                    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp when the tariff was set.'
);

-- 7. AUTH REFRESH TOKENS
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Unique identifier for the token record.',
  token_hash VARCHAR(255) NOT NULL UNIQUE    COMMENT 'Secure hash of the refresh token string.',
  user_sub   VARCHAR(255) NOT NULL           COMMENT 'Email address of the authenticated user.',
  expires_at DATETIME     NOT NULL           COMMENT 'Timestamp when the token becomes invalid.',
  revoked_at DATETIME     NULL               COMMENT 'Timestamp if the token was manually invalidated.',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp when the session began.',
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_sub) REFERENCES residents(email) ON DELETE CASCADE
);

-- 8. ANOMALIES
CREATE TABLE IF NOT EXISTS anomalies (
  id           INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Unique identifier for the anomaly event.',
  device_id    VARCHAR(100) NOT NULL           COMMENT 'Hardware ID where the anomaly was detected.',
  type         VARCHAR(50)  NOT NULL           COMMENT 'Categorization of the event, e.g., leak or offline.',
  severity     VARCHAR(20)  NOT NULL           COMMENT 'Impact level of the event, e.g., critical.',
  description  TEXT         NOT NULL           COMMENT 'Human-readable details of the detection.',
  action_taken TEXT         NULL               COMMENT 'Notes on remediation or admin response.',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp of initial detection.',
  resolved_at  DATETIME     NULL               COMMENT 'Timestamp when the event was closed.',
  CONSTRAINT fk_anomalies_device FOREIGN KEY (device_id) REFERENCES units(device_id) ON DELETE CASCADE
);

-- 9. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Unique identifier for the audit record.',
  actor       VARCHAR(255) NOT NULL           COMMENT 'Email or identifier of the actor (admin, system, unit number).',
  action      VARCHAR(50)  NOT NULL           COMMENT 'Description of the operation performed.',
  target_type VARCHAR(100) NOT NULL           COMMENT 'Type of resource being acted on (e.g. unit, resident, device).',
  target      VARCHAR(255) NULL               COMMENT 'Specific identifier of the target resource.',
  details     TEXT         NULL               COMMENT 'Structured JSON or text describing the changes.',
  result      VARCHAR(20)  NOT NULL DEFAULT 'success' COMMENT 'Outcome of the operation, e.g., success.',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp of the administrative action.'
);

-- 10. CALIBRATION SETTINGS (single global row)
CREATE TABLE IF NOT EXISTS calibration_settings (
  id              INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Unique identifier for the setting record.',
  flowrate_factor DECIMAL(8,4)   NOT NULL DEFAULT 4.5500 COMMENT 'Pulses per liter calibration for flow sensor.',
  power_factor    DECIMAL(8,4)   NOT NULL DEFAULT 1.0500 COMMENT 'Voltage and current correction for power meter.',
  sampling_time   TINYINT        NOT NULL DEFAULT 5      COMMENT 'Seconds between telemetry transmissions.',
  updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Timestamp of last modification.'
);
