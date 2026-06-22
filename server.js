const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Local JSON Database Setup
const DB_DIR = fs.existsSync('/var/data') ? '/var/data' : __dirname;
const DB_PATH = path.join(DB_DIR, 'database.json');

// Initialize local database file if it doesn't exist
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ lao: [], thai: [] }, null, 2), 'utf8');
}

const ADMIN_ACCESS_KEY = 'admin123'; // Simple access key for demo

// MongoDB Connection Setup
const MONGODB_URI = process.env.MONGODB_URI;
let dbClient = null;
let mongoDb = null;

async function connectToMongo() {
  if (MONGODB_URI) {
    try {
      dbClient = new MongoClient(MONGODB_URI);
      await dbClient.connect();
      mongoDb = dbClient.db('lottery');
      console.log('=================================================');
      console.log('✅ Connected successfully to MongoDB Cloud Database');
      console.log('=================================================');
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB, falling back to JSON database:', error);
      mongoDb = null;
    }
  } else {
    console.log('ℹ️ MONGODB_URI not set. Using local JSON database (database.json)');
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SSE Clients array
let clients = [];

// Helper to read local database
function readLocalDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local database:', error);
    return { lao: [], thai: [] };
  }
}

// Helper to write local database
function writeLocalDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing local database:', error);
    return false;
  }
}

// --- DATABASE HYBRID ABSTRACT LAYERS ---

// 1. Get Lao History
async function getLaoHistory() {
  if (mongoDb) {
    try {
      return await mongoDb.collection('lao').find().sort({ date: -1, drawNumber: -1 }).toArray();
    } catch (error) {
      console.error('Error fetching Lao history from MongoDB:', error);
      return [];
    }
  } else {
    const db = readLocalDB();
    return db.lao || [];
  }
}

// 2. Get Thai History
async function getThaiHistory() {
  if (mongoDb) {
    try {
      return await mongoDb.collection('thai').find().sort({ date: -1 }).toArray();
    } catch (error) {
      console.error('Error fetching Thai history from MongoDB:', error);
      return [];
    }
  } else {
    const db = readLocalDB();
    return db.thai || [];
  }
}

// 3. Save Lao Record
async function saveLaoRecord(record) {
  if (mongoDb) {
    try {
      // Find the next incrementing ID
      const lastItem = await mongoDb.collection('lao').find().sort({ id: -1 }).limit(1).toArray();
      record.id = lastItem.length > 0 ? lastItem[0].id + 1 : 1;
      await mongoDb.collection('lao').insertOne(record);
      return true;
    } catch (error) {
      console.error('Error saving Lao record to MongoDB:', error);
      return false;
    }
  } else {
    const db = readLocalDB();
    record.id = db.lao.length > 0 ? Math.max(...db.lao.map(r => r.id)) + 1 : 1;
    db.lao.unshift(record);
    return writeLocalDB(db);
  }
}

