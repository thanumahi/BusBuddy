# 🚌 BusBuddy - College Bus Live GPS & Satellite Telemetry

**BusBuddy** is an intelligent college bus telemetry, stop re-correction, and smart arrival notification platform built with modern Vanilla JavaScript, Leaflet / Google Satellite Imagery, and Supabase PostgreSQL with Realtime replication.

---

## 🌟 Key Features

1. **🛰️ Live Google Satellite & Hybrid Mapping**:
   - Ultra-HD Earth imagery with road and landmark overlays (`Google Hybrid` & `Google Satellite`).
   - One-click toggle between **Satellite Hybrid**, **Pure Satellite**, **Dark Streets**, and **Standard City Map**.
   - Smooth bus marker rotation adhering to real-time directional compass heading.

2. **🔔 Smart Proximity & Arrival Notifications**:
   - **Early Arrival Geofence**: Automatically calculates real-time distance using the **Haversine geodesic formula**.
   - Alerts the student when the bus is **within their configurable alert radius** (e.g., 200m to 2km; default 500m / ~2 minutes away).
   - **Zero-Dependency Sound Synthesizer**: Uses Web Audio API to play harmonic alert chimes without missing audio assets.
   - **HTML5 Web Push Notifications**: Native desktop & mobile push alerts before bus arrival.
   - **Arrival Congratulatory Alert**: Triggers celebratory chime when bus enters within 75 meters of the stop.

3. **📍 Stops Manager & Interactive Re-Correction**:
   - **Stop Count & Number of Stops**: View and adjust all stops along the college route.
   - **Interactive Satellite Pin Re-Correction**: Click **"Re-correct Pin"** and drag any stop marker on the Google Satellite map to fix exact GPS coordinates with satellite precision!
   - **Click-to-Reposition**: Click anywhere on the satellite view to immediately re-anchor a stop.
   - **Re-Order Sequence**: Move stops Up / Down to recalculate sequential route waypoints.
   - **Save to Supabase**: Persists all changes directly to the PostgreSQL `bus_stops` table and broadcasts updates to all active sessions!

4. **🎓 College Roll Number / Student ID Authentication**:
   - Students log in using their **College Roll Number** (e.g., `2024CS101`, `2024EC204`).
   - Automatically maps student's assigned bus and preferred pickup stop.
   - Driver Console login with **Driver ID** (e.g., `DRV-01`).
   - Campus Coordinator login for route configuration.

5. **📡 Driver GPS Broadcaster**:
   - **Smart Route Simulation**: Simulates driving along the exact configured stops with customizable speed (1x, 2x, 4x).
   - **Device GPS Sensor**: Uses phone's HTML5 Geolocation (`navigator.geolocation.watchPosition`) for real road telemetry.
   - Instant broadcast announcements (Traffic Delay, Approaching Campus, Trip Started).

6. **⚡ Supabase Realtime & Offline Sandbox**:
   - **Out-of-the-Box Demo**: Works immediately in multiple browser tabs using `BroadcastChannel` with zero configuration!
   - **Supabase Cloud**: Connect your project URL and public Anon key for production PostgreSQL persistence.

---

## 🚀 How to Run BusBuddy (Port 8000)

### Step 1 — Open PowerShell in the Project Folder

Press **Win + X** → choose **Windows PowerShell**, then paste:

```powershell
cd C:\Users\Samsung\.gemini\antigravity-ide\scratch\busbuddy
python -m http.server 8000
```

You should see this output — **keep this window open**:
```
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

### Step 2 — Open BusBuddy in Your Browser

Open **Chrome** or **Edge** and visit:

> 🖥️ On this computer: **http://127.0.0.1:8000**
>
> 📱 On mobile (same Wi-Fi): **http://172.168.0.234:8000**

---

## 🔄 Multi-Tab Real-Time Sync (No Supabase Needed)

Test live sync instantly right in your browser — no keys required:

| Tab | URL | Action |
|-----|-----|--------|
| **Tab 1** | `http://127.0.0.1:8000` | Stay as Student (`2024CS101`) |
| **Tab 2** | `http://127.0.0.1:8000` (new tab or incognito) | Switch to **Driver** tab → click **"Start Trip"** |

Watch **Tab 1** automatically:
- 🛰️ Show the bus moving live on the Google Satellite map
- 📏 Count down the distance to your stop in real time
- 🔔 Fire the chime + browser notification when bus is within **500m**
- 🎉 Play the arrival fanfare when bus reaches your stop!

---

## 👤 Demo Login Credentials

| Role | Login Field | Demo Value | Stop |
|------|-------------|------------|------|
| 🎓 Student | Roll Number | `2024CS101` | Green Gardens Junction |
| 🎓 Student | Roll Number | `2024EC204` | Royal Residency Cross |
| 🎓 Student | Roll Number | `2024ME088` | South Lake Circle |
| 🚌 Driver  | Driver ID   | `DRV-01`    | — |
| 🛡️ Coordinator | Admin Key | `admin123` | Full access |

---

## 🗄️ Supabase Backend Setup (Step-by-Step Guide)

> **New to Supabase?** Read the full beginner guide:  
> 📖 **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** — covers everything from creating an account to testing live authentication, with screenshots guidance and troubleshooting tips.

Quick summary (3 steps):
1. Create a free project at [supabase.com](https://supabase.com) and copy your **Project URL** + **Anon Key**
2. Run `supabase_schema.sql` in your Supabase **SQL Editor**
3. Open BusBuddy → click **⚙️ Settings** → paste your keys → click **Apply & Connect**

---

## 📁 Project Files

| File | Description |
|------|-------------|
| `index.html` | Full SPA: satellite map, student/driver panels, stop manager, auth modals |
| `style.css` | Dark glassmorphism theme, micro-animations, custom map markers |
| `app.js` | Core engine: Google Satellite tiles, geofence, Web Audio, Supabase sync |
| `supabase_schema.sql` | PostgreSQL schema with RLS, Realtime publication, and seed data |
| `README.md` | This file |
