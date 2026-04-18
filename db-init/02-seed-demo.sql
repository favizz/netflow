-- TA-Flowmeter Demo Seed
-- Run after 01-schema.sql. Docker entrypoint handles ordering automatically.

USE ta_db;

-- -----------------------------------------
-- 1. TARIFFS (global config — no FK to units)
-- -----------------------------------------

INSERT INTO tariffs (utility_type, price_per_unit, effective_date)
VALUES
  ('electricity', 1444.70, '2024-01-01'),
  ('electricity', 1500.00, '2025-01-01'),
  ('water',       5000.00, '2024-01-01'),
  ('water',       5500.00, '2025-01-01');

-- -----------------------------------------
-- 2. RESIDENTS (18 residents + 1 admin)
-- -----------------------------------------

INSERT INTO residents (email, name, role) VALUES
  ('izza.diasputra10@gmail.com',          'System Admin',       'admin'),
  ('18222070@std.stei.itb.ac.id',  'Budi Santoso',       'resident'),
  ('rina.hapsari@gmail.com',       'Rina Hapsari',       'resident'),
  ('dedi.kurniawan@yahoo.com',     'Dedi Kurniawan',     'resident'),
  ('siti.rahayu@gmail.com',        'Siti Rahayu',        'resident'),
  ('ahmad.fauzi@outlook.com',      'Ahmad Fauzi',        'resident'),
  ('dewi.permata@gmail.com',       'Dewi Permata',       'resident'),
  ('hendra.susanto@gmail.com',     'Hendra Susanto',     'resident'),
  ('maya.lestari@hotmail.com',     'Maya Lestari',       'resident'),
  ('rizki.pratama@gmail.com',      'Rizki Pratama',      'resident'),
  ('novia.anggraini@gmail.com',    'Novia Anggraini',    'resident'),
  ('fajar.nugroho@gmail.com',      'Fajar Nugroho',      'resident'),
  ('ayu.rahmawati@gmail.com',      'Ayu Rahmawati',      'resident'),
  ('dian.safitri@gmail.com',       'Dian Safitri',       'resident'),
  ('bagas.wicaksono@gmail.com',    'Bagas Wicaksono',    'resident'),
  ('laras.anggraini@gmail.com',    'Laras Anggraini',    'resident'),
  ('kevin.abadi@gmail.com',        'Kevin Abadi',        'resident'),
  ('nina.suryani@gmail.com',       'Nina Suryani',       'resident'),
  ('yusuf.hakim@gmail.com',        'Yusuf Hakim',        'resident');

-- -----------------------------------------
-- 3. UNITS (20 units across towers A, B, C)
-- -----------------------------------------

INSERT INTO units (unit_no, device_id, resident_email, balance, relay_status, valve_status, last_energy_reading, last_water_reading)
VALUES
  ('A-101', 'DEV-A-101', '18222070@std.stei.itb.ac.id', 150000.00, 1, 1, 0, 0),
  ('A-102', 'DEV-A-102', '18222070@std.stei.itb.ac.id',  12000.00, 1, 1, 0, 0),
  ('A-103', 'DEV-A-103', 'rina.hapsari@gmail.com',        75000.00, 1, 1, 0, 0),
  ('A-201', 'DEV-A-201', 'dedi.kurniawan@yahoo.com',     200000.00, 1, 1, 0, 0),
  ('A-202', 'DEV-A-202', 'siti.rahayu@gmail.com',         95000.00, 1, 1, 0, 0),
  ('A-203', 'DEV-A-203', 'ahmad.fauzi@outlook.com',       30000.00, 1, 1, 0, 0),
  ('A-301', 'DEV-A-301', 'dewi.permata@gmail.com',       175000.00, 1, 1, 0, 0),
  ('A-302', 'DEV-A-302', NULL,                             50000.00, 1, 1, 0, 0),
  ('B-101', 'DEV-B-101', 'hendra.susanto@gmail.com',     120000.00, 1, 1, 0, 0),
  ('B-102', 'DEV-B-102', 'maya.lestari@hotmail.com',      45000.00, 1, 1, 0, 0),
  ('B-103', 'DEV-B-103', 'rizki.pratama@gmail.com',       88000.00, 1, 1, 0, 0),
  ('B-201', 'DEV-B-201', 'novia.anggraini@gmail.com',    250000.00, 1, 1, 0, 0),
  ('B-202', 'DEV-B-202', 'fajar.nugroho@gmail.com',        5000.00, 0, 0, 0, 0),
  ('B-203', 'DEV-B-203', NULL,                             60000.00, 1, 1, 0, 0),
  ('B-301', 'DEV-B-301', 'ayu.rahmawati@gmail.com',      140000.00, 1, 1, 0, 0),
  ('C-101', 'DEV-C-101', 'dian.safitri@gmail.com',        70000.00, 1, 1, 0, 0),
  ('C-102', 'DEV-C-102', 'bagas.wicaksono@gmail.com',    100000.00, 1, 1, 0, 0),
  ('C-103', 'DEV-C-103', 'laras.anggraini@gmail.com',     35000.00, 1, 1, 0, 0),
  ('C-201', 'DEV-C-201', 'kevin.abadi@gmail.com',        180000.00, 1, 1, 0, 0),
  ('C-202', 'DEV-C-202', NULL,                             80000.00, 1, 1, 0, 0);

-- -----------------------------------------
-- 4. METER READINGS (30 days x hourly per device, 5 devices for demo speed)
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
-- 5. PAYMENT TRANSACTIONS
-- -----------------------------------------

INSERT INTO transactions (id, unit_id, unit_no, amount_rp, method, status, gateway_reference, created_at, confirmed_at) VALUES
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
