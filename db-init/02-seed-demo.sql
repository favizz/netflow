-- TA-Flowmeter Demo Seed
-- Run after 01-schema.sql. Docker entrypoint handles ordering automatically.
--
-- Resident : 18222070@std.stei.itb.ac.id
-- Units    : A-101 (healthy), A-102 (low balance), A-103 + A-201 (unassigned)
-- Telemetry: 30 days x hourly per device (~721 rows each)
-- Payments : top-up history over ~3 months

-- -----------------------------------------
-- 1. REFERENCE DATA
-- -----------------------------------------

INSERT IGNORE INTO tariffs (utility_type, price_per_unit, effective_date)
VALUES
  ('electricity', 1444.70, '2024-01-01'),
  ('water',       5000.00, '2024-01-01');

INSERT IGNORE INTO residents (email, name)
VALUES ('18222070@std.stei.itb.ac.id', 'Demo Penghuni');

-- -----------------------------------------
-- 2. UNITS
--    A-101: Rp 150 000 -> ~104 kWh remaining -> status "Aman"
--    A-102: Rp  12 000 -> ~  8 kWh remaining -> status "Kurang" + warning banner
-- -----------------------------------------

INSERT IGNORE INTO units
  (unit_no, device_id, resident_email, balance, relay_status, valve_status,
   last_energy_reading, last_water_reading, energy_tariff, water_tariff)
VALUES
  ('A-101', 'DEV-A-101', '18222070@std.stei.itb.ac.id', 150000.00, 1, 1, 0, 0, 1444.70, 5000.00),
  ('A-102', 'DEV-A-102', '18222070@std.stei.itb.ac.id',  12000.00, 1, 1, 0, 0, 1444.70, 5000.00),
  ('A-103', 'DEV-A-103', NULL,                            75000.00, 1, 1, 0, 0, 1444.70, 5000.00),
  ('A-201', 'DEV-A-201', NULL,                           200000.00, 1, 1, 0, 0, 1444.70, 5000.00);

-- -----------------------------------------
-- 3. METER READINGS
--    Number series 0..720 built with a 3-level cross join (8x10x10 = 800 rows,
--    filtered to <=720). Works on any MySQL version, no CTEs needed.
--
--    n=720 -> 30 days ago (oldest), n=0 -> now (newest)
--    energy_total = base + (720 - n) * rate  (increases toward present)
--    water_total  = base + (720 - n) * rate
--    power varies by hour: daytime high, night low
-- -----------------------------------------

-- DEV-A-101: 2-bedroom apartment, moderate usage
INSERT IGNORE INTO meter_readings
  (time, device_id, voltage, current, power, energy_total, water_flow, water_total)
SELECT
  DATE_SUB(NOW(), INTERVAL n HOUR),
  'DEV-A-101',
  219 + (RAND() * 5),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 6 AND 22
    THEN 3.5 + RAND() * 2.5
    ELSE 0.7 + RAND() * 0.8
  END,
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 6 AND 22
    THEN 750 + RAND() * 600
    ELSE 150 + RAND() * 200
  END,
  ROUND(1250 + (720 - n) * 0.87 + RAND() * 0.15, 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 6 AND 22
    THEN ROUND(1.5 + RAND() * 3.5, 4)
    ELSE 0
  END,
  ROUND(180 + (720 - n) * 0.10 + RAND() * 0.02, 4)
FROM (
  SELECT h.i * 100 + t.i * 10 + o.i AS n
  FROM
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
     UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) h
    CROSS JOIN
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
     UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
     UNION ALL SELECT 8 UNION ALL SELECT 9) t
    CROSS JOIN
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
     UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
     UNION ALL SELECT 8 UNION ALL SELECT 9) o
  WHERE h.i * 100 + t.i * 10 + o.i <= 720
) seq;

-- DEV-A-102: studio, lighter usage
INSERT IGNORE INTO meter_readings
  (time, device_id, voltage, current, power, energy_total, water_flow, water_total)
SELECT
  DATE_SUB(NOW(), INTERVAL n HOUR),
  'DEV-A-102',
  220 + (RAND() * 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 7 AND 21
    THEN 1.8 + RAND() * 1.8
    ELSE 0.3 + RAND() * 0.4
  END,
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 7 AND 21
    THEN 350 + RAND() * 450
    ELSE 60  + RAND() * 120
  END,
  ROUND(890 + (720 - n) * 0.52 + RAND() * 0.10, 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 7 AND 21
    THEN ROUND(0.8 + RAND() * 2.2, 4)
    ELSE 0
  END,
  ROUND(120 + (720 - n) * 0.065 + RAND() * 0.01, 4)
FROM (
  SELECT h.i * 100 + t.i * 10 + o.i AS n
  FROM
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
     UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) h
    CROSS JOIN
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
     UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
     UNION ALL SELECT 8 UNION ALL SELECT 9) t
    CROSS JOIN
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
     UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
     UNION ALL SELECT 8 UNION ALL SELECT 9) o
  WHERE h.i * 100 + t.i * 10 + o.i <= 720
) seq;

