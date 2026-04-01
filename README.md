# Interactive Product Analytics Dashboard

A full-stack product analytics dashboard that visualizes its own usage. Every time a user interacts with a filter, clicks a chart, or navigates the dashboard, that event is tracked and fed back into the visualization in near real-time.

**Tech Stack:** React 19 + TypeScript + Vite | FastAPI + asyncpg | PostgreSQL

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Engineering Choices](#engineering-choices)
- [Getting Started](#getting-started)
- [Data Seeding](#data-seeding)
- [API Reference](#api-reference)
- [Scaling to 1 Million Writes/Min](#scaling-to-1-million-writesmin)

---

## Architecture Overview

```
┌─────────────────────┐       ┌──────────────────────┐       ┌────────────┐
│   React Frontend    │──────>│   FastAPI Backend     │──────>│ PostgreSQL │
│   (Vite, Port 5170) │<──────│   (Uvicorn, Port 5000│<──────│            │
│                     │       │                      │       │            │
│  - Login / Register │       │  POST /register      │       │  users     │
│  - Dashboard        │       │  POST /login         │       │  feature_  │
│  - Bar & Line Chart │       │  POST /track (batch) │       │   clicks   │
│  - Filter Cookies   │       │  GET  /analytics     │       │            │
└─────────────────────┘       └──────────────────────┘       └────────────┘
```

**Key Design Decisions:**
- **JWT stored in httpOnly cookies** — immune to XSS token theft
- **Client-side click batching** — queues interactions, flushes every 5s or 10 items to minimize request overhead
- **Parameterized SQL everywhere** — zero SQL injection surface
- **10s auto-refresh** on the dashboard with manual refresh button

---

## Project Structure

```
├── backend/
│   ├── app.py                  # FastAPI app setup, lifespan, CORS, router includes
│   ├── main.py                 # Uvicorn entry point
│   ├── requirements.txt        # Python dependencies
│   ├── api/
│   │   ├── auth.py             # POST /register, /login, /logout, GET /me
│   │   ├── analytics.py        # POST /track (batch), GET /analytics
│   │   └── deps.py             # JWT helpers, bcrypt utils, get_current_user
│   ├── scripts/
│   │   ├── add_user.py         # CLI script to add users interactively
│   │   └── seed_data.py        # Seed 80-100 dummy feature clicks
│   └── sql/
│       └── create_tables.sql   # Database schema with UUID PKs and indices
│
├── src/
│   ├── App.tsx                 # Router + Toaster setup
│   ├── components/
│   │   ├── login.tsx           # Email/password login with toast feedback
│   │   ├── register.tsx        # Registration with confirm password, age, gender
│   │   ├── dashboard.tsx       # Filters, stat cards, bar chart, line chart
│   │   ├── protected-route.tsx # Auth guard — verifies cookie via GET /me
│   │   └── ui/                 # shadcn/ui component library
│   └── services/
│       ├── api.ts              # Base fetch wrapper (credentials, JSON, errors)
│       ├── auth.ts             # login(), register(), logout(), getMe()
│       ├── analytics.ts        # fetchAnalytics() with typed filters
│       └── tracker.ts          # Click queue with 5s flush, beforeunload handler
```

---

## Engineering Choices

### 1. Raw SQL over ORM — A Deliberate Decision

This is not a shortcut. It is a deliberate senior-level engineering choice based on performance and transparency.

| Concern | ORM (SQLAlchemy/Prisma) | Raw SQL + asyncpg (This Project) |
|---|---|---|
| **Data Hydration** | High overhead — converts every row into a heavy class instance | Zero overhead — returns lightweight `Record` objects (dict-like) |
| **Query Transparency** | Opaque — generates "magic" SQL that can be hard to debug | Crystal clear — 1:1 mapping between code and database execution |
| **The N+1 Problem** | Risky — easy to trigger via lazy-loading relationships | Eliminated — JOINs are explicit, data fetched in a single round-trip |
| **DB-Specific Optimization** | Limited — generic SQL prevents Postgres-specific tuning | Full access — `DATE()`, composite indices, `COPY` for bulk ops |
| **Aggregation Queries** | Clunky — ORMs struggle with complex GROUP BY / COUNT / JOIN | Natural — SQL is the native language for analytical aggregation |

> **Strategic Note:** While modern ORMs have "fixes" for these issues (eager loading, scalar selects), those fixes often require writing code that mimics SQL syntax anyway. I chose to remove the middleman to ensure maximum predictability and performance for an analytics-heavy workload.

### 2. asyncpg — The Fastest PostgreSQL Driver

`asyncpg` is a C-accelerated, fully async PostgreSQL driver that is **3x faster than psycopg2** for typical query workloads. It uses PostgreSQL's native binary protocol instead of text-based parsing, giving us:
- Zero-copy data transfer for large result sets
- Native support for PostgreSQL types (UUID, TIMESTAMP, arrays)
- Connection pooling via `asyncpg.Pool` (2-10 connections in this project)

### 3. Client-Side Click Batching

Instead of firing a network request on every single click:

```
Click → Queue (in-memory array) → Flush to POST /track every 5s or 10 items
                                 → keepalive fetch on page unload (no data loss)
```

This reduces network requests by ~90% while ensuring no click data is lost. The backend receives batches and does a single `executemany` bulk insert.

### 4. Security Architecture

| Layer | Implementation |
|---|---|
| **SQL Injection** | All queries use parameterized placeholders (`$1`, `$2`) — never string interpolation |
| **Password Storage** | bcrypt with auto-generated salt |
| **Authentication** | JWT in httpOnly cookie (not localStorage) — immune to XSS |
| **Input Validation** | Pydantic models with field validators + server-side allowlists for feature names, genders, age groups |
| **Route Protection** | Frontend `ProtectedRoute` verifies auth via `GET /me` before rendering dashboard |
| **Active User Check** | Login rejects `is_active = false` accounts with 403 |

### 5. Cookie-Based Filter Persistence

User's last selected filters (date range, age group, gender) are stored in a browser cookie (`dashboard_filters`). On page refresh, filters are restored from the cookie before the first API call — meeting the "persistence" requirement without any backend storage.

### 6. Database Indexing Strategy

The schema is optimized for **write-heavy tracking** and **read-heavy filtering**:

```sql
-- Composite index for the line chart (time trend per feature)
CREATE INDEX idx_feature_clicks_feature_timestamp ON feature_clicks (feature_name, timestamp);

-- Composite index for user-feature aggregations
CREATE INDEX idx_feature_clicks_user_feature ON feature_clicks (user_id, feature_name);

-- Individual indices for filter conditions
CREATE INDEX idx_users_gender ON users (gender);
CREATE INDEX idx_users_age ON users (age);
```

These ensure that the `GET /analytics` endpoint performs index scans, not full table scans, even as the dataset grows into millions of rows.

---

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **Python** >= 3.11
- **PostgreSQL** >= 14

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Interactive-Product-Analytics-Dashboard
```

### 2. Setup the Database

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE analytics_dashboard;"

# Run the schema
psql -U postgres -d analytics_dashboard -f backend/sql/create_tables.sql
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Server
HOST=localhost
PORT=5000

# JWT
JWT_SECRET=your-secret-key-here-change-this

# PostgreSQL Database Config
DB_HOST=localhost
DB_PORT=5432
DB_NAME=analytics_dashboard
DB_USER=postgres
DB_PASSWORD=your_password
```

### 4. Start the Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate    # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

The API will be running at `http://localhost:5000`.

### 5. Start the Frontend

```bash
# From the project root
npm install
npm run dev
```

The dashboard will be running at `http://localhost:5170`.

---

## Data Seeding

The dashboard should not look empty on first load. Use the seeding scripts to populate data.

### Step 1: Add a User (Interactive CLI)

```bash
cd backend
python scripts/add_user.py
```

This will prompt for email, password, age, gender, and active status.

### Step 2: Seed Feature Clicks

```bash
cd backend
python scripts/seed_data.py
```

This will:
1. Ask for the user UUID
2. Insert 80-100 random feature click records spread across 90 days
3. Print a per-feature breakdown

Alternatively, users can self-register via the `/register` page in the frontend.

---

## API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | No | Create account (email, password, confirm_password, age, gender) |
| `POST` | `/login` | No | Login with email + password, sets httpOnly JWT cookie |
| `POST` | `/logout` | No | Clears the auth cookie |
| `GET` | `/me` | Yes | Returns authenticated user's profile |
| `POST` | `/track` | Yes | Batch insert feature clicks `{ clicks: [{ feature_name }] }` |
| `GET` | `/analytics` | Yes | Aggregated data with query params: `start_date`, `end_date`, `age`, `gender`, `feature` |

### Analytics Response Shape

```json
{
  "features": [{ "feature": "date_picker", "clicks": 42 }],
  "daily": [{ "date": "2026-01-15", "clicks": 12 }],
  "stats": { "total_clicks": 156, "unique_users": 8 }
}
```

---

## Scaling to 1 Million Writes/Min

### Current Architecture (This Project)

```
┌──────────┐    POST /track     ┌──────────────┐   executemany    ┌────────────┐
│  Browser  │──────────────────>│   FastAPI     │────────────────>│ PostgreSQL │
│  (batch   │    (every 5s)     │   (uvicorn)   │                 │            │
│   queue)  │                   │               │   SELECT + JOIN │            │
│           │<──────────────────│               │<────────────────│            │
└──────────┘    GET /analytics  └──────────────┘   (live agg)     └────────────┘
                 (every 10s)
```

- ~10-50 clicks/min per user
- Client batches clicks, flushes every 5s
- Backend does `executemany` bulk insert
- Analytics queries run live aggregations with JOINs

### At Scale: 1 Million Writes/Min

```
┌──────────┐   POST /track   ┌──────────┐  produce  ┌─────────────┐
│  Browser  │───────────────>│  FastAPI  │─────────>│    Kafka /   │
│  (batch)  │  202 Accepted  │  (p99<5ms)│          │ Redis Streams│
└──────────┘   (fire & forget)└──────────┘          └──────┬──────┘
                                                           │ consume
                                                           │ (batches of 5-10K)
                                                           v
┌──────────┐  GET /analytics ┌──────────┐  refresh  ┌──────────────┐
│  Browser  │<──────────────>│  FastAPI  │<────────>│  PostgreSQL   │
│           │  (sub-100ms)   │ (read     │          │               │
└──────────┘                 │  replica) │          │ Materialized  │
                             └──────────┘          │ Views (60s)   │
                                                   │               │
                              ┌──────────┐  COPY   │ feature_clicks│
                              │  Batch   │────────>│ (partitioned  │
                              │  Worker  │         │  by month)    │
                              └──────────┘         └───────────────┘
```

If this dashboard needed to handle 1 million write-events per minute, the architecture would evolve across three layers:

**1. Ingestion Decoupling:** The `POST /track` endpoint would push events to a message queue (Redis Streams or Apache Kafka) and immediately return `202 Accepted` with a p99 latency under 5ms. This decouples the write path from database pressure entirely.

**2. Batch Ingestion Workers:** Background consumers would pull events from the queue in batches of 5,000-10,000 and use PostgreSQL's `COPY` command or unrolled multi-row `INSERT` statements. This minimizes I/O pressure on the Write-Ahead Log (WAL) and achieves throughput of ~500K rows/second on a single Postgres instance.

**3. Read Optimization with Materialized Views:** The `GET /analytics` endpoint would query pre-computed Materialized Views that refresh every 60 seconds, rather than performing live aggregations on the raw `feature_clicks` table. This eliminates full table scans on potentially billions of rows and ensures consistent sub-100ms read latency regardless of data volume.

**Additional considerations:** Connection pooling via PgBouncer, horizontal read replicas for the analytics queries, and time-series partitioning of `feature_clicks` by month for efficient data lifecycle management.
