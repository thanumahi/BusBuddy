/**
 * BusBuddy - College Bus Real-Time Telemetry & Stop Management Platform
 * Features:
 *  - Google Satellite & Hybrid imagery integration
 *  - Supabase Realtime & PostgreSQL database sync
 *  - College Roll Number / Student ID Authentication
 *  - Stop Re-correction with interactive satellite map pin-dragging & re-ordering
 *  - Smart Geofence Proximity Alert (Audio Synthesizer + Browser HTML5 Push Notification)
 *  - Driver Telemetry Broadcaster (Device GPS Sensor + Route Simulation)
 */

// =============================================================================
// 🔑 SUPABASE CONFIGURATION — CONNECTED ✅
// =============================================================================
const SUPABASE_URL      = 'https://wqwpordlyqgksbajpxsb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_K2IWCNoYKQURJ4xLUkAJ_Q_VXP0gakP';
// =============================================================================

const BusBuddyApp = (() => {
  // --------------------------------------------------------------------------
  // Default Sample Data (Seeded if Supabase is disconnected or fresh)
  // --------------------------------------------------------------------------
  const DEFAULT_BUS = {
    id: 'bus-001-express',
    busNumber: 'Bus-01 (Campus Express)',
    routeName: 'North Metro ➔ Tech Campus',
    driverName: 'Rajesh Sharma',
    driverPhone: '+91 98765 43210'
  };

  const DEFAULT_STOPS = [
    { id: 'stop-1', name: 'Central Metro Station (Origin)', order: 1, lat: 13.0827, lng: 80.2707, radius: 500, etaMinutes: 0 },
    { id: 'stop-2', name: 'Green Gardens Junction', order: 2, lat: 13.0694, lng: 80.2570, radius: 500, etaMinutes: 8 },
    { id: 'stop-3', name: 'Royal Residency Cross', order: 3, lat: 13.0531, lng: 80.2412, radius: 500, etaMinutes: 16 },
    { id: 'stop-4', name: 'South Lake Circle', order: 4, lat: 13.0380, lng: 80.2290, radius: 500, etaMinutes: 24 },
    { id: 'stop-5', name: 'University Main Gate (Destination)', order: 5, lat: 13.0102, lng: 80.2335, radius: 500, etaMinutes: 35 }
  ];

  const SEEDED_STUDENTS = {
    '2024CS101': { rollNo: '2024CS101', name: 'Aarav Patel', dept: 'Computer Science', stopId: 'stop-2' },
    '2024EC204': { rollNo: '2024EC204', name: 'Pooja Verma', dept: 'Electronics', stopId: 'stop-3' },
    '2024ME088': { rollNo: '2024ME088', name: 'Vikram Singh', dept: 'Mechanical', stopId: 'stop-4' },
    '2024IT315': { rollNo: '2024IT315', name: 'Sneha Reddy', dept: 'Information Tech', stopId: 'stop-1' }
  };

  // --------------------------------------------------------------------------
  // Application State
  // --------------------------------------------------------------------------
  const state = {
    currentUser: {
      role: 'student', // 'student', 'driver', 'admin'
      rollNumber: '2024CS101',
      name: 'Aarav Patel',
      driverId: null,
      targetStopId: 'stop-2'
    },
    bus: { ...DEFAULT_BUS },
    stops: JSON.parse(JSON.stringify(DEFAULT_STOPS)),
    busLocation: {
      lat: DEFAULT_STOPS[0].lat,
      lng: DEFAULT_STOPS[0].lng,
      speed: 0,
      heading: 0,
      currentStopOrder: 1,
      lastPing: new Date()
    },
    tripStatus: 'idle', // 'idle', 'in_transit', 'paused'
    proximityAlertRadius: 500, // in meters
    alertTriggeredForStop: null,
    arrivalTriggeredForStop: null,
    audioEnabled: true,
    notificationsAllowed: false,
    
    // Map State
    map: null,
    mapLayerType: 'hybrid', // 'hybrid', 'satellite', 'dark', 'streets'
    mapTileLayers: {},
    busMarker: null,
    stopMarkers: [],
    routePolyline: null,
    proximityCircle: null,
    isPickingCoordinates: false,
    activeRecorrectStopId: null,

    // Driver & Simulation State
    gpsMode: 'simulated', // 'simulated', 'device'
    simSpeedMultiplier: 2,
    simTimer: null,
    simCurrentLegIndex: 0,
    simLegProgress: 0,
    deviceWatchId: null,

    // Supabase & Realtime Sync
    supabaseClient: null,
    supabaseChannel: null,
    broadcastChannel: null, // multi-tab sync fallback
    isSupabaseConnected: false
  };

  // --------------------------------------------------------------------------
  // Sound Synthesizer (Zero external dependencies audio chimes)
  // --------------------------------------------------------------------------
  const SoundEngine = {
    audioCtx: null,

    init() {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.audioCtx = new AudioContext();
        }
      } catch (e) {
        console.warn('Web Audio not supported:', e);
      }
    },

    resume() {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    },

    playTone(frequency, duration, type = 'sine', delay = 0, gainLevel = 0.15) {
      if (!state.audioEnabled || !this.audioCtx) return;
      this.resume();

      setTimeout(() => {
        try {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();

          osc.type = type;
          osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

          gain.gain.setValueAtTime(gainLevel, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);

          osc.connect(gain);
          gain.connect(this.audioCtx.destination);

          osc.start();
          osc.stop(this.audioCtx.currentTime + duration);
        } catch (err) {
          console.error('Audio tone error', err);
        }
      }, delay * 1000);
    },

    playProximityChime() {
      // Pleasant alerting double-chime (E5 -> B5)
      this.playTone(659.25, 0.28, 'triangle', 0, 0.2);
      this.playTone(987.77, 0.45, 'sine', 0.15, 0.25);
    },

    playArrivalChime() {
      // Ascending celebratory fanfare (C5 -> E5 -> G5 -> C6)
      this.playTone(523.25, 0.2, 'triangle', 0, 0.2);
      this.playTone(659.25, 0.2, 'triangle', 0.12, 0.2);
      this.playTone(783.99, 0.2, 'sine', 0.24, 0.22);
      this.playTone(1046.50, 0.6, 'sine', 0.36, 0.28);
    },

    playTripStartChime() {
      this.playTone(440.00, 0.25, 'sine', 0, 0.15);
      this.playTone(880.00, 0.4, 'sine', 0.15, 0.2);
    }
  };

  // --------------------------------------------------------------------------
  // Map Layer Engine (Google Satellite, Google Hybrid, Dark, Streets)
  // --------------------------------------------------------------------------
  function initMap() {
    const mapEl = document.getElementById('mapContainer');
    if (!mapEl) return;

    // Center map around first stop or college campus
    const initialCenter = [state.stops[0].lat, state.stops[0].lng];

    state.map = L.map('mapContainer', {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    // Custom Zoom control in bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);

    // Google Satellite Tile Layers
    // lyrs=y: Google Hybrid (Satellite + Roads & Labels)
    state.mapTileLayers.hybrid = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
      }
    );

    // lyrs=s: Google Pure Satellite (No labels)
    state.mapTileLayers.satellite = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
      }
    );

    // CartoDB Dark Matter (High-Contrast Dark Streets)
    state.mapTileLayers.dark = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }
    );

    // OpenStreetMap Streets
    state.mapTileLayers.streets = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }
    );

    // Add default hybrid layer
    state.mapTileLayers[state.mapLayerType].addTo(state.map);

    // Render Stops and Route
    renderRouteElements();

    // Map Click Listener for Interactive Pin Picking in Stop Re-correction
    state.map.on('click', handleMapClick);
  }

  function setMapLayer(layerName) {
    if (!state.map || !state.mapTileLayers[layerName]) return;

    // Remove active layer
    if (state.mapTileLayers[state.mapLayerType]) {
      state.map.removeLayer(state.mapTileLayers[state.mapLayerType]);
    }

    state.mapLayerType = layerName;
    state.mapTileLayers[layerName].addTo(state.map);

    // Update layer selector buttons UI
    document.querySelectorAll('.layer-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btnLayer${layerName.charAt(0).toUpperCase() + layerName.slice(1)}`);
    if (activeBtn) activeBtn.classList.add('active');

    showToast('Satellite View Changed', `Switched map view to Google ${layerName.toUpperCase()}`, 'fa-earth-americas');
  }

  // --------------------------------------------------------------------------
  // Map Markers & Route Rendering
  // --------------------------------------------------------------------------
  function renderRouteElements() {
    if (!state.map) return;

    // Clear existing markers & polylines
    clearMapMarkers();

    // 1. Sort stops by order sequence
    state.stops.sort((a, b) => a.order - b.order);

    // 2. Render Stop Markers & Geofence Circles
    const latLngs = [];

    state.stops.forEach((stop, index) => {
      latLngs.push([stop.lat, stop.lng]);

      const isTargetStop = stop.id === state.currentUser.targetStopId;
      const isReCorrecting = stop.id === state.activeRecorrectStopId;

      // Create Custom HTML Marker Icon
      const markerHtml = `
        <div class="stop-marker-icon ${isTargetStop ? 'target-stop' : ''} ${isReCorrecting ? 'draggable-mode' : ''}" 
             id="stop-marker-${stop.id}" title="${stop.name}">
          <span>${stop.order}</span>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-stop-div-icon',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      // Marker is draggable if currently in Re-correct mode
      const isDraggable = (state.currentUser.role === 'admin' || isReCorrecting);

      const marker = L.marker([stop.lat, stop.lng], {
        icon: customIcon,
        draggable: isDraggable
      }).addTo(state.map);

      // Popup Content with Stop Details & Quick Recorrect Action
      const popupContent = `
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; color: #0f172a; padding: 4px;">
          <strong style="font-size: 13px; display: block; margin-bottom: 4px;">Stop #${stop.order}: ${stop.name}</strong>
          <span style="font-size: 11px; color: #475569; display: block;">Coords: ${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}</span>
          <span style="font-size: 11px; color: #0284c7; display: block; margin-top: 2px;">Alert Radius: ${stop.radius || 500}m</span>
          <div style="margin-top: 8px; display: flex; gap: 6px;">
            <button onclick="BusBuddyApp.onStudentStopChange('${stop.id}')" style="background: #0284c7; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">
              Select for Boarding
            </button>
            <button onclick="BusBuddyApp.startRecorrectStop('${stop.id}')" style="background: #f59e0b; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">
              Re-correct Pin
            </button>
          </div>
        </div>
      `;
      marker.bindPopup(popupContent);

      // Drag End Listener for Immediate Position Re-Correction
      marker.on('dragend', (e) => {
        const newLatLng = e.target.getLatLng();
        handleStopPinDragged(stop.id, newLatLng.lat, newLatLng.lng);
      });

      state.stopMarkers.push({ id: stop.id, marker });

      // Target Stop Proximity Circle Visualizer
      if (isTargetStop) {
        state.proximityCircle = L.circle([stop.lat, stop.lng], {
          radius: state.proximityAlertRadius,
          color: '#00f2fe',
          fillColor: '#00f2fe',
          fillOpacity: 0.12,
          weight: 2,
          dashArray: '6, 6'
        }).addTo(state.map);
      }
    });

    // 3. Render Route Polyline connecting all stops
    if (latLngs.length > 1) {
      state.routePolyline = L.polyline(latLngs, {
        color: '#00f2fe',
        weight: 4,
        opacity: 0.85,
        smoothFactor: 1.0,
        dashArray: '8, 8'
      }).addTo(state.map);
    }

    // 4. Render Bus Marker with Rotation
    renderBusMarker();
  }

  function clearMapMarkers() {
    if (state.stopMarkers) {
      state.stopMarkers.forEach(m => state.map.removeLayer(m.marker));
      state.stopMarkers = [];
    }
    if (state.routePolyline) {
      state.map.removeLayer(state.routePolyline);
      state.routePolyline = null;
    }
    if (state.proximityCircle) {
      state.map.removeLayer(state.proximityCircle);
      state.proximityCircle = null;
    }
  }

  function renderBusMarker() {
    if (!state.map) return;

    const busPos = [state.busLocation.lat, state.busLocation.lng];
    const busHtml = `
      <div class="bus-marker-icon" id="busMarkerIcon" style="transform: rotate(${state.busLocation.heading}deg);">
        <i class="fa-solid fa-bus"></i>
      </div>
    `;

    const busIcon = L.divIcon({
      html: busHtml,
      className: 'custom-bus-div-icon',
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    if (!state.busMarker) {
      state.busMarker = L.marker(busPos, { icon: busIcon, zIndexOffset: 1000 }).addTo(state.map);
    }
    state.busMarker.setLatLng(busPos);
    state.busMarker.setIcon(busIcon);
    // Refresh popup content too, otherwise the speed shown stays at the value
    // captured when the marker was first created.
    state.busMarker.bindPopup(`
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px;">
        <strong style="color: #032b43; font-size: 14px;">${state.bus.busNumber}</strong><br>
        <span style="font-size: 12px; color: #475569;">Driver: ${state.bus.driverName}</span><br>
        <span style="font-size: 12px; color: #0284c7; font-weight: bold;">Speed: ${state.busLocation.speed.toFixed(1)} km/h</span>
      </div>
    `);
  }

  function centerOnBus() {
    if (state.map && state.busLocation) {
      state.map.setView([state.busLocation.lat, state.busLocation.lng], 16, { animate: true });
    }
  }

  function fitRouteBounds() {
    if (state.map && state.stops.length > 0) {
      const bounds = L.latLngBounds(state.stops.map(s => [s.lat, s.lng]));
      state.map.fitBounds(bounds, { padding: [60, 60], animate: true });
    }
  }

  // --------------------------------------------------------------------------
  // Geodesic Math & Proximity Calculations
  // --------------------------------------------------------------------------
  function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function calculateBearing(lat1, lon1, lat2, lon2) {
    const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
    const theta = Math.atan2(y, x);
    return ((theta * 180 / Math.PI) + 360) % 360;
  }

  // --------------------------------------------------------------------------
  // Real-Time Telemetry & Proximity Alert Processing
  // --------------------------------------------------------------------------
  function updateTelemetry(newLat, newLng, speed = 35, heading = 0) {
    state.busLocation.lat = newLat;
    state.busLocation.lng = newLng;
    state.busLocation.speed = speed;
    state.busLocation.heading = heading;
    state.busLocation.lastPing = new Date();

    // 1. Move Bus Marker smoothly
    renderBusMarker();

    // 2. Update Driver readouts if on driver panel
    const latEl = document.getElementById('driverLat');
    const lngEl = document.getElementById('driverLng');
    const speedEl = document.getElementById('driverSpeed');
    if (latEl) latEl.innerText = newLat.toFixed(5);
    if (lngEl) lngEl.innerText = newLng.toFixed(5);
    if (speedEl) speedEl.innerText = `${speed.toFixed(1)} km/h`;

    // 3. Update Floating HUD
    const hudSpeed = document.getElementById('hudSpeed');
    const hudHeading = document.getElementById('hudHeading');
    if (hudSpeed) hudSpeed.innerText = `${speed.toFixed(1)} km/h`;
    if (hudHeading) hudHeading.innerText = `${Math.round(heading)}°`;

    // 4. Calculate Distance and ETA to Student's Selected Stop
    checkStudentProximity();

    // 5. Broadcast to Supabase & local tabs
    broadcastTelemetry();
  }

  function checkStudentProximity() {
    const targetStop = state.stops.find(s => s.id === state.currentUser.targetStopId);
    if (!targetStop) return;

    const distanceMeters = calculateDistanceMeters(
      state.busLocation.lat,
      state.busLocation.lng,
      targetStop.lat,
      targetStop.lng
    );

    // Update UI Distance Readouts
    const distEl = document.getElementById('teleDistance');
    const etaEl = document.getElementById('teleEta');
    const speedSubEl = document.getElementById('teleSpeed');
    const statusSubEl = document.getElementById('teleDistanceStatus');
    const progressBar = document.getElementById('proximityProgressBar');
    const alertCallout = document.getElementById('geofenceAlertCallout');
    const alertMsg = document.getElementById('geofenceAlertMsg');

    if (distEl) {
      distEl.innerText = distanceMeters >= 1000 
        ? `${(distanceMeters / 1000).toFixed(2)} km` 
        : `${Math.round(distanceMeters)} m`;
    }

    // Estimate minutes: average city speed ~30 km/h = 500 m/min
    const estimatedMinutes = Math.max(1, Math.round(distanceMeters / 500));
    if (etaEl) {
      etaEl.innerText = state.tripStatus === 'idle' 
        ? 'Trip Idle' 
        : `~${estimatedMinutes} min${estimatedMinutes > 1 ? 's' : ''}`;
    }

    if (speedSubEl) {
      speedSubEl.innerText = `Current Speed: ${state.busLocation.speed.toFixed(1)} km/h`;
    }

    // Progress bar towards arrival (within 2000m range)
    if (progressBar) {
      const progressPercent = Math.min(100, Math.max(0, (1 - (distanceMeters / 2000)) * 100));
      progressBar.style.width = `${progressPercent}%`;
    }

    // Identify next upcoming stop for HUD
    const hudNextStop = document.getElementById('hudNextStop');
    if (hudNextStop) {
      const nextStop = state.stops.find(s => s.order >= state.busLocation.currentStopOrder) || state.stops[state.stops.length - 1];
      hudNextStop.innerText = nextStop ? nextStop.name : 'In Transit';
    }

    // PROXIMITY ALERT TRIGGER: Bus is within student's designated alert radius (e.g. 500m)
    if (state.tripStatus === 'in_transit') {
      if (distanceMeters <= state.proximityAlertRadius && state.alertTriggeredForStop !== targetStop.id) {
        state.alertTriggeredForStop = targetStop.id;
        triggerArrivalNotification(targetStop, distanceMeters, estimatedMinutes);
      }

      // ARRIVAL ALERT TRIGGER: Bus is within 75 meters of the stop
      if (distanceMeters <= 75 && state.arrivalTriggeredForStop !== targetStop.id) {
        state.arrivalTriggeredForStop = targetStop.id;
        triggerReachedStopNotification(targetStop);
      }

      if (distanceMeters <= state.proximityAlertRadius) {
        if (alertCallout) alertCallout.style.display = 'flex';
        if (alertMsg) alertMsg.innerText = `Bus approaching ${targetStop.name} (${Math.round(distanceMeters)}m away)`;
        if (statusSubEl) statusSubEl.innerText = '⚡ Proximity Alert Active';
      } else {
        if (alertCallout) alertCallout.style.display = 'none';
        if (statusSubEl) statusSubEl.innerText = 'En Route';
      }
    }
  }

  // --------------------------------------------------------------------------
  // Smart Notifications & Audio Chimes
  // --------------------------------------------------------------------------
  function triggerArrivalNotification(stop, distanceMeters, minutes) {
    // 1. Play Synthesized Chime
    SoundEngine.playProximityChime();

    // 2. Vibrate mobile device if supported
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }

    const title = `🚨 Bus Approaching Your Stop!`;
    const message = `${state.bus.busNumber} is within ${Math.round(distanceMeters)}m of ${stop.name}. Estimated arrival in ~${minutes} min(s). Please be at the pickup point!`;

    // 3. In-App Toast
    showToast(title, message, 'fa-bell', true);

    // 4. HTML5 Web Push Notification
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png',
          badge: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png'
        });
      } catch (err) {
        console.warn('Native notification failed:', err);
      }
    }
  }

  function triggerReachedStopNotification(stop) {
    SoundEngine.playArrivalChime();
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 400]);

    const title = `🚌 Bus Arrived at Stop!`;
    const message = `${state.bus.busNumber} has arrived at ${stop.name}.`;

    showToast(title, message, 'fa-circle-check', true);

    if (Notification.permission === 'granted') {
      new Notification(title, { body: message });
    }
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      state.notificationsAllowed = true;
      const notifBadge = document.getElementById('notifBadgeDot');
      if (notifBadge) notifBadge.classList.add('active');
      showToast('Notifications Enabled', 'You will receive satellite proximity alerts when the bus approaches your stop.', 'fa-bell');
    }
  }

  // --------------------------------------------------------------------------
  // Stop Manager & Re-Correction Engine
  // --------------------------------------------------------------------------
  function populateStopsManagerList() {
    const container = document.getElementById('stopsManagerList');
    const badge = document.getElementById('stopsTotalBadge');
    if (!container) return;

    if (badge) badge.innerText = `${state.stops.length} Stops Configured`;

    container.innerHTML = state.stops.map((stop, index) => `
      <div class="stop-manage-item ${stop.id === state.activeRecorrectStopId ? 'active-recorrect' : ''}" id="stop-card-${stop.id}">
        <div class="stop-item-top">
          <div class="stop-item-order">${stop.order}</div>
          <div class="stop-item-title">${escapeHtml(stop.name)}</div>
          <div class="stop-item-coords">${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}</div>
        </div>
        <div class="stop-item-controls">
          <div class="stop-order-btns">
            <button class="mini-btn" title="Move Up" onclick="BusBuddyApp.moveStopOrder('${stop.id}', -1)" ${index === 0 ? 'disabled' : ''}>
              <i class="fa-solid fa-arrow-up"></i>
            </button>
            <button class="mini-btn" title="Move Down" onclick="BusBuddyApp.moveStopOrder('${stop.id}', 1)" ${index === state.stops.length - 1 ? 'disabled' : ''}>
              <i class="fa-solid fa-arrow-down"></i>
            </button>
          </div>
          <div class="stop-edit-btns">
            <button class="btn-edit-pin" onclick="BusBuddyApp.startRecorrectStop('${stop.id}')" title="Drag Pin on Satellite Map">
              <i class="fa-solid fa-location-crosshairs"></i> Re-correct Pin
            </button>
            <button class="mini-btn" title="Edit Stop Details" onclick="BusBuddyApp.openEditStopModal('${stop.id}')">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="mini-btn" title="Delete Stop" onclick="BusBuddyApp.deleteStop('${stop.id}')">
              <i class="fa-solid fa-trash text-danger"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  function startRecorrectStop(stopId) {
    state.activeRecorrectStopId = stopId;
    const targetStop = state.stops.find(s => s.id === stopId);
    if (!targetStop) return;

    // Switch to Stops tab if not already there
    switchTab('stops');

    // Pan map to stop and zoom into satellite imagery
    if (state.map) {
      state.map.setView([targetStop.lat, targetStop.lng], 17, { animate: true });
    }

    renderRouteElements();
    populateStopsManagerList();

    showToast('Re-correction Active', `Drag marker #${targetStop.order} (${targetStop.name}) or click on map to reposition it!`, 'fa-location-crosshairs');
  }

  function handleStopPinDragged(stopId, newLat, newLng) {
    const stop = state.stops.find(s => s.id === stopId);
    if (!stop) return;

    stop.lat = parseFloat(newLat.toFixed(6));
    stop.lng = parseFloat(newLng.toFixed(6));

    renderRouteElements();
    populateStopsManagerList();
    populateStudentStopSelect();

    showToast('Stop Pin Re-corrected', `${stop.name} updated to [${stop.lat}, ${stop.lng}]. Click 'Save to Supabase' to persist.`, 'fa-check');
  }

  function handleMapClick(e) {
    if (state.isPickingCoordinates) {
      // Coordinate picker for modal
      const latInput = document.getElementById('inputStopLat');
      const lngInput = document.getElementById('inputStopLng');
      if (latInput) latInput.value = e.latlng.lat.toFixed(6);
      if (lngInput) lngInput.value = e.latlng.lng.toFixed(6);
      state.isPickingCoordinates = false;
      document.getElementById('stopModal').style.display = 'flex';
      showToast('Coordinates Picked', `Selected: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`, 'fa-crosshairs');
      return;
    }

    if (state.activeRecorrectStopId) {
      // Reposition active stop directly by clicking anywhere on the satellite map
      handleStopPinDragged(state.activeRecorrectStopId, e.latlng.lat, e.latlng.lng);
    }
  }

  function moveStopOrder(stopId, direction) {
    const index = state.stops.findIndex(s => s.id === stopId);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.stops.length) return;

    // Swap items
    const temp = state.stops[index];
    state.stops[index] = state.stops[newIndex];
    state.stops[newIndex] = temp;

    // Re-assign sequential orders
    state.stops.forEach((s, idx) => {
      s.order = idx + 1;
    });

    renderRouteElements();
    populateStopsManagerList();
    populateStudentStopSelect();
    updateStudentTimeline();

    showToast('Order Re-indexed', `Updated route sequence.`, 'fa-arrow-down-up-across-line');
  }

  function deleteStop(stopId) {
    if (state.stops.length <= 2) {
      alert('A bus route must have at least 2 stops (Origin & Destination).');
      return;
    }

    if (!confirm('Are you sure you want to remove this stop from the route?')) return;

    state.stops = state.stops.filter(s => s.id !== stopId);
    state.stops.forEach((s, idx) => { s.order = idx + 1; });

    if (state.currentUser.targetStopId === stopId) {
      state.currentUser.targetStopId = state.stops[0].id;
    }

    renderRouteElements();
    populateStopsManagerList();
    populateStudentStopSelect();
    updateStudentTimeline();

    showToast('Stop Removed', 'Stop has been deleted from route.', 'fa-trash');
  }

  function openAddStopModal() {
    document.getElementById('stopModalTitle').innerText = 'Add New Bus Stop';
    document.getElementById('editStopId').value = '';
    document.getElementById('inputStopName').value = '';
    
    // Suggest coordinates near current route end or map center
    const center = state.map ? state.map.getCenter() : { lat: 13.0827, lng: 80.2707 };
    document.getElementById('inputStopLat').value = center.lat.toFixed(6);
    document.getElementById('inputStopLng').value = center.lng.toFixed(6);
    document.getElementById('inputStopOrder').value = state.stops.length + 1;
    document.getElementById('inputStopGeofence').value = 500;

    document.getElementById('stopModal').style.display = 'flex';
  }

  function openEditStopModal(stopId) {
    const stop = state.stops.find(s => s.id === stopId);
    if (!stop) return;

    document.getElementById('stopModalTitle').innerText = 'Edit Stop Details';
    document.getElementById('editStopId').value = stop.id;
    document.getElementById('inputStopName').value = stop.name;
    document.getElementById('inputStopLat').value = stop.lat;
    document.getElementById('inputStopLng').value = stop.lng;
    document.getElementById('inputStopOrder').value = stop.order;
    document.getElementById('inputStopGeofence').value = stop.radius || 500;

    document.getElementById('stopModal').style.display = 'flex';
  }

  function closeStopModal() {
    document.getElementById('stopModal').style.display = 'none';
  }

  function pickCoordinatesFromMap() {
    state.isPickingCoordinates = true;
    closeStopModal();
    showToast('Click Map', 'Click anywhere on the Google Satellite map to pick the stop coordinates.', 'fa-crosshairs');
  }

  function handleSaveStop(event) {
    event.preventDefault();
    const id = document.getElementById('editStopId').value || `stop-${Date.now()}`;
    const name = document.getElementById('inputStopName').value.trim();
    const lat = parseFloat(document.getElementById('inputStopLat').value);
    const lng = parseFloat(document.getElementById('inputStopLng').value);
    const order = parseInt(document.getElementById('inputStopOrder').value, 10);
    const radius = parseInt(document.getElementById('inputStopGeofence').value, 10) || 500;

    const existingIdx = state.stops.findIndex(s => s.id === id);
    const stopObj = { id, name, lat, lng, order, radius, etaMinutes: order * 6 };

    if (existingIdx >= 0) {
      state.stops[existingIdx] = stopObj;
    } else {
      state.stops.push(stopObj);
    }

    state.stops.sort((a, b) => a.order - b.order);
    closeStopModal();

    renderRouteElements();
    populateStopsManagerList();
    populateStudentStopSelect();
    updateStudentTimeline();

    showToast('Stop Saved', `${name} has been configured.`, 'fa-check');
  }

  // --------------------------------------------------------------------------
  // Supabase Database Integration & Realtime Sync
  // --------------------------------------------------------------------------
  function initSupabase() {
    // Resolve keys: hardcoded constants take priority, then localStorage (settings panel)
    const resolvedUrl = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL.trim())
      ? SUPABASE_URL.trim()
      : localStorage.getItem('busbuddy_supabase_url') || '';

    const resolvedKey = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY.trim())
      ? SUPABASE_ANON_KEY.trim()
      : localStorage.getItem('busbuddy_supabase_key') || '';

    // Pre-fill the settings modal inputs so users can see what's configured
    const urlInput = document.getElementById('inputSupabaseUrl');
    const keyInput = document.getElementById('inputSupabaseKey');
    if (urlInput && resolvedUrl) urlInput.value = resolvedUrl;
    if (keyInput && resolvedKey) keyInput.value = resolvedKey;

    // Restore stops previously saved locally (Supabase-less mode)
    const cachedStops = localStorage.getItem('busbuddy_saved_stops');
    if (cachedStops) {
      try {
        const parsed = JSON.parse(cachedStops);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          state.stops = parsed;
          state.currentUser.targetStopId = parsed.some(s => s.id === state.currentUser.targetStopId)
            ? state.currentUser.targetStopId
            : parsed[1].id;
          renderRouteElements();
          updateStudentTimeline();
        }
      } catch (err) {
        console.warn('Cached stops could not be parsed, using defaults:', err);
      }
    }

    // BroadcastChannel for instant local multi-tab sync without needing keys.
    // Re-applied settings call initSupabase() again, so guard against leaking a
    // duplicate channel (each one would re-run every handler).
    if (!state.broadcastChannel) {
      state.broadcastChannel = new BroadcastChannel('busbuddy_telemetry_channel');
    }
    state.broadcastChannel.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === 'TELEMETRY_UPDATE') {
        onRemoteTelemetryReceived(data.payload);
      } else if (data && data.type === 'STOPS_SYNC' && Array.isArray(data.stops) && data.stops.length >= 2) {
        state.stops = data.stops;
        state.stops.sort((a, b) => a.order - b.order);
        renderRouteElements();
        populateStopsManagerList();
        populateStudentStopSelect();
        updateStudentTimeline();
        checkStudentProximity();
      } else if (data && data.type === 'TRIP_EVENT') {
        handleTripStatusChange(data.status, false);
      } else if (data && data.type === 'ANNOUNCEMENT') {
        showToast('Driver Announcement', data.message, 'fa-bullhorn');
      }
    };

    if (resolvedUrl && resolvedKey && window.supabase) {
      try {
        state.supabaseClient = window.supabase.createClient(resolvedUrl, resolvedKey);
        state.isSupabaseConnected = true;
        updateConnectionBadge(true, 'Supabase Cloud Connected');
        console.log('✅ BusBuddy: Connected to Supabase at', resolvedUrl);
        subscribeToSupabaseRealtime();
        fetchSupabaseData();
      } catch (err) {
        console.error('❌ BusBuddy: Supabase init failed — check your URL and Anon Key:', err);
        updateConnectionBadge(false, 'Key Error — Check Console');
      }
    } else {
      console.log('ℹ️ BusBuddy: No Supabase keys found — running in Local Demo Mode (multi-tab sync works!)');
      updateConnectionBadge(false, 'Local Demo Mode (No Keys)');
    }
  }

  function updateConnectionBadge(isConnected, label) {
    const badge = document.getElementById('connectionStatusBadge');
    const text = document.getElementById('connectionStatusText');
    if (badge && text) {
      text.innerText = label;
      if (isConnected) {
        badge.className = 'status-badge connected';
      } else {
        badge.className = 'status-badge';
      }
    }
  }

  async function fetchSupabaseData() {
    if (!state.supabaseClient) return;

    try {
      // 1. Fetch Buses
      const { data: buses } = await state.supabaseClient.from('buses').select('*').limit(1);
      if (buses && buses.length > 0) {
        state.bus = {
          id: buses[0].id,
          busNumber: buses[0].bus_number,
          routeName: buses[0].route_name,
          driverName: buses[0].driver_name,
          driverPhone: buses[0].driver_phone
        };
        updateBusProfileUI();
      }

      // 2. Fetch Stops
      const { data: dbStops } = await state.supabaseClient
        .from('bus_stops')
        .select('*')
        .order('stop_order', { ascending: true });

      if (dbStops && dbStops.length > 0) {
        state.stops = dbStops.map(s => ({
          id: s.id,
          name: s.stop_name,
          order: s.stop_order,
          lat: s.latitude,
          lng: s.longitude,
          radius: s.geofence_radius || 500,
          etaMinutes: s.eta_offset_minutes || 5
        }));
        if (!state.stops.some(s => s.id === state.currentUser.targetStopId)) {
          state.currentUser.targetStopId = state.stops[1] ? state.stops[1].id : state.stops[0].id;
        }
        renderRouteElements();
        populateStopsManagerList();
        populateStudentStopSelect();
        updateStudentTimeline();
      }

      // 3. Fetch latest bus location
      const { data: locs } = await state.supabaseClient
        .from('bus_locations')
        .select('*')
        .limit(1);

      if (locs && locs.length > 0) {
        state.busLocation.lat = locs[0].latitude;
        state.busLocation.lng = locs[0].longitude;
        state.busLocation.speed = locs[0].speed || 0;
        state.busLocation.heading = locs[0].heading || 0;
        renderBusMarker();
      }
    } catch (err) {
      console.warn('Supabase query error (using fallback local cache):', err);
    }
  }

  function subscribeToSupabaseRealtime() {
    if (!state.supabaseClient) return;

    state.supabaseChannel = state.supabaseClient
      .channel('busbuddy_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_locations' }, (payload) => {
        if (payload.new) {
          onRemoteTelemetryReceived({
            lat: payload.new.latitude,
            lng: payload.new.longitude,
            speed: payload.new.speed,
            heading: payload.new.heading
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_stops' }, () => {
        fetchSupabaseData();
      })
      .subscribe();
  }

  async function saveStopsToSupabase() {
    if (!state.supabaseClient) {
      // Local broadcast & storage save
      localStorage.setItem('busbuddy_saved_stops', JSON.stringify(state.stops));
      if (state.broadcastChannel) {
        state.broadcastChannel.postMessage({ type: 'STOPS_SYNC', stops: state.stops });
      }
      showToast('Stops Saved Locally', 'Changes saved to browser storage and synced across tabs.', 'fa-circle-check');
      return;
    }

    try {
      const busId = isUuid(state.bus.id) ? state.bus.id : null;

      // Include the row id when it is a real UUID so the upsert updates the
      // existing stop instead of inserting a duplicate on every save.
      const records = state.stops.map(s => {
        const row = {
          bus_id: busId,
          stop_name: s.name,
          stop_order: s.order,
          latitude: s.lat,
          longitude: s.lng,
          geofence_radius: s.radius,
          eta_offset_minutes: s.etaMinutes
        };
        if (isUuid(s.id)) row.id = s.id;
        return row;
      });

      // Upsert stops
      const { error } = await state.supabaseClient.from('bus_stops').upsert(records);
      if (error) throw error;

      showToast('Supabase Synced', `${state.stops.length} stops updated in Supabase cloud database!`, 'fa-cloud-arrow-up');
    } catch (err) {
      console.error('Save to Supabase failed:', err);
      showToast('Sync Warning', 'Could not save to Supabase: ' + err.message, 'fa-triangle-exclamation');
    }
  }

  function isUuid(value) {
    return typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  function broadcastTelemetry() {
    const payload = {
      lat: state.busLocation.lat,
      lng: state.busLocation.lng,
      speed: state.busLocation.speed,
      heading: state.busLocation.heading,
      currentStopOrder: state.busLocation.currentStopOrder
    };

    // 1. Broadcast locally to other browser tabs
    if (state.broadcastChannel) {
      state.broadcastChannel.postMessage({ type: 'TELEMETRY_UPDATE', payload });
    }

    // 2. Broadcast to Supabase if connected and the bus has a real UUID row.
    // bus_locations.bus_id is a foreign key, so a placeholder id would fail the
    // write with a foreign-key violation.
    if (state.supabaseClient && isUuid(state.bus.id)) {
      state.supabaseClient.from('bus_locations').upsert({
        bus_id: state.bus.id,
        latitude: payload.lat,
        longitude: payload.lng,
        speed: payload.speed,
        heading: payload.heading,
        last_ping: new Date().toISOString()
      }).then();
    }
  }

  function onRemoteTelemetryReceived(data) {
    if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number') return;
    if (Number.isNaN(data.lat) || Number.isNaN(data.lng)) return;

    state.busLocation.lat = data.lat;
    state.busLocation.lng = data.lng;
    state.busLocation.speed = data.speed || 0;
    state.busLocation.heading = data.heading || 0;
    if (data.currentStopOrder) state.busLocation.currentStopOrder = data.currentStopOrder;

    renderBusMarker();
    checkStudentProximity();
  }

  // --------------------------------------------------------------------------
  // Driver Trip Controls & Simulation Engine
  // --------------------------------------------------------------------------
  function startDriverTrip() {
    state.tripStatus = 'in_transit';
    handleTripStatusChange('in_transit', true);

    SoundEngine.playTripStartChime();
    showToast('Trip Started', 'Broadcasting live satellite GPS coordinates.', 'fa-bus');

    if (state.gpsMode === 'simulated') {
      startSimulationLoop();
    } else {
      startDeviceGeolocation();
    }
  }

  function pauseDriverTrip() {
    state.tripStatus = 'paused';
    handleTripStatusChange('paused', true);
    stopSimulationLoop();
    showToast('Trip Paused', 'GPS broadcast paused.', 'fa-pause');
  }

  function endDriverTrip() {
    state.tripStatus = 'idle';
    handleTripStatusChange('idle', true);
    stopSimulationLoop();
    stopDeviceGeolocation();

    state.alertTriggeredForStop = null;
    state.arrivalTriggeredForStop = null;

    showToast('Trip Completed', 'Bus has reached its final destination.', 'fa-flag-checkered');
  }

  function handleTripStatusChange(newStatus, broadcast = true) {
    state.tripStatus = newStatus;

    const tripBadge = document.getElementById('tripStatusBadge');
    const tripText = document.getElementById('tripStatusText');
    const btnStart = document.getElementById('btnStartTrip');
    const btnPause = document.getElementById('btnPauseTrip');
    const btnEnd = document.getElementById('btnEndTrip');

    if (newStatus === 'in_transit') {
      if (tripBadge) tripBadge.className = 'status-badge trip-active';
      if (tripText) tripText.innerText = 'Trip In Transit';
      if (btnStart) btnStart.disabled = true;
      if (btnPause) btnPause.disabled = false;
      if (btnEnd) btnEnd.disabled = false;
    } else if (newStatus === 'paused') {
      if (tripBadge) tripBadge.className = 'status-badge';
      if (tripText) tripText.innerText = 'Trip Paused';
      if (btnStart) btnStart.disabled = false;
      if (btnPause) btnPause.disabled = true;
      if (btnEnd) btnEnd.disabled = false;
    } else {
      if (tripBadge) tripBadge.className = 'status-badge trip-idle';
      if (tripText) tripText.innerText = 'Bus Idle';
      if (btnStart) btnStart.disabled = false;
      if (btnPause) btnPause.disabled = true;
      if (btnEnd) btnEnd.disabled = true;
    }

    if (broadcast && state.broadcastChannel) {
      state.broadcastChannel.postMessage({ type: 'TRIP_EVENT', status: newStatus });
    }
  }

  function startSimulationLoop() {
    stopSimulationLoop();

    state.simTimer = setInterval(() => {
      if (state.stops.length < 2) return;

      // Advance leg progress
      const step = 0.015 * state.simSpeedMultiplier;
      state.simLegProgress += step;

      // Roll over to the next leg BEFORE resolving waypoints, otherwise the
      // interpolation would run between the previous leg's stops and the bus
      // would visibly jump backwards every time it reached a waypoint.
      if (state.simLegProgress >= 1.0) {
        state.simLegProgress = 0;
        state.simCurrentLegIndex = (state.simCurrentLegIndex + 1) % (state.stops.length - 1);
      }

      const fromStop = state.stops[state.simCurrentLegIndex];
      const toStop = state.stops[(state.simCurrentLegIndex + 1) % state.stops.length];

      // Linear interpolation between waypoints
      const currentLat = fromStop.lat + (toStop.lat - fromStop.lat) * state.simLegProgress;
      const currentLng = fromStop.lng + (toStop.lng - fromStop.lng) * state.simLegProgress;
      const heading = calculateBearing(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng);
      const simulatedSpeed = 32 + (Math.sin(Date.now() / 2000) * 8);

      state.busLocation.currentStopOrder = toStop.order;
      updateTelemetry(currentLat, currentLng, simulatedSpeed, heading);
    }, 500);
  }

  function stopSimulationLoop() {
    if (state.simTimer) {
      clearInterval(state.simTimer);
      state.simTimer = null;
    }
  }

  function startDeviceGeolocation() {
    if (!('geolocation' in navigator)) {
      alert('Device geolocation is not supported on this browser.');
      setGpsMode('simulated');
      return;
    }

    state.deviceWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const speedKmH = (pos.coords.speed || 0) * 3.6;
        const heading = pos.coords.heading || 0;
        updateTelemetry(pos.coords.latitude, pos.coords.longitude, speedKmH, heading);
      },
      (err) => {
        console.warn('Device GPS error:', err);
        showToast('GPS Sensor Warning', 'Could not read device GPS. Falling back to simulation.', 'fa-triangle-exclamation');
        setGpsMode('simulated');
      },
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
  }

  function stopDeviceGeolocation() {
    if (state.deviceWatchId) {
      navigator.geolocation.clearWatch(state.deviceWatchId);
      state.deviceWatchId = null;
    }
  }

  function setGpsMode(mode) {
    state.gpsMode = mode;
    document.getElementById('btnGpsModeSim').classList.toggle('active', mode === 'simulated');
    document.getElementById('btnGpsModeDevice').classList.toggle('active', mode === 'device');
    document.getElementById('simSpeedControls').style.display = mode === 'simulated' ? 'flex' : 'none';

    if (state.tripStatus === 'in_transit') {
      if (mode === 'simulated') {
        stopDeviceGeolocation();
        startSimulationLoop();
      } else {
        stopSimulationLoop();
        startDeviceGeolocation();
      }
    }
  }

  function setSimSpeed(multiplier, btn) {
    state.simSpeedMultiplier = multiplier;
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    if (btn && btn.classList) btn.classList.add('active');
  }

  function quickBroadcast(message) {
    showToast('Student Broadcast', message, 'fa-bullhorn');
    if (state.broadcastChannel) {
      state.broadcastChannel.postMessage({ type: 'ANNOUNCEMENT', message });
    }
    if (state.supabaseClient && isUuid(state.bus.id)) {
      state.supabaseClient.from('notifications').insert({
        bus_id: state.bus.id,
        title: 'Driver Announcement',
        message: message,
        type: 'broadcast'
      }).then(() => {}, err => console.warn('Announcement insert failed:', err.message));
    }
  }

  // --------------------------------------------------------------------------
  // Student & Authentication Views
  // --------------------------------------------------------------------------
  function populateStudentStopSelect() {
    const select = document.getElementById('selectStudentStop');
    if (!select) return;

    select.innerHTML = state.stops.map(stop => `
      <option value="${stop.id}" ${stop.id === state.currentUser.targetStopId ? 'selected' : ''}>
        Stop #${stop.order}: ${escapeHtml(stop.name)} (${stop.radius || 500}m Alert)
      </option>
    `).join('');
  }

  function updateStudentTimeline() {
    const container = document.getElementById('studentTimeline');
    const pill = document.getElementById('studentStopCountPill');
    if (!container) return;

    if (pill) pill.innerText = `${state.stops.length} Stops`;

    container.innerHTML = state.stops.map(stop => {
      const isTarget = stop.id === state.currentUser.targetStopId;
      return `
        <div class="timeline-item ${isTarget ? 'selected-target' : ''}" onclick="BusBuddyApp.onStudentStopChange('${stop.id}')" style="cursor: pointer;">
          <div class="stop-marker-num">${stop.order}</div>
          <div class="stop-info">
            <span class="stop-name">${escapeHtml(stop.name)} ${isTarget ? '⭐ (Your Stop)' : ''}</span>
            <span class="stop-distance-eta">Alert Radius: ${stop.radius || 500}m</span>
          </div>
          <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem; color: #64748b;"></i>
        </div>
      `;
    }).join('');
  }

  function onStudentStopChange(stopId) {
    state.currentUser.targetStopId = stopId;
    state.alertTriggeredForStop = null;
    state.arrivalTriggeredForStop = null;

    renderRouteElements();
    updateStudentTimeline();
    checkStudentProximity();

    const selectedStop = state.stops.find(s => s.id === stopId);
    if (selectedStop) {
      showToast('Stop Selected', `Boarding stop set to: ${selectedStop.name}`, 'fa-location-dot');
    }
  }

  function onProximityRadiusChange(radius) {
    state.proximityAlertRadius = parseInt(radius, 10);
    const valEl = document.getElementById('proximityRadiusVal');
    if (valEl) valEl.innerText = `${state.proximityAlertRadius} m`;

    renderRouteElements();
    checkStudentProximity();
  }

  // --------------------------------------------------------------------------
  // Authentication: Roll Number / Driver Login
  // --------------------------------------------------------------------------
  function openAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
  }

  function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
  }

  function setAuthRole(role) {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`authTab${role.charAt(0).toUpperCase() + role.slice(1)}`).classList.add('active');

    document.getElementById('studentAuthForm').style.display = role === 'student' ? 'flex' : 'none';
    document.getElementById('driverAuthForm').style.display = role === 'driver' ? 'flex' : 'none';
    document.getElementById('adminAuthForm').style.display = role === 'admin' ? 'flex' : 'none';
  }

  function fillRollNo(rollNo, name) {
    document.getElementById('inputRollNumber').value = rollNo;
    document.getElementById('inputStudentName').value = name;
  }

  async function handleStudentLogin(e) {
    e.preventDefault();
    const rollNo = document.getElementById('inputRollNumber').value.trim().toUpperCase();
    const studentName = document.getElementById('inputStudentName').value.trim();

    state.currentUser.role = 'student';
    state.currentUser.rollNumber = rollNo;

    // Check if seeded student
    if (SEEDED_STUDENTS[rollNo]) {
      state.currentUser.name = SEEDED_STUDENTS[rollNo].name;
      state.currentUser.targetStopId = SEEDED_STUDENTS[rollNo].stopId;
    } else {
      state.currentUser.name = studentName || `Student (${rollNo})`;
    }

    // Try Supabase lookup if connected
    if (state.supabaseClient) {
      try {
        const { data } = await state.supabaseClient
          .from('students')
          .select('*')
          .eq('roll_number', rollNo)
          .maybeSingle();

        if (data) {
          state.currentUser.name = data.full_name;
          if (data.preferred_stop_id) state.currentUser.targetStopId = data.preferred_stop_id;
        } else {
          // Register new student in Supabase
          await state.supabaseClient.from('students').insert({
            roll_number: rollNo,
            full_name: state.currentUser.name,
            preferred_stop_id: state.stops[1] ? state.stops[1].id : null
          });
        }
      } catch (err) {
        console.warn('Student auth query note:', err);
      }
    }

    updateUserProfileUI();
    closeAuthModal();
    switchTab('student');
    showToast('Welcome, ' + state.currentUser.name, `Logged in with Roll No: ${rollNo}`, 'fa-user-graduate');
  }

  function handleDriverLogin(e) {
    e.preventDefault();
    const driverId = document.getElementById('inputDriverId').value.trim();
    const driverName = document.getElementById('inputDriverName').value.trim() || 'Rajesh Sharma';

    state.currentUser.role = 'driver';
    state.currentUser.driverId = driverId;
    state.currentUser.name = driverName;
    state.bus.driverName = driverName;

    updateUserProfileUI();
    closeAuthModal();
    switchTab('driver');
    showToast('Driver Console Unlocked', `Driver ID: ${driverId}`, 'fa-steering-wheel');
  }

  function handleAdminLogin(e) {
    e.preventDefault();
    const key = document.getElementById('inputAdminKey').value.trim();
    if (key !== 'admin123' && key !== 'admin') {
      alert('Invalid Coordinator Key. (Demo key: admin123)');
      return;
    }

    state.currentUser.role = 'admin';
    state.currentUser.name = 'Campus Coordinator';

    updateUserProfileUI();
    closeAuthModal();
    switchTab('stops');
    showToast('Coordinator Access Granted', 'Full Stop Manager & Route Re-correction enabled.', 'fa-shield-halved');
  }

  function updateUserProfileUI() {
    const nameEl = document.getElementById('userDisplayName');
    const roleTagEl = document.getElementById('userRoleTag');
    const avatarEl = document.getElementById('userAvatar');

    if (nameEl) nameEl.innerText = state.currentUser.name;

    if (roleTagEl) {
      if (state.currentUser.role === 'student') {
        roleTagEl.innerText = `Roll No: ${state.currentUser.rollNumber}`;
      } else if (state.currentUser.role === 'driver') {
        roleTagEl.innerText = `Driver ID: ${state.currentUser.driverId}`;
      } else {
        roleTagEl.innerText = 'Coordinator';
      }
    }

    if (avatarEl) {
      avatarEl.innerHTML = state.currentUser.role === 'student'
        ? '<i class="fa-solid fa-user-graduate"></i>'
        : (state.currentUser.role === 'driver' ? '<i class="fa-solid fa-steering-wheel"></i>' : '<i class="fa-solid fa-shield-halved"></i>');
    }

    populateStudentStopSelect();
    updateStudentTimeline();
  }

  function updateBusProfileUI() {
    const badge = document.getElementById('studentBusBadge');
    const title = document.getElementById('studentRouteTitle');
    const driver = document.getElementById('studentDriverName');
    const phone = document.getElementById('studentDriverPhone');

    if (badge) badge.innerText = state.bus.busNumber.split(' ')[0];
    if (title) title.innerText = state.bus.routeName;
    if (driver) driver.innerText = `Driver: ${state.bus.driverName}`;
    if (phone) phone.href = `tel:${state.bus.driverPhone}`;
  }

  // --------------------------------------------------------------------------
  // Settings & Configuration Modal
  // --------------------------------------------------------------------------
  function openSettingsModal() {
    document.getElementById('inputGoogleMapsKey').value = localStorage.getItem('busbuddy_google_maps_key') || '';
    document.getElementById('inputSupabaseUrl').value = localStorage.getItem('busbuddy_supabase_url') || '';
    document.getElementById('inputSupabaseKey').value = localStorage.getItem('busbuddy_supabase_key') || '';
    document.getElementById('settingsModal').style.display = 'flex';
  }

  function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
  }

  function handleSaveSettings(e) {
    e.preventDefault();
    const gKey = document.getElementById('inputGoogleMapsKey').value.trim();
    const sUrl = document.getElementById('inputSupabaseUrl').value.trim();
    const sKey = document.getElementById('inputSupabaseKey').value.trim();

    if (gKey) localStorage.setItem('busbuddy_google_maps_key', gKey);
    else localStorage.removeItem('busbuddy_google_maps_key');

    if (sUrl && sKey) {
      localStorage.setItem('busbuddy_supabase_url', sUrl);
      localStorage.setItem('busbuddy_supabase_key', sKey);
      initSupabase();
    } else {
      localStorage.removeItem('busbuddy_supabase_url');
      localStorage.removeItem('busbuddy_supabase_key');
      state.supabaseClient = null;
      updateConnectionBadge(false, 'Local Satellite Mode');
    }

    closeSettingsModal();
    showToast('Settings Applied', 'Configuration updated successfully.', 'fa-check');
  }

  function resetDefaultConfig() {
    localStorage.clear();
    state.stops = JSON.parse(JSON.stringify(DEFAULT_STOPS));
    state.bus = { ...DEFAULT_BUS };
    state.currentUser.targetStopId = state.stops[1].id;

    renderRouteElements();
    populateStopsManagerList();
    populateStudentStopSelect();
    updateStudentTimeline();
    closeSettingsModal();
    showToast('Reset Complete', 'Default college route restored.', 'fa-rotate-left');
  }

  // --------------------------------------------------------------------------
  // Navigation Tabs Switcher
  // --------------------------------------------------------------------------
  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(view => view.classList.remove('active'));

    const activeBtn = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    const activeView = document.getElementById(`${tabId}View`);

    if (activeBtn) activeBtn.classList.add('active');
    if (activeView) activeView.classList.add('active');

    // If switching away from stops tab, clear active recorrect highlight and
    // re-render so the marker loses its draggable/pulsing state on the map.
    if (tabId !== 'stops' && state.activeRecorrectStopId) {
      state.activeRecorrectStopId = null;
      renderRouteElements();
      populateStopsManagerList();
    }
  }

  // --------------------------------------------------------------------------
  // UI Helpers (Toast notifications, Audio toggle)
  // --------------------------------------------------------------------------
  let toastTimer = null;
  function showToast(title, message, icon = 'fa-bell', isUrgent = false) {
    const toast = document.getElementById('notificationToast');
    const toastIcon = document.getElementById('toastIcon');
    const toastTitle = document.getElementById('toastTitle');
    const toastMsg = document.getElementById('toastMessage');

    if (!toast) return;

    if (toastIcon) toastIcon.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    if (toastTitle) toastTitle.innerText = title;
    if (toastMsg) toastMsg.innerText = message;

    toast.style.display = 'flex';
    if (isUrgent) {
      toast.style.borderColor = '#00f2fe';
    } else {
      toast.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    }

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      hideToast();
    }, 6000);
  }

  function hideToast() {
    const toast = document.getElementById('notificationToast');
    if (toast) toast.style.display = 'none';
  }

  function toggleAudio() {
    state.audioEnabled = !state.audioEnabled;
    const audioIcon = document.getElementById('audioIcon');
    if (audioIcon) {
      audioIcon.className = state.audioEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark text-muted';
    }
    showToast(state.audioEnabled ? 'Audio Alerts Enabled' : 'Audio Alerts Muted', '', 'fa-volume-high');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  // --------------------------------------------------------------------------
  // Initialization Lifecycle
  // --------------------------------------------------------------------------
  function init() {
    SoundEngine.init();
    initMap();
    initSupabase();

    populateStudentStopSelect();
    updateStudentTimeline();
    populateStopsManagerList();
    updateUserProfileUI();
    updateBusProfileUI();

    // Event Listeners
    document.getElementById('btnToggleAudio').addEventListener('click', toggleAudio);
    document.getElementById('btnNotificationPermission').addEventListener('click', requestNotificationPermission);

    // Initial Telemetry Trigger
    updateTelemetry(state.busLocation.lat, state.busLocation.lng, 0, 0);

    // Request Notification permission silently on first user interaction
    document.body.addEventListener('click', () => {
      SoundEngine.resume();
    }, { once: true });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public Interface for Inline HTML Handlers
  return {
    switchTab,
    setMapLayer,
    centerOnBus,
    fitRouteBounds,
    onStudentStopChange,
    onProximityRadiusChange,
    startDriverTrip,
    pauseDriverTrip,
    endDriverTrip,
    setGpsMode,
    setSimSpeed,
    quickBroadcast,
    startRecorrectStop,
    moveStopOrder,
    deleteStop,
    openAddStopModal,
    openEditStopModal,
    closeStopModal,
    pickCoordinatesFromMap,
    handleSaveStop,
    saveStopsToSupabase,
    openAuthModal,
    closeAuthModal,
    setAuthRole,
    fillRollNo,
    handleStudentLogin,
    handleDriverLogin,
    handleAdminLogin,
    openSettingsModal,
    closeSettingsModal,
    handleSaveSettings,
    resetDefaultConfig,
    hideToast
  };
})();
