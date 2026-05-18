-- TA-Flowmeter Demo Seed
-- Run after 01-schema.sql.
-- Usage: mysql -u <user> -p < db-init/02-seed-demo.sql

USE `srusun-ta252601002`;

-- -----------------------------------------
-- 1. BUILDINGS (3 demo towers)
--    Building id=1 'DEFAULT' already exists from schema.
-- -----------------------------------------

INSERT IGNORE INTO buildings (id, code, name, address, floors) VALUES
  (2, 'TOWER-A', 'Tower A', 'Jl. Pahlawan No. 1, Bandung', 3),
  (3, 'TOWER-B', 'Tower B', 'Jl. Pahlawan No. 2, Bandung', 3),
  (4, 'TOWER-C', 'Tower C', 'Jl. Pahlawan No. 3, Bandung', 2),
  (5, 'TOWER-D', 'Tower D', 'Jl. Pahlawan No. 4, Bandung', 2);

-- -----------------------------------------
-- 2. TARIFFS
--    2024 baseline already seeded by 01-schema.sql (INSERT IGNORE).
--    Only add the 2025 rate revision here.
-- -----------------------------------------

INSERT IGNORE INTO tariffs (utility_type, price_per_unit, effective_date) VALUES
  ('electricity', 1500.00, '2025-01-01'),
  ('water',       5500.00, '2025-01-01');

-- -----------------------------------------
-- 3. RESIDENTS (18 residents + 1 admin)
-- -----------------------------------------

INSERT IGNORE INTO residents (email, name, role) VALUES
  ('izza.diasputra10@gmail.com', 'System Admin',     'admin'),
  ('18222134@std.stei.itb.ac.id', 'System Admin 2', 'admin'),
  ('cubloxitwo@gmail.com',       'Resident Two',     'resident'),
  ('cubloxithree@gmail.com',     'Resident Three',   'resident'),
  ('cubloxifour@gmail.com',      'Resident Four',    'resident'),
  ('cubloxifive@gmail.com',      'Resident Five',    'resident'),
  ('cubloxisix@gmail.com',       'Resident Six',     'resident'),
  ('cubloxiseven@gmail.com',     'Resident Seven',   'resident'),
  ('cubloxieight@gmail.com',     'Resident Eight',   'resident'),
  ('cubloxinine@gmail.com',      'Resident Nine',    'resident'),
  ('cubloxiten@gmail.com',       'Resident Ten',     'resident'),
  ('cubloxieleven@gmail.com',    'Resident Eleven',  'resident'),
  ('cubloxitwelve@gmail.com',    'Resident Twelve',  'resident'),
  ('cubloxithirteen@gmail.com',  'Resident Thirteen','resident'),
  ('cubloxifourteen@gmail.com',  'Resident Fourteen','resident'),
  ('cubloxififteen@gmail.com',   'Resident Fifteen', 'resident'),
  ('cubloxisixteen@gmail.com',   'Resident Sixteen', 'resident'),
  ('cubloxiseventeen@gmail.com', 'Resident Seventeen','resident'),
  ('cubloxieighteen@gmail.com',  'Resident Eighteen','resident'),
  ('cubloxinineteen@gmail.com',  'Resident Nineteen','resident');

-- -----------------------------------------
-- 4. UNITS (20 units across 3 towers)
--    A-* → building_id=2 (Tower A)
--    B-* → building_id=3 (Tower B)
--    C-* → building_id=4 (Tower C)
-- -----------------------------------------

