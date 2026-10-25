/**
 * Brisbane SimScene & ORM Simulation Engine Architecture
 * Handles Google Maps bindings, mock ORM geometry datasets, SimSpec compilations, and dynamic SimRun rendering loops.
 */

// Global App State Scope
let map;
let simInterval = null;
let isCompiled = false;
let isRunning = false;

// Shared Graphics Rendering References
let trackPolylines = [];
let stationMarkers = [];
let signalMarkers = [];
let trainMarkers = [];

// Static Mock Datasets representing parsed Overpass API / ORM structural layers for South East Queensland (WGS84 Coordinates)
const ORM_DATASET = {
    tracks: [
        // Central Spine (Roma Street -> Central -> Fortitude Valley -> Bowen Hills)
        { id: "way/101", coords: [{lat: -27.4674, lng: 153.0142}, {lat: -27.4661, lng: 153.0244}, {lat: -27.4598, lng: 153.0353}, {lat: -27.4431, lng: 153.0421}], type: "main" },
        // Ferny Grove Branch splitting near Bowen Hills
        { id: "way/102", coords: [{lat: -27.4431, lng: 153.0421}, {lat: -27.4385, lng: 153.0289}, {lat: -27.4262, lng: 153.0112}], type: "branch" },
        // Ipswich / West Spine running from Roma Street out towards Milton/Indooroopilly
        { id: "way/103", coords: [{lat: -27.4674, lng: 153.0142}, {lat: -27.4682, lng: 152.9981}, {lat: -27.5012, lng: 152.9734}], type: "main" },
        // Cleveland/Gold Coast Southern Alignment via South Brisbane
        { id: "way/104", coords: [{lat: -27.4674, lng: 153.0142}, {lat: -27.4754, lng: 153.0202}, {lat: -27.4815, lng: 153.0261}, {lat: -27.5255, lng: 153.0331}], type: "main" }
    ],
    stations: [
        { id: "node/s1", name: "Roma Street Station", lat: -27.4674, lng: 153.0142 },
        { id: "node/s2", name: "Brisbane Central Station", lat: -27.4661, lng: 153.0244 },
        { id: "node/s3", name: "Fortitude Valley Station", lat: -27.4598, lng: 153.0353 },
        { id: "node/s4", name: "Bowen Hills Station", lat: -27.4431, lng: 153.0421 },
        { id: "node/s5", name: "Milton Station", lat: -27.4682, lng: 152.9981 },
        { id: "node/s6", name: "South Brisbane Station", lat: -27.4754, lng: 153.0202 }
    ]
};

// Runtime Active Scenario Entities Database Configuration
let activeScenarioData = {
    trains: []
};

/**
 * 1. Initialize Map Canvas Context Layout
 */
function initApplication() {
    console.log("Initializing Canvas Binding Layer...");
    
    // Fallback if google object is missing or unauthenticated API window is showing
    if (typeof google === 'undefined' || !google.maps) {
        document.getElementById('telemetry-log').innerText = "FATAL Error: Google Maps API Module failed to return valid stream. Check Key authentication configurations.";
        return;
    }

    const brisbaneCenter = { lat: -27.4661, lng: 153.0244 };
    
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 13,
        center: brisbaneCenter,
        mapId: "DEMO_MAP_ID", // Enables vector rendering layer structures
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: true,
        scaleControl: true,
        streetViewControl: false,
        fullscreenControl: true
    });

    // Handle Layer Switcher Interactivity
    document.getElementById("layer-tracks").addEventListener("change", toggleORMLayers);
    document.getElementById("layer-stations").addEventListener("change", toggleORMLayers);
    document.getElementById("layer-signals").addEventListener("change", toggleORMLayers);

    // Operational Pipeline Hook Points
    document.getElementById("btn-compile").addEventListener("click", runSimSpecCompiler);
    document.getElementById("btn-play-sim").addEventListener("click", executeSimRunLoop);
    document.getElementById("btn-stop-sim").addEventListener("click", terminateSimRunLoop);

    logTelemetry("Canvas Ready. Target Boundary Set: South East Queensland Rail Network.");
}

/**
 * 2. SimSpec Compiler Layer
 * Translates static ORM geometries into compliant UNISIG signaling infrastructure data components
 */
