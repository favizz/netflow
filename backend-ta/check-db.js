const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envConfig = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#\s]+?)=(.+)/);
  if (match) envConfig[match[1]] = match[2].trim();
});

async function check() {
  const connection = await mysql.createConnection({
    host: envConfig.DB_HOST || 'localhost',
    user: envConfig.DB_USER || 'root',
    password: envConfig.DB_PASS || '',
    database: envConfig.DB_NAME || 'srusun-ta252601002',
  });

  const [units] = await connection.query('SELECT unit_no, device_id FROM units WHERE unit_no = "A-101"');
  console.log('Unit A-101:', units[0]);

  const [readings] = await connection.query('SELECT * FROM meter_readings WHERE device_id = ? ORDER BY time DESC LIMIT 1', [units[0]?.device_id]);
  console.log('Latest Reading:', readings[0]);

  await connection.end();
}

check().catch(console.error);
