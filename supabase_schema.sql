-- ============================================================================
-- BusBuddy - College Bus Real-Time Telemetry & Stop Management Database Schema
-- Compatible with Supabase PostgreSQL (with Realtime & RLS enabled)
-- ============================================================================

-- 1. BUSES TABLE
CREATE TABLE IF NOT EXISTS public.buses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bus_number VARCHAR(50) NOT NULL UNIQUE,       -- e.g. "Bus-01", "Campus Express"
    route_name VARCHAR(100) NOT NULL,             -- e.g. "North Metro to Tech Campus"
    capacity INTEGER DEFAULT 50,
    status VARCHAR(20) DEFAULT 'idle',            -- 'idle', 'in_transit', 'delayed', 'completed'
    driver_name VARCHAR(100) DEFAULT 'Unassigned',
    driver_phone VARCHAR(20) DEFAULT '',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. BUS STOPS TABLE (With order & recorrection support)
CREATE TABLE IF NOT EXISTS public.bus_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bus_id UUID REFERENCES public.buses(id) ON DELETE CASCADE,
    stop_name VARCHAR(120) NOT NULL,
    stop_order INTEGER NOT NULL DEFAULT 1,        -- 1, 2, 3 ... defines route sequence
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geofence_radius INTEGER DEFAULT 500,          -- alert distance in meters (e.g. 500m)
    eta_offset_minutes INTEGER DEFAULT 5,         -- estimated travel time to this stop
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. STUDENTS TABLE (College Roll Number / Student ID Login)
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roll_number VARCHAR(50) NOT NULL UNIQUE,      -- e.g. "2024CS101", "2024EC204"
    full_name VARCHAR(100) NOT NULL,
    department VARCHAR(50) DEFAULT 'Engineering',
    year_of_study INTEGER DEFAULT 1,
    phone VARCHAR(20) DEFAULT '',
    bus_id UUID REFERENCES public.buses(id) ON DELETE SET NULL,
    preferred_stop_id UUID REFERENCES public.bus_stops(id) ON DELETE SET NULL,
    notification_radius INTEGER DEFAULT 500,      -- Distance before stop to notify student (meters)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. DRIVERS TABLE
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id VARCHAR(50) NOT NULL UNIQUE,        -- e.g. "DRV-01"
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    license_number VARCHAR(50) DEFAULT '',
    assigned_bus_id UUID REFERENCES public.buses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. BUS LOCATIONS TABLE (Real-time telemetry stream)
CREATE TABLE IF NOT EXISTS public.bus_locations (
    bus_id UUID PRIMARY KEY REFERENCES public.buses(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION DEFAULT 0.0,           -- km/h
    heading DOUBLE PRECISION DEFAULT 0.0,         -- compass bearing 0-360 deg
    altitude DOUBLE PRECISION DEFAULT 0.0,
    current_stop_order INTEGER DEFAULT 1,         -- nearest or target stop index
    last_ping TIMESTAMPTZ DEFAULT now()
);

-- 6. NOTIFICATIONS LOG
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bus_id UUID REFERENCES public.buses(id) ON DELETE CASCADE,
    roll_number VARCHAR(50),
    title VARCHAR(120) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) DEFAULT 'proximity',         -- 'proximity', 'arrival', 'delay', 'start'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- ENABLE REALTIME ON KEY TELEMETRY TABLES
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.bus_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bus_stops;
ALTER PUBLICATION supabase_realtime ADD TABLE public.buses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for easy web app tracking and student views)
CREATE POLICY "Allow public read access on buses" ON public.buses FOR SELECT USING (true);
CREATE POLICY "Allow public read access on bus_stops" ON public.bus_stops FOR SELECT USING (true);
CREATE POLICY "Allow public read access on students" ON public.students FOR SELECT USING (true);
CREATE POLICY "Allow public read access on drivers" ON public.drivers FOR SELECT USING (true);
CREATE POLICY "Allow public read access on bus_locations" ON public.bus_locations FOR SELECT USING (true);
CREATE POLICY "Allow public read access on notifications" ON public.notifications FOR SELECT USING (true);