INSERT IGNORE INTO units (building_id, unit_no, device_id, resident_email, token_electricity, token_water, relay_status, valve_status, last_energy_reading, last_water_reading) VALUES
  -- Tower A
  (2, 'A-101', 'DEV-A-101', 'cubloxitwo@gmail.com',         100.0000, 20.0000, 1, 1, 0, 0),
  (2, 'A-102', 'DEV-A-102', 'cubloxitwo@gmail.com',           8.0000,  5.0000, 1, 1, 0, 0),
  (2, 'A-103', 'DEV-A-103', 'cubloxithree@gmail.com',        50.0000, 10.0000, 1, 1, 0, 0),
  (2, 'A-201', 'DEV-A-201', 'cubloxifour@gmail.com',        133.0000, 25.0000, 1, 1, 0, 0),
  (2, 'A-202', 'DEV-A-202', 'cubloxifive@gmail.com',         63.0000, 12.0000, 1, 1, 0, 0),
  (2, 'A-203', 'DEV-A-203', 'cubloxisix@gmail.com',          20.0000,  4.0000, 1, 1, 0, 0),
  (2, 'A-301', 'DEV-A-301', 'cubloxiseven@gmail.com',       116.0000, 22.0000, 1, 1, 0, 0),
  (2, 'A-302', 'DEV-A-302', NULL,                             33.0000,  8.0000, 1, 1, 0, 0),
  -- Tower B
  (3, 'B-101', 'DEV-B-101', 'cubloxieight@gmail.com',        80.0000, 15.0000, 1, 1, 0, 0),
  (3, 'B-102', 'DEV-B-102', 'cubloxinine@gmail.com',         30.0000,  6.0000, 1, 1, 0, 0),
  (3, 'B-103', 'DEV-B-103', 'cubloxiten@gmail.com',          58.0000, 11.0000, 1, 1, 0, 0),
  (3, 'B-201', 'DEV-B-201', 'cubloxieleven@gmail.com',      166.0000, 30.0000, 1, 1, 0, 0),
  (3, 'B-202', 'DEV-B-202', 'cubloxitwelve@gmail.com',        3.0000,  0.5000, 0, 0, 0, 0),
  (3, 'B-203', 'DEV-B-203', NULL,                             40.0000,  9.0000, 1, 1, 0, 0),
  (3, 'B-301', 'DEV-B-301', 'cubloxithirteen@gmail.com',     93.0000, 18.0000, 1, 1, 0, 0),
  -- Tower C
  (4, 'C-101', 'DEV-C-101', 'cubloxifourteen@gmail.com',     46.0000, 10.0000, 1, 1, 0, 0),
  (4, 'C-102', 'DEV-C-102', 'cubloxififteen@gmail.com',      66.0000, 14.0000, 1, 1, 0, 0),
  (4, 'C-103', 'DEV-C-103', 'cubloxisixteen@gmail.com',      23.0000,  5.0000, 1, 1, 0, 0),
  (4, 'C-201', 'DEV-C-201', 'cubloxiseventeen@gmail.com',   120.0000, 24.0000, 1, 1, 0, 0),
  (4, 'C-202', 'DEV-C-202', NULL,                             53.0000, 11.0000, 1, 1, 0, 0);

-- -----------------------------------------
-- 5. METER READINGS (30 days × hourly per device, 5 devices)
-- -----------------------------------------

-- DEV-A-101
INSERT INTO meter_readings (time, device_id, voltage, current, power, energy_total, water_flow, water_total)
SELECT
  DATE_SUB(NOW(), INTERVAL n HOUR), 'DEV-A-101',
  219 + (RAND() * 5),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 6 AND 22 THEN 3.5 + RAND() * 2.5 ELSE 0.7 + RAND() * 0.8 END,
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 6 AND 22 THEN 750 + RAND() * 600 ELSE 150 + RAND() * 200 END,
  ROUND(1250 + (720 - n) * 0.87 + RAND() * 0.15, 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 6 AND 22 THEN ROUND(1.5 + RAND() * 3.5, 4) ELSE 0 END,
  ROUND(180 + (720 - n) * 0.10 + RAND() * 0.02, 4)
FROM (
  SELECT h.i * 100 + t.i * 10 + o.i AS n FROM
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) h
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) o
  WHERE h.i * 100 + t.i * 10 + o.i <= 720
) seq;

-- DEV-A-102
INSERT INTO meter_readings (time, device_id, voltage, current, power, energy_total, water_flow, water_total)
SELECT
  DATE_SUB(NOW(), INTERVAL n HOUR), 'DEV-A-102',
  220 + (RAND() * 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 7 AND 21 THEN 1.8 + RAND() * 1.8 ELSE 0.3 + RAND() * 0.4 END,
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 7 AND 21 THEN 350 + RAND() * 450 ELSE 60 + RAND() * 120 END,
  ROUND(890 + (720 - n) * 0.52 + RAND() * 0.10, 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 7 AND 21 THEN ROUND(0.8 + RAND() * 2.2, 4) ELSE 0 END,
  ROUND(120 + (720 - n) * 0.065 + RAND() * 0.01, 4)
FROM (
  SELECT h.i * 100 + t.i * 10 + o.i AS n FROM
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) h
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) o
  WHERE h.i * 100 + t.i * 10 + o.i <= 720
) seq;

