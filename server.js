const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// Automatically detect if a Render persistent disk is mounted at /var/data
const DB_DIR = fs.existsSync('/var/data') ? '/var/data' : __dirname;
const DB_PATH = path.join(DB_DIR, 'database.json');

// Initialize database file if it doesn't exist in the target directory
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ lao: [], thai: [] }, null, 2), 'utf8');
}

const ADMIN_ACCESS_KEY = 'admin123'; // Simple access key for demo

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SSE Clients array
let clients = [];

// Helper to read database
function readDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database:', error);
    return { lao: [], thai: [] };
  }
}

// Helper to write database
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing database:', error);
    return false;
  }
}

// Broadcast SSE updates to all connected clients
function broadcastUpdate(type, result) {
  const message = {
    type: type, // 'lao' or 'thai'
    data: result,
    timestamp: new Date().toISOString()
  };

  console.log(`Broadcasting real-time update: ${type}`);
  clients.forEach(client => {
    client.write(`event: update\ndata: ${JSON.stringify(message)}\n\n`);
  });
}

// REST API Endpoints

// 1. Get latest results for Lao and Thai
app.get('/api/results/latest', (req, res) => {
  const db = readDB();
  const latestLao = db.lao && db.lao.length > 0 ? db.lao[0] : null;
  const latestThai = db.thai && db.thai.length > 0 ? db.thai[0] : null;
  res.json({
    lao: latestLao,
    thai: latestThai
  });
});

// 2. Get Lao history
app.get('/api/results/lao', (req, res) => {
  const db = readDB();
  res.json(db.lao || []);
});

// 3. Get Thai history
app.get('/api/results/thai', (req, res) => {
  const db = readDB();
  res.json(db.thai || []);
});

// 4. Admin Key-in Lao Lottery
app.post('/api/results/lao', (req, res) => {
  const { drawNumber, date, numbers, adminKey } = req.body;

  // Authentication check
  if (adminKey !== ADMIN_ACCESS_KEY) {
    return res.status(403).json({ error: 'ລະຫັດ admin ບໍ່ຖືກຕ້ອງ (Invalid Admin Key)' });
  }

  // Validation
  if (!drawNumber || !date || !numbers || !Array.isArray(numbers) || numbers.length !== 6) {
    return res.status(400).json({ error: 'ຂໍ້ມູນບໍ່ຄົບຖ້ວນ ຫຼື ບໍ່ຖືກຕ້ອງ. ຫວຍລາວຕ້ອງມີເລກ 6 ໂຕ.' });
  }

  // Validate each digit is a string representation of 0-9
  const isValidNumbers = numbers.every(n => typeof n === 'string' && /^[0-9]$/.test(n));
  if (!isValidNumbers) {
    return res.status(400).json({ error: 'ຕົວເລກຫວຍຕ້ອງເປັນເລກ 0-9 ແຕ່ລະໂຕ.' });
  }

  const db = readDB();
  
  // Create new record
  const newRecord = {
    id: db.lao.length > 0 ? Math.max(...db.lao.map(r => r.id)) + 1 : 1,
    drawNumber: drawNumber.trim(),
    date: date.trim(),
    numbers: numbers
  };

  // Add to the beginning of array (newest first)
  db.lao.unshift(newRecord);

  if (writeDB(db)) {
    broadcastUpdate('lao', newRecord);
    return res.status(201).json({ message: 'ບັນທຶກຜົນຫວຍລາວສຳເລັດ!', data: newRecord });
  } else {
    return res.status(500).json({ error: 'ບໍ່ສາມາດຂຽນລົງຖານຂໍ້ມູນໄດ້ (Database write failed)' });
  }
});

