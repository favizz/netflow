const mysql = require('mysql2/promise');

async function check() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'srusun-ta252601002',
    password: 'TA!2025Ok',
    database: 'srusun-ta252601002',
  });

  console.log('Querying all units...');
  const [units] = await connection.query('SELECT id, unit_no, device_id FROM units');
  console.log('Total Units in DB:', units.length);
  
  const a101 = units.find(u => u.unit_no === 'A-101' || u.unit_no === 'A-0101');
  console.log('Unit A-101 (or A-0101):', a101);

  if (a101 && a101.device_id !== 'DEV-A-101') {
    console.log(`Updating device_id for unit ${a101.unit_no} to DEV-A-101...`);
    await connection.query('UPDATE units SET device_id = "DEV-A-101" WHERE id = ?', [a101.id]);
    console.log('Update successful.');
  }

  await connection.end();
}

check().catch(console.error);