-- DEV-A-103
INSERT INTO meter_readings (time, device_id, voltage, current, power, energy_total, water_flow, water_total)
SELECT
  DATE_SUB(NOW(), INTERVAL n HOUR), 'DEV-A-103',
  220 + (RAND() * 3),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 8 AND 20 THEN 1.0 + RAND() * 1.5 ELSE 0.2 + RAND() * 0.3 END,
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 8 AND 20 THEN 200 + RAND() * 300 ELSE 40 + RAND() * 60 END,
  ROUND(560 + (720 - n) * 0.30 + RAND() * 0.08, 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 8 AND 20 THEN ROUND(0.5 + RAND() * 1.5, 4) ELSE 0 END,
  ROUND(75 + (720 - n) * 0.04 + RAND() * 0.01, 4)
FROM (
  SELECT h.i * 100 + t.i * 10 + o.i AS n FROM
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) h
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) o
  WHERE h.i * 100 + t.i * 10 + o.i <= 720
) seq;

-- DEV-B-101
INSERT INTO meter_readings (time, device_id, voltage, current, power, energy_total, water_flow, water_total)
SELECT
  DATE_SUB(NOW(), INTERVAL n HOUR), 'DEV-B-101',
  221 + (RAND() * 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 6 AND 22 THEN 2.5 + RAND() * 2.0 ELSE 0.5 + RAND() * 0.5 END,
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 6 AND 22 THEN 550 + RAND() * 500 ELSE 100 + RAND() * 150 END,
  ROUND(980 + (720 - n) * 0.65 + RAND() * 0.12, 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 6 AND 22 THEN ROUND(1.2 + RAND() * 2.8, 4) ELSE 0 END,
  ROUND(140 + (720 - n) * 0.08 + RAND() * 0.015, 4)
FROM (
  SELECT h.i * 100 + t.i * 10 + o.i AS n FROM
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) h
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) o
  WHERE h.i * 100 + t.i * 10 + o.i <= 720
) seq;

-- DEV-C-101
INSERT INTO meter_readings (time, device_id, voltage, current, power, energy_total, water_flow, water_total)
SELECT
  DATE_SUB(NOW(), INTERVAL n HOUR), 'DEV-C-101',
  218 + (RAND() * 6),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 7 AND 23 THEN 4.0 + RAND() * 3.0 ELSE 0.8 + RAND() * 1.0 END,
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 7 AND 23 THEN 880 + RAND() * 700 ELSE 170 + RAND() * 230 END,
  ROUND(1600 + (720 - n) * 1.10 + RAND() * 0.20, 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 7 AND 23 THEN ROUND(2.0 + RAND() * 4.0, 4) ELSE 0 END,
  ROUND(220 + (720 - n) * 0.13 + RAND() * 0.025, 4)
FROM (
  SELECT h.i * 100 + t.i * 10 + o.i AS n FROM
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) h
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) o
  WHERE h.i * 100 + t.i * 10 + o.i <= 720
) seq;

-- -----------------------------------------
-- 6. PAYMENT TRANSACTIONS
-- -----------------------------------------

