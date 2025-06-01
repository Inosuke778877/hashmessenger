const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const socketIo = require('socket.io');
const http = require('http');
const bcrypt = require('bcrypt');
const ejs = require('ejs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://your-vercel-app.vercel.app', // Replace with your Vercel domain
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Database setup
const db = new sqlite3.Database('database.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    userId TEXT UNIQUE,
    createdAt INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    userId TEXT,
    contactId TEXT,
    FOREIGN KEY(userId) REFERENCES users(userId)
  )`);
});

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://your-vercel-app.vercel.app', // Replace with your Vercel domain
  credentials: true
}));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 2 * 60 * 60 * 1000, secure: process.env.NODE_ENV === 'production' } // Secure cookies in production
}));

// Generate 10-digit user ID
function generateUserId() {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

// Middleware to check authentication
function isAuthenticated(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// API Routes
app.get('/api/user', isAuthenticated, (req, res) => {
  db.get(`SELECT userId, username FROM users WHERE userId = ?`, [req.session.userId], (err, user) => {
    if (err || !user) return res.status(500).json({ error: 'User not found' });
    res.json(user);
  });
});

app.get('/api/contacts', isAuthenticated, (req, res) => {
  db.all(`SELECT c.contactId, u.username 
          FROM contacts c 
          JOIN users u ON c.contactId = u.userId 
          WHERE c.userId = ?`, [req.session.userId], (err, contacts) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch contacts' });
    res.json(contacts || []);
  });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  const userId = generateUserId();
  const hashedPassword = await bcrypt.hash(password, 10);
  const createdAt = Date.now();

  db.run(`INSERT INTO users (username, password, userId, createdAt) VALUES (?, ?, ?, ?)`,
    [username, hashedPassword, userId, createdAt], (err) => {
      if (err) return res.status(400).json({ error: 'Username or ID already taken' });
      req.session.userId = userId;
      res.json({ userId, username });
    });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.userId = user.userId;
    res.json({ userId: user.userId, username: user.username });
  });
});

app.post('/api/contacts/add', isAuthenticated, (req, res) => {
  const { contactId } = req.body;
  db.get(`SELECT userId FROM users WHERE userId = ?`, [contactId], (err, contact) => {
    if (err || !contact) return res.status(400).json({ error: 'Invalid contact ID' });
    db.run(`INSERT INTO contacts (userId, contactId) VALUES (?, ?)`, [req.session.userId, contactId], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to add contact' });
      res.json({ success: true });
    });
  });
});

app.post('/api/contacts/delete', isAuthenticated, (req, res) => {
  const { contactId } = req.body;
  db.run(`DELETE FROM contacts WHERE userId = ? AND contactId = ?`, [req.session.userId, contactId], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete contact' });
    res.json({ success: true });
  });
});

app.post('/api/delete-account', isAuthenticated, (req, res) => {
  db.run(`DELETE FROM users WHERE userId = ?`, [req.session.userId], () => {
    db.run(`DELETE FROM contacts WHERE userId = ? OR contactId = ?`, [req.session.userId, req.session.userId], () => {
      req.session.destroy();
      res.json({ success: true });
    });
  });
});

// Legacy EJS Routes (for fallback or testing)
app.get('/', (req, res) => res.redirect('/login'));
app.get('/register', (req, res) => res.render('register'));
app.get('/login', (req, res) => res.render('login'));
app.get('/chat/:contactId', isAuthenticated, (req, res) => {
  const { contactId } = req.params;
  db.get(`SELECT userId FROM users WHERE userId = ?`, [contactId], (err, contact) => {
    if (err || !contact) return res.redirect('/contacts');
    db.all(`SELECT c.contactId, u.username 
            FROM contacts c 
            JOIN users u ON c.contactId = u.userId 
            WHERE c.userId = ?`, [req.session.userId], (err, contacts) => {
      if (err) return res.redirect('/contacts');
      res.render('chat', { userId: req.session.userId, contactId, contacts: contacts || [] });
    });
  });
});
app.get('/contacts', isAuthenticated, (req, res) => {
  db.all(`SELECT c.contactId, u.username 
          FROM contacts c 
          JOIN users u ON c.contactId = u.userId 
          WHERE c.userId = ?`, [req.session.userId], (err, contacts) => {
    res.render('contacts', { userId: req.session.userId, contacts: contacts || [] });
  });
});

// Auto-delete users after 2 hours
setInterval(() => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  db.run(`DELETE FROM users WHERE createdAt < ?`, [twoHoursAgo]);
  db.run(`DELETE FROM contacts WHERE userId NOT IN (SELECT userId FROM users)`);
}, 60 * 60 * 1000);

// Socket.IO for real-time chat
io.on('connection', (socket) => {
  socket.on('join', (room) => {
    socket.join(room);
  });

  socket.on('chatMessage', ({ room, message, senderId }) => {
    io.to(room).emit('message', { senderId, message });
  });
});

server.listen(process.env.PORT || 50185, () => console.log('Server running on port 50185'));