// 4. Save Thai Record
async function saveThaiRecord(record) {
  if (mongoDb) {
    try {
      // Find the next incrementing ID
      const lastItem = await mongoDb.collection('thai').find().sort({ id: -1 }).limit(1).toArray();
      record.id = lastItem.length > 0 ? lastItem[0].id + 1 : 1;
      await mongoDb.collection('thai').insertOne(record);
      return true;
    } catch (error) {
      console.error('Error saving Thai record to MongoDB:', error);
      return false;
    }
  } else {
    const db = readLocalDB();
    record.id = db.thai.length > 0 ? Math.max(...db.thai.map(r => r.id)) + 1 : 1;
    db.thai.unshift(record);
    return writeLocalDB(db);
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

// --- REST API ENDPOINTS ---

// 1. Get latest results for Lao and Thai
app.get('/api/results/latest', async (req, res) => {
  let latestLao = null;
  let latestThai = null;

  if (mongoDb) {
    try {
      const laoItems = await mongoDb.collection('lao').find().sort({ date: -1, drawNumber: -1 }).limit(1).toArray();
      const thaiItems = await mongoDb.collection('thai').find().sort({ date: -1 }).limit(1).toArray();
      latestLao = laoItems.length > 0 ? laoItems[0] : null;
      latestThai = thaiItems.length > 0 ? thaiItems[0] : null;
      
      // Strip MongoDB internal _id
      if (latestLao) delete latestLao._id;
      if (latestThai) delete latestThai._id;
    } catch (error) {
      console.error('Error getting latest from MongoDB:', error);
    }
  } else {
    const db = readLocalDB();
    latestLao = db.lao && db.lao.length > 0 ? db.lao[0] : null;
    latestThai = db.thai && db.thai.length > 0 ? db.thai[0] : null;
  }

  res.json({
    lao: latestLao,
    thai: latestThai
  });
});

// 2. Get Lao history
app.get('/api/results/lao', async (req, res) => {
  const history = await getLaoHistory();
  // Strip MongoDB internal _id
  const cleaned = history.map(row => {
    const copy = { ...row };
    delete copy._id;
    return copy;
  });
  res.json(cleaned);
});

// 3. Get Thai history
app.get('/api/results/thai', async (req, res) => {
  const history = await getThaiHistory();
  // Strip MongoDB internal _id
  const cleaned = history.map(row => {
    const copy = { ...row };
    delete copy._id;
    return copy;
  });
  res.json(cleaned);
});

// 4. Admin Key-in Lao Lottery
app.post('/api/results/lao', async (req, res) => {
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
  
  // Create new record
  const newRecord = {
    drawNumber: drawNumber.trim(),
    date: date.trim(),
    numbers: numbers
  };

  const success = await saveLaoRecord(newRecord);

  if (success) {
    // Strip Mongo _id for client broadcast
    delete newRecord._id;
    broadcastUpdate('lao', newRecord);
    return res.status(201).json({ message: 'ບັນທຶກຜົນຫວຍລາວສຳເລັດ!', data: newRecord });
  } else {
    return res.status(500).json({ error: 'ບໍ່ສາມາດບັນທຶກລົງຖານຂໍ້ມູນໄດ້ (Database write failed)' });
  }
});

// 5. Admin Key-in Thai Lottery
app.post('/api/results/thai', async (req, res) => {
  const { date, firstPrize, frontThree, lastThree, lastTwo, adminKey } = req.body;

  // Authentication check
  if (adminKey !== ADMIN_ACCESS_KEY) {
    return res.status(403).json({ error: 'ລະຫັດ admin ບໍ່ຖືກຕ້ອງ (Invalid Admin Key)' });
  }

  // Validation
  if (!date || !firstPrize || !frontThree || !lastThree || !lastTwo) {
    return res.status(400).json({ error: '...ຂໍ້ມູນບໍ່ຄົບຖ້ວນ.' });
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

  // Create new record
  const newRecord = {
    date: date.trim(),
    firstPrize: firstPrize.trim(),
    frontThree: frontThree.map(n => n.trim()),
    lastThree: lastThree.map(n => n.trim()),
    lastTwo: lastTwo.trim()
  };

  const success = await saveThaiRecord(newRecord);

  if (success) {
    delete newRecord._id;
    broadcastUpdate('thai', newRecord);
    return res.status(201).json({ message: 'ບັນທຶກຜົນຫວຍໄທສຳເລັດ!', data: newRecord });
  } else {
    return res.status(500).json({ error: 'ບໍ່ສາມາດບັນທຶກລົງຖານຂໍ້ມູນໄດ້ (Database write failed)' });
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

app.listen(PORT, async () => {
  console.log(`=================================================`);
  console.log(`🚀 Lottery Portal running on http://localhost:${PORT}`);
  console.log(`🔴 Real-time SSE stream available at http://localhost:${PORT}/api/stream`);
  console.log(`=================================================`);
  
  // Connect to MongoDB Cloud Database if MONGODB_URI is provided
  await connectToMongo();
});