INSERT IGNORE INTO transactions (id, unit_id, unit_no, amount_rp, method, status, gateway_reference, created_at, confirmed_at) VALUES
  ('TRX-001', (SELECT id FROM units WHERE unit_no='A-101'), 'A-101', 200000.00, 'qris',     'success', 'PG-100001', DATE_SUB(NOW(), INTERVAL 88 DAY), DATE_SUB(NOW(), INTERVAL 88 DAY) + INTERVAL 5  MINUTE),
  ('TRX-002', (SELECT id FROM units WHERE unit_no='A-101'), 'A-101', 150000.00, 'transfer', 'success', 'PG-100002', DATE_SUB(NOW(), INTERVAL 65 DAY), DATE_SUB(NOW(), INTERVAL 65 DAY) + INTERVAL 12 MINUTE),
  ('TRX-003', (SELECT id FROM units WHERE unit_no='A-101'), 'A-101', 100000.00, 'ewallet',  'success', 'PG-100003', DATE_SUB(NOW(), INTERVAL 47 DAY), DATE_SUB(NOW(), INTERVAL 47 DAY) + INTERVAL 2  MINUTE),
  ('TRX-004', (SELECT id FROM units WHERE unit_no='A-101'), 'A-101', 200000.00, 'qris',     'success', 'PG-100004', DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 30 DAY) + INTERVAL 8  MINUTE),
  ('TRX-005', (SELECT id FROM units WHERE unit_no='A-101'), 'A-101',  50000.00, 'ewallet',  'success', 'PG-100005', DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY) + INTERVAL 1  MINUTE),
  ('TRX-006', (SELECT id FROM units WHERE unit_no='A-101'), 'A-101', 150000.00, 'transfer', 'success', 'PG-100006', DATE_SUB(NOW(), INTERVAL 3  DAY), DATE_SUB(NOW(), INTERVAL 3  DAY) + INTERVAL 9  MINUTE),
  ('TRX-007', (SELECT id FROM units WHERE unit_no='A-102'), 'A-102', 100000.00, 'qris',     'success', 'PG-100007', DATE_SUB(NOW(), INTERVAL 75 DAY), DATE_SUB(NOW(), INTERVAL 75 DAY) + INTERVAL 4  MINUTE),
  ('TRX-008', (SELECT id FROM units WHERE unit_no='A-102'), 'A-102',  50000.00, 'ewallet',  'success', 'PG-100008', DATE_SUB(NOW(), INTERVAL 42 DAY), DATE_SUB(NOW(), INTERVAL 42 DAY) + INTERVAL 3  MINUTE),
  ('TRX-009', (SELECT id FROM units WHERE unit_no='A-102'), 'A-102', 100000.00, 'transfer', 'success', 'PG-100009', DATE_SUB(NOW(), INTERVAL 18 DAY), DATE_SUB(NOW(), INTERVAL 18 DAY) + INTERVAL 15 MINUTE),
  ('TRX-010', (SELECT id FROM units WHERE unit_no='A-102'), 'A-102', 100000.00, 'qris',     'pending', 'PG-100010', DATE_SUB(NOW(), INTERVAL 2  HOUR), NULL),
  ('TRX-011', (SELECT id FROM units WHERE unit_no='B-101'), 'B-101', 200000.00, 'qris',     'success', 'PG-100011', DATE_SUB(NOW(), INTERVAL 60 DAY), DATE_SUB(NOW(), INTERVAL 60 DAY) + INTERVAL 6  MINUTE),
  ('TRX-012', (SELECT id FROM units WHERE unit_no='B-101'), 'B-101',  75000.00, 'ewallet',  'success', 'PG-100012', DATE_SUB(NOW(), INTERVAL 25 DAY), DATE_SUB(NOW(), INTERVAL 25 DAY) + INTERVAL 2  MINUTE),
  ('TRX-013', (SELECT id FROM units WHERE unit_no='C-101'), 'C-101', 300000.00, 'transfer', 'success', 'PG-100013', DATE_SUB(NOW(), INTERVAL 45 DAY), DATE_SUB(NOW(), INTERVAL 45 DAY) + INTERVAL 10 MINUTE),
  ('TRX-014', (SELECT id FROM units WHERE unit_no='C-101'), 'C-101', 150000.00, 'qris',     'success', 'PG-100014', DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY) + INTERVAL 3  MINUTE),
  ('TRX-015', (SELECT id FROM units WHERE unit_no='A-201'), 'A-201', 250000.00, 'transfer', 'success', 'PG-100015', DATE_SUB(NOW(), INTERVAL 55 DAY), DATE_SUB(NOW(), INTERVAL 55 DAY) + INTERVAL 8  MINUTE);

-- -----------------------------------------
-- 7. DEMO ANOMALIES (showcase all detection types)
-- -----------------------------------------

INSERT IGNORE INTO anomalies (device_id, type, severity, description, action_taken, ml_score, created_at) VALUES
  ('DEV-B-202', 'low_balance',        'warning',  'Electricity token below 5 kWh threshold',        'Relay cut off automatically',         NULL,   DATE_SUB(NOW(), INTERVAL 2  DAY)),
  ('DEV-A-103', 'voltage_anomaly',    'warning',  'Voltage 198V - below ±10% of 220V nominal',      'Monitoring; no relay action taken',   NULL,   DATE_SUB(NOW(), INTERVAL 5  DAY)),
  ('DEV-B-101', 'usage_spike',        'warning',  'Energy 3× above 7-day average in 1 hour',        'Flagged for resident review',         NULL,   DATE_SUB(NOW(), INTERVAL 8  DAY)),
  ('DEV-C-101', 'ml_anomaly',         'warning',  'Isolation Forest score 0.82 - statistical outlier','Rule-based checks normal; ML flagged',0.8200, DATE_SUB(NOW(), INTERVAL 3  DAY)),
  ('DEV-A-201', 'sensor_malfunction', 'critical', 'Water flow sensor returning null for 15+ minutes','Device rebooted via MQTT command',    NULL,   DATE_SUB(NOW(), INTERVAL 12 DAY)),
  ('DEV-A-102', 'low_balance',        'warning',  'Water token 1.0 m3 - approaching zero',          'Resident notified',                   NULL,   DATE_SUB(NOW(), INTERVAL 1  DAY));