// 5. Admin Key-in Thai Lottery
app.post('/api/results/thai', (req, res) => {
  const { date, firstPrize, frontThree, lastThree, lastTwo, adminKey } = req.body;

  // Authentication check
  if (adminKey !== ADMIN_ACCESS_KEY) {
    return res.status(403).json({ error: 'ລະຫັດ admin ບໍ່ຖືກຕ້ອງ (Invalid Admin Key)' });
  }

  // Validation
  if (!date || !firstPrize || !frontThree || !lastThree || !lastTwo) {
    return res.status(400).json({ error: 'ຂໍ້ມູນບໍ່ຄົບຖ້ວນ.' });
  }

  if (typeof firstPrize !== 'string' || !/^[0-9]{6}$/.test(firstPrize)) {
    return res.status(400).json({ error: 'ລາງວັນທີ 1 ຕ້ອງເປັນເລກ 6 ຫຼັກ.' });
  }

  if (!Array.isArray(frontThree) || frontThree.length !== 2 || !frontThree.every(n => typeof n === 'string' && /^[0-9]{3}$/.test(n))) {
    return res.status(400).json({ error: 'ເລກໜ້າ 3 ໂຕ ຕ້ອງມີ 2 ຊຸດ ແລະ ແຕ່ລະຊຸດເປັນເລກ 3 ຫຼັກ.' });
  }

  if (!Array.isArray(lastThree) || lastThree.length !== 2 || !lastThree.every(n => typeof n === 'string' && /^[0-9]{3}$/.test(n))) {
    return res.status(400).json({ error: 'ເລກທ້າຍ 3 ໂຕ ຕ້ອງມີ 2 ຊຸດ ແລະ ແຕ່ລະຊຸດເປັນເລກ 3 ຫຼັກ.' });
  }

  if (typeof lastTwo !== 'string' || !/^[0-9]{2}$/.test(lastTwo)) {
    return res.status(400).json({ error: 'ເລກທ້າຍ 2 ໂຕ ຕ້ອງເປັນເລກ 2 ຫຼັກ.' });
  }

  const db = readDB();

  // Create new record
  const newRecord = {
    id: db.thai.length > 0 ? Math.max(...db.thai.map(r => r.id)) + 1 : 1,
    date: date.trim(),
    firstPrize: firstPrize.trim(),
    frontThree: frontThree.map(n => n.trim()),
    lastThree: lastThree.map(n => n.trim()),
    lastTwo: lastTwo.trim()
  };

  // Add to the beginning of array (newest first)
  db.thai.unshift(newRecord);

  if (writeDB(db)) {
    broadcastUpdate('thai', newRecord);
    return res.status(201).json({ message: 'ບັນທຶກຜົນຫວຍໄທສຳເລັດ!', data: newRecord });
  } else {
    return res.status(500).json({ error: 'ບໍ່ສາມາດຂຽນລົງຖານຂໍ້ມູນໄດ້ (Database write failed)' });
  }
});

// 6. Server-Sent Events (SSE) stream endpoint for realtime updates
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable Nginx proxy buffering for instant SSE delivery
    // Allow external sites to connect for real-time updates
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial connected event
  const initMessage = {
    type: 'system',
    message: 'ເຊື່ອມຕໍ່ລະບົບ Real-time Lottery Stream ສຳເລັດ',
    timestamp: new Date().toISOString()
  };
  res.write(`event: connected\ndata: ${JSON.stringify(initMessage)}\n\n`);

  // Add client to active clients list
  clients.push(res);
  console.log(`New SSE connection opened. Active clients: ${clients.length}`);

  // Ping client periodically to prevent connection timeout
  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);

  // Connection close handler
  req.on('close', () => {
    clearInterval(pingInterval);
    clients = clients.filter(client => client !== res);
    console.log(`SSE connection closed. Active clients: ${clients.length}`);
  });
});

// Fallback to SPA index.html for undefined routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 Lottery Portal running on http://localhost:${PORT}`);
  console.log(`🔴 Real-time SSE stream available at http://localhost:${PORT}/api/stream`);
  console.log(`=================================================`);
});