function runSimSpecCompiler() {
    logTelemetry("Running SimSpec Compiler Profile: UNISIG_BASELINE_3_LEVEL_2...");
    
    // Clear any leftover structures
    clearCanvasLayers();
    signalMarkers = [];

    // Render ORM Geometric Ways as Map Polylines
    ORM_DATASET.tracks.forEach(track => {
        const poly = new google.maps.Polyline({
            path: track.coords,
            geodesic: true,
            strokeColor: "#ff5555",
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map: map
        });
        trackPolylines.push(poly);
    });

    // Render Passenger Station Nodes
    ORM_DATASET.stations.forEach(station => {
        const marker = new google.maps.Marker({
            position: { lat: station.lat, lng: station.lng },
            map: map,
            title: station.name,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: "#5555ff",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
                scale: 7
            }
        });
        
        const infoWindow = new google.maps.InfoWindow({
            content: `<strong>${station.name}</strong><br>ID: ${station.id}<br>Type: Intermodal Passenger Station Asset`
        });
        marker.addListener("click", () => infoWindow.open(map, marker));
        stationMarkers.push(marker);
    });

    // SimSpec Procedural Engine: Automatically calculate and place virtual Eurobalises and dynamic signaling markers
    // Places instruments along tracked track corridors to satisfy safety interlock protocols
    let baliseCount = 0;
    ORM_DATASET.tracks.forEach(track => {
        // Place a safety instrumentation device at midpoints of track corridors
        if (track.coords.length >= 2) {
            for (let i = 0; i < track.coords.length - 1; i++) {
                const latMid = (track.coords[i].lat + track.coords[i+1].lat) / 2;
                const lngMid = (track.coords[i].lng + track.coords[i+1].lng) / 2;
                baliseCount++;

                const signalMarker = new google.maps.Marker({
                    position: { lat: latMid, lng: lngMid },
                    map: map,
                    title: `UNISIG Balise LEU-${baliseCount}`,
                    icon: {
                        path: "M 0,-6 L 6,4 L -6,4 Z", // Triangle shape
                        fillColor: "#00ff00",
                        fillOpacity: 1,
                        strokeColor: "#000000",
                        strokeWeight: 1,
                        scale: 5
                    }
                });
                signalMarkers.push(signalMarker);
            }
        }
    });

    isCompiled = true;
    document.getElementById("btn-play-sim").disabled = false;
    logTelemetry(`SimSpec Compiled successfully. Injected ${baliseCount} virtual Eurobalise control loops dynamically.`);
    toggleORMLayers();
}

/**
 * 3. SimRun Engine Execution Loop
 * Controls the active state processing of active dynamic trains, movement authorities and safety thresholds
 */
function executeSimRunLoop() {
    if (!isCompiled) return;
    
    const selectedScenario = document.getElementById("scenario-selector").value;
    logTelemetry(`Initializing SimRun Loop Context: [${selectedScenario}]`);
    
    isRunning = true;
    document.getElementById("map-container").classList.add("status-active");
    document.getElementById("status-text").innerText = "SimRun Status: ACTIVE SIMULATION PROCESSING";
    document.getElementById("btn-compile").disabled = true;
    document.getElementById("btn-play-sim").style.display = "none";
    document.getElementById("btn-stop-sim").style.display = "block";

    // Setup active vehicle schedules based on target scenario paths
    initializeScenarioVehicles(selectedScenario);

    // Fixed-step loop execution (simulating physics, schedule performance and collision models every 300ms)
    simInterval = setInterval(() => {
        processTelemetryStep();
    }, 300);
}

/**
 * Dynamic State Machine - Steps vehicle positioning along track geometric paths
 */
function initializeScenarioVehicles(scenarioId) {
    // Clear previous vehicle states
    trainMarkers.forEach(m => m.setMap(null));
    trainMarkers = [];

    if (scenarioId === "bne-morning-peak") {
        activeScenarioData.trains = [
            { id: "TRAIN-QR-01", name: "Nambour Service (Inbound)", path: ORM_DATASET.tracks[0].coords, currentIdx: 0, progress: 0.0, speed: 0.04, color: "#ffff00", hasCollisionRisk: false },
            { id: "TRAIN-QR-02", name: "Ipswich Flyer (Outbound)", path: ORM_DATASET.tracks[2].coords, currentIdx: 0, progress: 0.0, speed: 0.03, color: "#00ffff", hasCollisionRisk: false }
        ];
    } else if (scenarioId === "gold-coast-express") {
        activeScenarioData.trains = [
            { id: "TRAIN-GEXP-05", name: "Gold Coast Express", path: ORM_DATASET.tracks[3].coords, currentIdx: 0, progress: 0.0, speed: 0.06, color: "#ff00ff", hasCollisionRisk: false }
        ];
    } else {
        // Ipswich Maintenance Block Event Scenario - Injects an artificial obstruction risk profile to show system delays
        activeScenarioData.trains = [
            { id: "TRAIN-MAINT-01", name: "Work Train Block", path: [ORM_DATASET.tracks[2].coords[1]], currentIdx: 0, progress: 0.0, speed: 0.0, color: "#ffaa00", hasCollisionRisk: false },
            { id: "TRAIN-QR-03", name: "Approaching Passenger Service", path: ORM_DATASET.tracks[2].coords, currentIdx: 0, progress: 0.0, speed: 0.02, color: "#ffff00", hasCollisionRisk: true }
        ];
    }

    // Instantiation onto canvas overlay bounds
    activeScenarioData.trains.forEach(train => {
        const marker = new google.maps.Marker({
            position: train.path[0],
            map: map,
            title: train.name,
            icon: {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 6,
                fillColor: train.color,
                fillOpacity: 1,
                strokeColor: "#000",
                strokeWeight: 2
            }
        });
        trainMarkers.push(marker);
    });
}

