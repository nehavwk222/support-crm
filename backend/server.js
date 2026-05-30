const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'crm.db');

app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend/public')));

let db;

// ─── Database initialization ─────────────────────────────────────────────────
async function initDB() {
  const SQL = await initSqlJs();

  // Load existing DB from disk if it exists
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      note_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id)
    )
  `);

  saveDB();
  console.log('Database initialized');
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// ─── Helper: generate ticket ID ──────────────────────────────────────────────
function generateTicketId() {
  const results = db.exec('SELECT COUNT(*) as count FROM tickets');
  const count = results.length > 0 ? results[0].values[0][0] : 0;
  const num = String(count + 1).padStart(4, '0');
  return `TKT-${num}`;
}

// ─── Helper: rows to objects ──────────────────────────────────────────────────
function rowsToObjects(results) {
  if (!results || results.length === 0) return [];
  const { columns, values } = results[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// POST /api/tickets — Create a new ticket
app.post('/api/tickets', (req, res) => {
  try {
    const { customer_name, customer_email, subject, description } = req.body;

    if (!customer_name || !customer_email || !subject || !description) {
      return res.status(400).json({ error: 'All fields are required: customer_name, customer_email, subject, description' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer_email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const ticket_id = generateTicketId();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO tickets (ticket_id, customer_name, customer_email, subject, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Open', ?, ?)`,
      [ticket_id, customer_name.trim(), customer_email.trim().toLowerCase(), subject.trim(), description.trim(), now, now]
    );

    saveDB();

    res.status(201).json({ ticket_id, created_at: now, status: 'Open' });
  } catch (err) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// GET /api/tickets — List all tickets with optional search/filter
app.get('/api/tickets', (req, res) => {
  try {
    const { status, search } = req.query;

    let query = `SELECT id, ticket_id, customer_name, customer_email, subject, status, created_at, updated_at FROM tickets WHERE 1=1`;
    const params = [];

    if (status && ['Open', 'In Progress', 'Closed'].includes(status)) {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (customer_name LIKE ? OR customer_email LIKE ? OR ticket_id LIKE ? OR subject LIKE ? OR description LIKE ?)`;
      params.push(term, term, term, term, term);
    }

    query += ` ORDER BY created_at DESC`;

    const stmt = db.prepare(query);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    res.json(rows);
  } catch (err) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// GET /api/tickets/:ticket_id — Get single ticket with notes
app.get('/api/tickets/:ticket_id', (req, res) => {
  try {
    const { ticket_id } = req.params;

    const ticketStmt = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?');
    ticketStmt.bind([ticket_id]);
    let ticket = null;
    if (ticketStmt.step()) {
      ticket = ticketStmt.getAsObject();
    }
    ticketStmt.free();

    if (!ticket) {
      return res.status(404).json({ error: `Ticket ${ticket_id} not found` });
    }

    const notesStmt = db.prepare('SELECT * FROM notes WHERE ticket_id = ? ORDER BY created_at ASC');
    notesStmt.bind([ticket_id]);
    const notes = [];
    while (notesStmt.step()) {
      notes.push(notesStmt.getAsObject());
    }
    notesStmt.free();

    res.json({ ...ticket, notes });
  } catch (err) {
    console.error('Error fetching ticket:', err);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// PUT /api/tickets/:ticket_id — Update status and/or add a note
app.put('/api/tickets/:ticket_id', (req, res) => {
  try {
    const { ticket_id } = req.params;
    const { status, note } = req.body;

    // Check ticket exists
    const checkStmt = db.prepare('SELECT id FROM tickets WHERE ticket_id = ?');
    checkStmt.bind([ticket_id]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (!exists) {
      return res.status(404).json({ error: `Ticket ${ticket_id} not found` });
    }

    const now = new Date().toISOString();

    if (status) {
      if (!['Open', 'In Progress', 'Closed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: Open, In Progress, or Closed' });
      }
      db.run('UPDATE tickets SET status = ?, updated_at = ? WHERE ticket_id = ?', [status, now, ticket_id]);
    }

    if (note && note.trim()) {
      db.run('INSERT INTO notes (ticket_id, note_text, created_at) VALUES (?, ?, ?)', [ticket_id, note.trim(), now]);
    }

    saveDB();

    res.json({ success: true, updated_at: now });
  } catch (err) {
    console.error('Error updating ticket:', err);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// DELETE /api/tickets/:ticket_id — Delete a ticket
app.delete('/api/tickets/:ticket_id', (req, res) => {
  try {
    const { ticket_id } = req.params;
    db.run('DELETE FROM notes WHERE ticket_id = ?', [ticket_id]);
    db.run('DELETE FROM tickets WHERE ticket_id = ?', [ticket_id]);
    saveDB();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
});

// GET /api/stats — Dashboard stats
app.get('/api/stats', (req, res) => {
  try {
    const results = db.exec(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed
      FROM tickets
    `);
    const stats = rowsToObjects(results)[0] || { total: 0, open: 0, in_progress: 0, closed: 0 };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Catch-all: serve frontend
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ─── Start server ─────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Support CRM running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
