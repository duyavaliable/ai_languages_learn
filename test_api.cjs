const jwt = require('jsonwebtoken');
const http = require('http');
const mysql = require('mysql2/promise');

async function test() {
  const conn = await mysql.createConnection({
    host: 'localhost', user: 'root', password: '1234567', database: 'ai_language_learn'
  });
  const [rows] = await conn.execute("SELECT id, role FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1");
  if (rows.length === 0) { console.log('No admin found'); return; }
  const admin = rows[0];
  const token = jwt.sign({ id: admin.id, role: admin.role }, 'your_jwt_secret_key_here', { expiresIn: '1d' });
  
  const req = http.request('http://localhost:5000/api/exercises', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
  });
  req.on('error', e => console.error(e));
  req.end();
}
test();
