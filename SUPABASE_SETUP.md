# 🗄️ BusBuddy – Supabase Authentication Setup Guide
## (Beginner Level — Step by Step)

> This guide explains exactly how to connect BusBuddy to Supabase so that students can log in with their **roll number**, drivers can log in with their **driver ID**, and all data is stored in the cloud.

---

## 📌 What is Supabase?

**Supabase** is a free, open-source database platform that works like Google Firebase but uses **PostgreSQL** (a real SQL database). It gives you:

- ✅ A **hosted database** (no server setup needed)
- ✅ **Authentication** (login, signup, sessions)
- ✅ **Realtime** updates pushed to all connected browsers
- ✅ A simple **JavaScript SDK** that works in any web page

---

## 🧭 Overview of What We're Building

```
Your Browser
    │
    ▼
BusBuddy App (index.html + app.js)
    │  uses Supabase JS SDK
    ▼
Supabase Cloud
    ├── students table  ← roll number login
    ├── drivers table   ← driver ID login
    ├── buses table     ← bus info & route
    ├── bus_stops table ← stop coordinates
    └── bus_locations   ← live GPS telemetry (realtime)
```

---

## STEP 1 — Create a Free Supabase Account

1. Open your browser and go to 👉 **https://supabase.com**
2. Click the **"Start your project"** button
3. Sign up with your **GitHub account** or **email address**
4. After signing up, you'll land on the Supabase dashboard

---

## STEP 2 — Create a New Project

1. Click the green **"New Project"** button
2. Fill in the details:
   - **Name**: `busbuddy` (or any name you like)
   - **Database Password**: Choose a strong password — **save this somewhere**, you'll need it later
   - **Region**: Choose the region closest to your college (e.g., `South Asia (Mumbai)` or `Southeast Asia (Singapore)`)