function processTelemetryStep() {
    let telemetrySummary = [];
    
    for (let i = 0; i < activeScenarioData.trains.length; i++) {
        let train = activeScenarioData.trains[i];
        let marker = trainMarkers[i];
        
        if (train.path.length <= 1) {
            telemetrySummary.push(`[${train.id}] Static Block Occupancy.`);
            continue;
        }

        // Interpolate vector tracking steps
        train.progress += train.speed;
        if (train.progress >= 1.0) {
            train.progress = 0.0;
            train.currentIdx++;
            if (train.currentIdx >= train.path.length - 1) {
                // Terminus bounce back logic to keep running looping execution active
                train.currentIdx = 0;
            }
        }

        // Calculate active linear interpolation position components
        const startNode = train.path[train.currentIdx];
        const endNode = train.path[train.currentIdx + 1];
        
        const currentLat = startNode.lat + (endNode.lat - startNode.lat) * train.progress;
        const currentLng = startNode.lng + (endNode.lng - startNode.lng) * train.progress;
        const newPos = { lat: currentLat, lng: currentLng };
        
        marker.setPosition(newPos);

        // Standard Safety Interlocking Exception Rules Check
        if (train.hasCollisionRisk && train.currentIdx === 0 && train.progress > 0.6) {
            telemetrySummary.push(`[WARN] ${train.id} - UNISIG ETCS L2 Intervention Curve: Dynamic Braking Enforced due to track occupancy alert.`);
            marker.setIcon({
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 7,
                fillColor: "#ff0000", // Alert Red status shift
                fillOpacity: 1,
                strokeColor: "#fff",
                strokeWeight: 2
            });
        } else {
            telemetrySummary.push(`[OK] ${train.id} Running. Position: ${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}`);
        }
    }

    logTelemetry(telemetrySummary.join("<br>"));
}

/**
 * 4. Control Operations Frameworks
 */
function terminateSimRunLoop() {
    clearInterval(simInterval);
    isRunning = false;
    document.getElementById("map-container").classList.remove("status-active");
    document.getElementById("status-text").innerText = "SimRun Status: Idle";
    document.getElementById("btn-compile").disabled = false;
    document.getElementById("btn-play-sim").style.display = "block";
    document.getElementById("btn-stop-sim").style.display = "none";
    
    // Reset train positions elements
    trainMarkers.forEach(m => m.setMap(null));
    trainMarkers = [];
    
    logTelemetry("SimRun Execution Execution context aborted cleanly.");
}

function toggleORMLayers() {
    const showTracks = document.getElementById("layer-tracks").checked;
    const showStations = document.getElementById("layer-stations").checked;
    const showSignals = document.getElementById("layer-signals").checked;

    trackPolylines.forEach(p => p.setMap(showTracks ? map : null));
    stationMarkers.forEach(m => m.setMap(showStations ? map : null));
    signalMarkers.forEach(m => m.setMap(showSignals ? map : null));
}

function clearCanvasLayers() {
    trackPolylines.forEach(p => p.setMap(null));
    stationMarkers.forEach(m => m.setMap(null));
    signalMarkers.forEach(m => m.setMap(null));
    trainMarkers.forEach(m => m.setMap(null));
    trackPolylines = [];
    stationMarkers = [];
    trainMarkers = [];
}

function logTelemetry(msg) {
    const el = document.getElementById("telemetry-log");
    const timestamp = new Date().toISOString().split('T')[1].slice(0,8);
    el.innerHTML = `[${timestamp}] ${msg}<br>` + el.innerHTML;
}

// Global scope initialization binding hooks
window.initApplication = initApplication;
