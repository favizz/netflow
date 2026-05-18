const mysql = require('mysql2/promise');

async function check() {
  console.log('Connecting to DB...');
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'srusun-ta252601002',
    password: 'TA!2025Ok',
    database: 'srusun-ta252601002',
  });

  console.log('Connected.');
  const [units] = await connection.query('SELECT unit_no, device_id FROM units');
  console.log('Units in DB:', units);

  const [readings] = await connection.query('SELECT device_id, time FROM meter_readings ORDER BY time DESC LIMIT 5');
  console.log('Latest 5 readings:', readings);

  await connection.end();
}

check().catch(err => {
  console.error('FAILED:', err.message);
});