-- Allow updates & inserts from the application for real-time tracking & stop management
CREATE POLICY "Allow all on bus_locations" ON public.bus_locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on bus_stops" ON public.bus_stops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on buses" ON public.buses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on students" ON public.students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on drivers" ON public.drivers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- SEED SAMPLE DATA (College Route with stops for instant testing)
-- ============================================================================
DO $$
DECLARE
    v_bus_id UUID;
    v_stop1_id UUID;
    v_stop2_id UUID;
    v_stop3_id UUID;
    v_stop4_id UUID;
    v_stop5_id UUID;
BEGIN
    -- 1. Insert Bus 01
    INSERT INTO public.buses (bus_number, route_name, capacity, status, driver_name, driver_phone)
    VALUES ('Bus-01 (Express)', 'North City Metro -> Green Park -> Tech Campus', 45, 'in_transit', 'Rajesh Sharma', '+91 98765 43210')
    ON CONFLICT (bus_number) DO UPDATE SET route_name = EXCLUDED.route_name
    RETURNING id INTO v_bus_id;

    -- Clean existing stops for this bus before re-seeding
    DELETE FROM public.bus_stops WHERE bus_id = v_bus_id;

    -- 2. Insert Stops with sequential orders & coordinates
    INSERT INTO public.bus_stops (bus_id, stop_name, stop_order, latitude, longitude, geofence_radius, eta_offset_minutes)
    VALUES (v_bus_id, 'Central Metro Station (Origin)', 1, 13.0827, 80.2707, 500, 0)
    RETURNING id INTO v_stop1_id;

    INSERT INTO public.bus_stops (bus_id, stop_name, stop_order, latitude, longitude, geofence_radius, eta_offset_minutes)
    VALUES (v_bus_id, 'Green Gardens Junction', 2, 13.0694, 80.2570, 500, 8)
    RETURNING id INTO v_stop2_id;

    INSERT INTO public.bus_stops (bus_id, stop_name, stop_order, latitude, longitude, geofence_radius, eta_offset_minutes)
    VALUES (v_bus_id, 'Royal Residency Cross', 3, 13.0531, 80.2412, 500, 16)
    RETURNING id INTO v_stop3_id;

    INSERT INTO public.bus_stops (bus_id, stop_name, stop_order, latitude, longitude, geofence_radius, eta_offset_minutes)
    VALUES (v_bus_id, 'South Lake Circle', 4, 13.0380, 80.2290, 500, 24)
    RETURNING id INTO v_stop4_id;

    INSERT INTO public.bus_stops (bus_id, stop_name, stop_order, latitude, longitude, geofence_radius, eta_offset_minutes)
    VALUES (v_bus_id, 'University Main Gate (Destination)', 5, 13.0102, 80.2335, 500, 35)
    RETURNING id INTO v_stop5_id;

    -- 3. Insert Driver
    INSERT INTO public.drivers (driver_id, full_name, phone, license_number, assigned_bus_id)
    VALUES ('DRV-01', 'Rajesh Sharma', '+91 98765 43210', 'DL-2018-098271', v_bus_id)
    ON CONFLICT (driver_id) DO UPDATE SET full_name = EXCLUDED.full_name;

    -- 4. Insert Sample Students with College Roll Numbers
    INSERT INTO public.students (roll_number, full_name, department, year_of_study, phone, bus_id, preferred_stop_id, notification_radius)
    VALUES 
        ('2024CS101', 'Aarav Patel', 'Computer Science', 2, '+91 91234 56789', v_bus_id, v_stop2_id, 500),
        ('2024EC204', 'Pooja Verma', 'Electronics', 3, '+91 92345 67890', v_bus_id, v_stop3_id, 500),
        ('2024ME088', 'Vikram Singh', 'Mechanical', 4, '+91 93456 78901', v_bus_id, v_stop4_id, 600),
        ('2024IT315', 'Sneha Reddy', 'Information Tech', 1, '+91 94567 89012', v_bus_id, v_stop1_id, 400)
    ON CONFLICT (roll_number) DO NOTHING;

    -- 5. Initialize Live Bus Location
    INSERT INTO public.bus_locations (bus_id, latitude, longitude, speed, heading, current_stop_order, last_ping)
    VALUES (v_bus_id, 13.0827, 80.2707, 32.5, 215.0, 1, now())
    ON CONFLICT (bus_id) DO UPDATE SET 
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        speed = EXCLUDED.speed,
        heading = EXCLUDED.heading,
        last_ping = now();

END $$;