3. Click **"Create new project"**
4. ⏳ Wait about **1–2 minutes** for the project to be created (you'll see a loading spinner)

---

## STEP 3 — Get Your Project Keys (API Keys)

Once your project is ready:

1. In the left sidebar, click **"Project Settings"** (gear icon ⚙️)
2. Click **"API"** under the Project Settings section
3. You'll see two important values — **copy both of these**:

```
Project URL:    https://xxxxxxxxxxxx.supabase.co
Anon Public Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx...
```

> ⚠️ **Never share your `service_role` key** — it's secret and gives full database access.  
> The **anon key** shown above is safe to use in frontend code.

---

## STEP 4 — Set Up the Database Tables

Now we need to create all the tables BusBuddy needs.

1. In the left sidebar, click **"SQL Editor"**
2. Click **"New query"** (the + button)
3. Open the file [`supabase_schema.sql`](file:///C:/Users/Samsung/.gemini/antigravity-ide/scratch/busbuddy/supabase_schema.sql) in your IDE
4. **Copy all the contents** of that file
5. **Paste it** into the SQL Editor in Supabase
6. Click the green **"Run"** button (or press `Ctrl + Enter`)

You should see: `Success. No rows returned.`

This creates these tables:

| Table | What it stores |
|-------|---------------|
| `buses` | Bus details (name, route, driver) |
| `bus_stops` | All stop locations with GPS coordinates |
| `students` | Student roll numbers + their assigned bus & stop |
| `drivers` | Driver IDs and their assigned bus |
| `bus_locations` | Live GPS coordinates updated every second |
| `notifications` | Alert history (proximity alerts, broadcasts) |

---

## STEP 5 — Connect BusBuddy to Supabase

Now we tell the BusBuddy app to use your Supabase project.

### Option A — Using the Settings Panel (Easiest)

1. Make sure BusBuddy is running at **http://localhost:8000**
2. Click the **⚙️ gear icon** in the top-right corner of the app
3. A settings popup will appear — fill in:
   - **Supabase Project URL**: Paste the URL from Step 3
   - **Supabase Anon Key**: Paste the anon key from Step 3
4. Click **"Apply & Connect"**
5. You'll see the status badge at the top change from `Local Satellite Mode` to `Supabase Cloud Connected` ✅

### Option B — Hardcode in app.js (Permanent)

Open [`app.js`](file:///C:/Users/Samsung/.gemini/antigravity-ide/scratch/busbuddy/app.js) and find the line near the top that says:

```js
// PASTE YOUR SUPABASE KEYS HERE
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';
```

Replace the empty strings with your actual keys:
```js
const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

Save the file and refresh the browser.

---

## STEP 6 — Test Student Authentication (Roll Number Login)

1. Open BusBuddy at **http://localhost:8000**
2. Click on your name/profile chip in the top-right (it says "Guest Student")
3. The **Authentication Modal** will open
4. Click the **"Student (Roll No)"** tab
5. Type a roll number — for example: `2024CS101`
6. Click **"Continue as Student"**

### What happens behind the scenes:
```
You type "2024CS101"
    ↓
BusBuddy queries Supabase:
    SELECT * FROM students WHERE roll_number = '2024CS101'
    ↓
If student exists → loads their name, bus, and preferred stop
If student is new → automatically registers them in the database
    ↓
You are now "logged in" as that student
Map updates to highlight your preferred boarding stop
```

---

## STEP 7 — Test Driver Authentication

1. Click your profile chip in the top-right
2. Click the **"Driver Console"** tab
3. Type Driver ID: `DRV-01`
4. Click **"Open Driver GPS Console"**
5. You're now in driver mode — click **"Start Trip"** to begin broadcasting GPS

---

## STEP 8 — Test Real-Time Sync (Multi-Tab)

This is where it gets exciting! Open **2 browser windows**:

**Window 1 — Student:**
1. Go to `http://localhost:8000`
2. Log in as student `2024CS101`
3. Click 🔔 bell icon to allow notifications

**Window 2 — Driver:**
1. Open a new tab: `http://localhost:8000`
2. Log in as driver `DRV-01`
3. Click **"Start Trip"**
4. Watch **Window 1** — the bus starts moving on the satellite map!
5. When the bus gets within 500m of Green Gardens Junction → chime plays + notification fires!

---

## STEP 9 — See Your Data in Supabase Dashboard

After testing, go back to your Supabase dashboard:

1. In the left sidebar, click **"Table Editor"**
2. Click on the `students` table — you'll see the student records
3. Click on `bus_locations` — you'll see live GPS coordinates being updated!
4. Click on `notifications` — you'll see the alert log

---

## 🔑 Summary of All Keys & URLs

| Thing | Where to find it | What it's used for |
|-------|------------------|--------------------|
| Project URL | Settings → API | Connects app to your Supabase project |
| Anon Key | Settings → API | Lets app read/write data (safe for frontend) |
| DB Password | Set during Step 2 | Only needed if connecting via psql CLI |

---

## ❓ Common Problems & Fixes

| Problem | Fix |
|---------|-----|
| "Supabase not connected" badge | Check your URL and Anon Key are correct — no extra spaces |
| SQL Editor shows error | Make sure you pasted the ENTIRE content of `supabase_schema.sql` |
| Student login doesn't save | Check if Row Level Security is enabled — the schema enables it automatically |
| No realtime updates | In Supabase → Database → Replication → make sure `bus_locations` table is in the replication list |
| Port 8000 not working | Run: `python -m http.server 8000` inside the busbuddy folder |

---

## 🚀 What's Next After Authentication?

Once auth is working, here's what you can build next:

1. **Real Email/Password Auth** — Use Supabase Auth (email OTP for students)
2. **Push Notifications via Edge Functions** — Server-side alerts when bus is approaching
3. **Admin Dashboard** — Add/edit buses, routes, and stop times from a web panel
4. **Mobile App** — Wrap BusBuddy in Capacitor to publish to Google Play Store
