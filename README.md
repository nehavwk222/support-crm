# SupportDesk — Customer Support CRM

A full-stack customer support ticket management system built for the Datastraw Technologies hiring assessment.

## Live Demo

> Application: https://support-crm-8soq.onrender.com/

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | Node.js + Express | Lightweight, fast, widely deployed |
| Database | SQLite via sql.js | Zero-config, file-based, pure JS (no native build) |
| Frontend | Vanilla HTML/CSS/JS | No build step, instant to load, fully responsive |
| Deploy | Render.com | Free tier, simple config, auto-deploy from GitHub |

## Features

- **Create Tickets** — Customer name, email, issue title, description; auto-generates `TKT-XXXX` IDs with timestamps
- **List All Tickets** — Clean table with ID, customer info, subject, status, date; sorted newest-first
- **Search** — Live search across customer name, email, ticket ID, subject, and description (debounced)
- **Filter by Status** — Quick-filter pills: All / Open / In Progress / Closed
- **View Ticket Detail** — Full details modal: all fields, agent notes history, update controls
- **Update Tickets** — Change status + add agent notes in one operation; full note history preserved
- **Delete Tickets** — Remove tickets with confirmation
- **Dashboard Stats** — Real-time counts of total, open, in-progress, and closed tickets
- **Mobile Responsive** — Adapts to all screen sizes

## API Endpoints

```
POST   /api/tickets              Create a new ticket
GET    /api/tickets              List tickets (?status=Open&search=query)
GET    /api/tickets/:ticket_id   Get single ticket with notes
PUT    /api/tickets/:ticket_id   Update status/add note
DELETE /api/tickets/:ticket_id   Delete a ticket
GET    /api/stats                Dashboard statistics
```

## Database Schema

**tickets**
```sql
id            INTEGER PRIMARY KEY AUTOINCREMENT
ticket_id     TEXT UNIQUE NOT NULL          -- e.g. TKT-0001
customer_name TEXT NOT NULL
customer_email TEXT NOT NULL
subject       TEXT NOT NULL
description   TEXT NOT NULL
status        TEXT NOT NULL DEFAULT 'Open'  -- Open | In Progress | Closed
created_at    TEXT NOT NULL
updated_at    TEXT NOT NULL
```

**notes**
```sql
id          INTEGER PRIMARY KEY AUTOINCREMENT
ticket_id   TEXT NOT NULL  -- FK → tickets.ticket_id
note_text   TEXT NOT NULL
created_at  TEXT NOT NULL
```

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/support-crm.git
cd support-crm

# 2. Install dependencies
cd backend && npm install

# 3. Configure environment (optional)
cp .env.example .env

# 4. Start the server
node server.js
# → Server running on http://localhost:3001

# 5. Open in browser
open http://localhost:3001
```

## Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && node server.js`
   - **Environment:** Node
5. Click Deploy

The `render.yaml` in the root automates these settings.

## Project Structure

```
support-crm/
├── backend/
│   ├── server.js          # Express app + all API routes
│   ├── package.json
│   └── .env.example
├── frontend/
│   └── public/
│       └── index.html     # Single-page app (HTML + CSS + JS)
├── render.yaml            # Render.com deployment config
├── .gitignore
└── README.md
```

## Design Decisions

1. **sql.js over better-sqlite3/sqlite3**: Native Node SQLite packages require compilation (node-gyp). sql.js is pure WebAssembly — zero build dependencies, works everywhere.

2. **Single-file frontend**: No build step, no bundler, no framework overhead. The entire UI is one HTML file served directly by Express. Fast to load, easy to understand.

3. **Same-origin API**: The Express server serves both the API (`/api/*`) and the frontend static files. No CORS configuration needed in production.

4. **Persistent SQLite**: The DB file is written to disk after every write operation. On Render.com's free tier, the filesystem is ephemeral — for production persistence, the `DB_PATH` env var can point to a mounted disk or the app can be upgraded to use PostgreSQL.

## Challenges & Solutions

- **SQLite native modules failing in CI/containers** → Switched to sql.js (WebAssembly-based), which needs no native compilation
- **Express 5 wildcard route syntax change** → Used `/{*splat}` instead of `*` for the catch-all frontend route
- **Keeping the frontend snappy** → Debounced search (280ms), optimistic UI updates, minimal DOM operations

## What I'd Add With More Time

- JWT-based authentication for agent login
- Ticket assignment to specific agents
- Email notifications on ticket creation/update
- Priority levels (Low/Medium/High/Urgent)
- File attachments on tickets
- Pagination for large ticket lists
- PostgreSQL for production persistence
- Unit + integration tests (Jest/Supertest)