-- DEV-A-103: unassigned unit, minimal usage
INSERT IGNORE INTO meter_readings
  (time, device_id, voltage, current, power, energy_total, water_flow, water_total)
SELECT
  DATE_SUB(NOW(), INTERVAL n HOUR),
  'DEV-A-103',
  220 + (RAND() * 3),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 8 AND 20
    THEN 1.0 + RAND() * 1.5
    ELSE 0.2 + RAND() * 0.3
  END,
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 8 AND 20
    THEN 200 + RAND() * 300
    ELSE 40  + RAND() * 60
  END,
  ROUND(560 + (720 - n) * 0.30 + RAND() * 0.08, 4),
  CASE WHEN HOUR(DATE_SUB(NOW(), INTERVAL n HOUR)) BETWEEN 8 AND 20
    THEN ROUND(0.5 + RAND() * 1.5, 4)
    ELSE 0
  END,
  ROUND(75 + (720 - n) * 0.04 + RAND() * 0.01, 4)
FROM (
  SELECT h.i * 100 + t.i * 10 + o.i AS n
  FROM
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
     UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) h
    CROSS JOIN
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
     UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
     UNION ALL SELECT 8 UNION ALL SELECT 9) t
    CROSS JOIN
    (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
     UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
     UNION ALL SELECT 8 UNION ALL SELECT 9) o
  WHERE h.i * 100 + t.i * 10 + o.i <= 720
) seq;

-- -----------------------------------------
-- 4. PAYMENT TRANSACTIONS
--    unit_id resolved via scalar subquery.
--    A-101: 6 transactions, all success.
--    A-102: 3 success + 1 pending (2 h ago).
-- -----------------------------------------

INSERT IGNORE INTO transactions
  (id, unit_id, unit_no, amount_rp, method, status, gateway_reference, created_at, confirmed_at)
VALUES
  ('TRX-17000001-001', (SELECT id FROM units WHERE unit_no = 'A-101'),
   'A-101', 200000.00, 'qris',     'success', 'PG-100001',
   DATE_SUB(NOW(), INTERVAL 88 DAY), DATE_SUB(NOW(), INTERVAL 88 DAY) + INTERVAL 5  MINUTE),

  ('TRX-17000002-002', (SELECT id FROM units WHERE unit_no = 'A-101'),
   'A-101', 150000.00, 'transfer', 'success', 'PG-100002',
   DATE_SUB(NOW(), INTERVAL 65 DAY), DATE_SUB(NOW(), INTERVAL 65 DAY) + INTERVAL 12 MINUTE),

  ('TRX-17000003-003', (SELECT id FROM units WHERE unit_no = 'A-101'),
   'A-101', 100000.00, 'ewallet',  'success', 'PG-100003',
   DATE_SUB(NOW(), INTERVAL 47 DAY), DATE_SUB(NOW(), INTERVAL 47 DAY) + INTERVAL 2  MINUTE),

  ('TRX-17000004-004', (SELECT id FROM units WHERE unit_no = 'A-101'),
   'A-101', 200000.00, 'qris',     'success', 'PG-100004',
   DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 30 DAY) + INTERVAL 8  MINUTE),

  ('TRX-17000005-005', (SELECT id FROM units WHERE unit_no = 'A-101'),
   'A-101',  50000.00, 'ewallet',  'success', 'PG-100005',
   DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY) + INTERVAL 1  MINUTE),

  ('TRX-17000006-006', (SELECT id FROM units WHERE unit_no = 'A-101'),
   'A-101', 150000.00, 'transfer', 'success', 'PG-100006',
   DATE_SUB(NOW(), INTERVAL 3  DAY), DATE_SUB(NOW(), INTERVAL 3  DAY) + INTERVAL 9  MINUTE),

  ('TRX-17000007-007', (SELECT id FROM units WHERE unit_no = 'A-102'),
   'A-102', 100000.00, 'qris',     'success', 'PG-100007',
   DATE_SUB(NOW(), INTERVAL 75 DAY), DATE_SUB(NOW(), INTERVAL 75 DAY) + INTERVAL 4  MINUTE),

  ('TRX-17000008-008', (SELECT id FROM units WHERE unit_no = 'A-102'),
   'A-102',  50000.00, 'ewallet',  'success', 'PG-100008',
   DATE_SUB(NOW(), INTERVAL 42 DAY), DATE_SUB(NOW(), INTERVAL 42 DAY) + INTERVAL 3  MINUTE),

  ('TRX-17000009-009', (SELECT id FROM units WHERE unit_no = 'A-102'),
   'A-102', 100000.00, 'transfer', 'success', 'PG-100009',
   DATE_SUB(NOW(), INTERVAL 18 DAY), DATE_SUB(NOW(), INTERVAL 18 DAY) + INTERVAL 15 MINUTE),

  ('TRX-17000010-010', (SELECT id FROM units WHERE unit_no = 'A-102'),
   'A-102', 100000.00, 'qris',     'pending', 'PG-100010',
   DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL);
