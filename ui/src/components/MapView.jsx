import { useState, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Polygon, Rectangle, Marker, InfoWindow } from '@react-google-maps/api';

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

const CATEGORY_COLORS = {
  scout: '#8b5cf6',
  medical: '#ec4899',
  supply: '#f59e0b',
  comms_relay: '#06b6d4',
};

const DRONE_EMOJI = {
  scout: '🔭',
  medical: '🏥',
  supply: '📦',
  comms_relay: '📡',
};

const mapOptions = {
  mapTypeId: 'hybrid',
  disableDefaultUI: false,
  streetViewControl: false,
  fullscreenControl: false,
  mapTypeControl: true,
  styles: [
    { elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0e1a' }] },
  ],
};

const fallbackCenter = { lat: 12.939, lng: 79.149 };

export default function MapView({ boundary, setBoundary, missionData }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_KEY,
  });

  const [selectedDrone, setSelectedDrone] = useState(null);
  const [mapCenter, setMapCenter] = useState(fallbackCenter);
  const mapRef = useRef(null);

  const handleMapClick = useCallback((e) => {
    const lat = e.latLng.lat();
    const lon = e.latLng.lng();
    setBoundary(prev => [...prev, { lat, lon }]);
  }, [setBoundary]);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  if (loadError || !GOOGLE_MAPS_KEY) {
    return <FallbackMap boundary={boundary} setBoundary={setBoundary} missionData={missionData} />;
  }

  if (!isLoaded) {
    return (
      <div className="map-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0e1a' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text-secondary)' }}>
          <span className="spinner" /> Loading map…
        </div>
      </div>
    );
  }

  const polygonPath = boundary.map(p => ({ lat: p.lat, lng: p.lon }));

  // Compute bounding box from mission zones
  const zones = missionData?.zones || [];

  return (
    <div className="map-container">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={mapCenter}
        zoom={14}
        options={mapOptions}
        onClick={handleMapClick}
        onLoad={onMapLoad}
      >
        {/* Boundary polygon */}
        {polygonPath.length >= 3 && (
          <Polygon
            paths={polygonPath}
            options={{
              fillColor: '#2563eb',
              fillOpacity: 0.15,
              strokeColor: '#3b82f6',
              strokeOpacity: 0.9,
              strokeWeight: 2,
            }}
          />
        )}

        {/* Boundary markers */}
        {polygonPath.map((pt, i) => (
          <Marker
            key={`bp-${i}`}
            position={pt}
            label={{ text: `${i + 1}`, color: '#fff', fontWeight: 'bold', fontSize: '11px' }}
            icon={{
              path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
              scale: 8,
              fillColor: '#3b82f6',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
            }}
          />
        ))}

        {/* Zone rectangles */}
        {zones.map(zone => (
          <Rectangle
            key={zone.id}
            bounds={{
              south: zone.sw.lat, west: zone.sw.lon,
              north: zone.ne.lat, east: zone.ne.lon,
            }}
            options={{
              fillColor: zone.cleared ? '#10b981' : '#f59e0b',
              fillOpacity: zone.cleared ? 0.25 : 0.15,
              strokeColor: zone.cleared ? '#10b981' : '#f59e0b',
              strokeOpacity: 0.8,
              strokeWeight: 1.5,
            }}
          />
        ))}

        {/* Drone markers */}
        {(missionData?.drones || []).map(drone => (
          <Marker
            key={drone.id}
            position={{ lat: drone.lat, lng: drone.lon }}
            title={`${drone.id} [${drone.category}]`}
            onClick={() => setSelectedDrone(drone)}
            icon={{
              path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
              scale: drone.is_leader ? 9 : 6,
              fillColor: CATEGORY_COLORS[drone.category] || '#fff',
              fillOpacity: 1,
              strokeColor: drone.is_leader ? '#fff' : '#00000055',
              strokeWeight: drone.is_leader ? 2.5 : 1,
            }}
          />
        ))}

        {selectedDrone && (
          <InfoWindow
            position={{ lat: selectedDrone.lat, lng: selectedDrone.lon }}
            onCloseClick={() => setSelectedDrone(null)}
          >
            <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 140 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {DRONE_EMOJI[selectedDrone.category]} {selectedDrone.category.toUpperCase()}
                {selectedDrone.is_leader && ' 👑'}
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>{selectedDrone.id}</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                <b>Status:</b> {selectedDrone.status}<br />
                <b>Battery:</b> {selectedDrone.battery}%<br />
                <b>Trust:</b> {selectedDrone.trust_score}
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Map overlay hint */}
      {boundary.length === 0 && (
        <div className="map-overlay">
          <div style={{
            background: '#0a0e1acc',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
          }}>
            🖱️ Click map to place boundary points
          </div>
        </div>
      )}
    </div>
  );
}


// ──────────────────────────────────────────────────────────────────────────
// Fallback: Canvas-based map when no Google Maps API key is provided
// ──────────────────────────────────────────────────────────────────────────

function FallbackMap({ boundary, setBoundary, missionData }) {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [selectedDrone, setSelectedDrone] = useState(null);

  // Coordinate system: we use a simple lat/lon → pixel projection
  // based on the bounding box of all known points
  const allPoints = [
    ...boundary,
    ...(missionData?.zones || []).flatMap(z => [z.sw, z.ne]),
    ...(missionData?.drones || []).map(d => ({ lat: d.lat, lon: d.lon })),
  ];

  const padding = 40;

  const getProjection = (w, h) => {
    if (allPoints.length < 2) {
      // Default view: rough India area
      return {
        minLat: 12.9, maxLat: 12.96,
        minLon: 79.13, maxLon: 79.19,
      };
    }
    const minLat = Math.min(...allPoints.map(p => p.lat)) - 0.005;
    const maxLat = Math.max(...allPoints.map(p => p.lat)) + 0.005;
    const minLon = Math.min(...allPoints.map(p => p.lon)) - 0.005;
    const maxLon = Math.max(...allPoints.map(p => p.lon)) + 0.005;
    return { minLat, maxLat, minLon, maxLon };
  };

  const project = (lat, lon, bounds, w, h) => {
    const x = padding + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * (w - 2 * padding);
    const y = padding + ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * (h - 2 * padding);
    return { x, y };
  };

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const w = rect.width; const h = rect.height;
    const bounds = getProjection(w, h);

    const lon = bounds.minLon + ((mx - padding) / (w - 2 * padding)) * (bounds.maxLon - bounds.minLon);
    const lat = bounds.maxLat - ((my - padding) / (h - 2 * padding)) * (bounds.maxLat - bounds.minLat);
    setBoundary(prev => [...prev, { lat, lon }]);
  };

  // Draw on canvas via ref + effect via inline SVG approach is complex;
  // use a simple div-based overlay instead
  const w = 800; const h = 600;
  const bounds = getProjection(w, h);

  const proj = (lat, lon) => project(lat, lon, bounds, w, h);

  const zones = missionData?.zones || [];
  const drones = missionData?.drones || [];

  return (
    <div
      className="map-container"
      style={{ background: '#0d1b2a', cursor: 'crosshair', position: 'relative', overflow: 'hidden' }}
      onClick={handleClick}
    >
      {/* Grid lines */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e2d4a" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill="url(#grid)" />

        {/* Zone rectangles */}
        {zones.map(zone => {
          const sw = proj(zone.sw.lat, zone.sw.lon);
          const ne = proj(zone.ne.lat, zone.ne.lon);
          const color = zone.cleared ? '#10b981' : '#f59e0b';
          return (
            <g key={zone.id}>
              <rect
                x={Math.min(sw.x, ne.x)} y={Math.min(sw.y, ne.y)}
                width={Math.abs(ne.x - sw.x)} height={Math.abs(ne.y - sw.y)}
                fill={color} fillOpacity={zone.cleared ? 0.3 : 0.12}
                stroke={color} strokeOpacity={0.8} strokeWidth={1.5}
              />
              <text
                x={(sw.x + ne.x) / 2} y={(sw.y + ne.y) / 2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={10} fill={color} opacity={0.9}
              >
                {zone.cleared ? '✓' : '●'}
              </text>
            </g>
          );
        })}

        {/* Boundary polygon */}
        {boundary.length >= 2 && (
          <polygon
            points={boundary.map(p => {
              const { x, y } = proj(p.lat, p.lon);
              return `${x},${y}`;
            }).join(' ')}
            fill="#2563eb" fillOpacity={0.18}
            stroke="#3b82f6" strokeOpacity={0.9} strokeWidth={2}
            strokeDasharray={boundary.length < 3 ? '6,4' : 'none'}
          />
        )}

        {/* Boundary points */}
        {boundary.map((p, i) => {
          const { x, y } = proj(p.lat, p.lon);
          return (
            <g key={`bp-${i}`}>
              <circle cx={x} cy={y} r={8} fill="#3b82f6" />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#fff" fontWeight="bold">
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Drone markers */}
        {drones.map(drone => {
          const { x, y } = proj(drone.lat, drone.lon);
          const color = CATEGORY_COLORS[drone.category] || '#fff';
          const r = drone.is_leader ? 9 : 6;
          return (
            <g key={drone.id} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setSelectedDrone(drone); }}>
              {drone.is_leader && <circle cx={x} cy={y} r={r + 4} fill={color} opacity={0.2} />}
              <circle cx={x} cy={y} r={r} fill={color} stroke={drone.is_leader ? '#fff' : 'none'} strokeWidth={drone.is_leader ? 2 : 0} />
            </g>
          );
        })}
      </svg>

      {/* Selected drone tooltip */}
      {selectedDrone && (() => {
        const { x, y } = proj(selectedDrone.lat, selectedDrone.lon);
        const pct = { x: (x / w) * 100, y: (y / h) * 100 };
        return (
          <div
            className="card fade-in"
            style={{
              position: 'absolute',
              left: `calc(${pct.x}% + 12px)`,
              top: `calc(${pct.y}% - 40px)`,
              minWidth: 160, zIndex: 10, pointerEvents: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                {DRONE_EMOJI[selectedDrone.category]} {selectedDrone.category}
                {selectedDrone.is_leader && ' 👑'}
              </span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setSelectedDrone(null)}>✕</button>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{selectedDrone.id}</div>
            <div style={{ fontSize: '0.78rem', marginTop: 6 }}>
              <div className="stat-row"><span className="label">Status</span><span className="value">{selectedDrone.status}</span></div>
              <div className="stat-row"><span className="label">Battery</span><span className="value">{selectedDrone.battery}%</span></div>
              <div className="stat-row"><span className="label">Trust</span><span className="value">{selectedDrone.trust_score}</span></div>
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        background: '#0a0e1acc', backdropFilter: 'blur(8px)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '8px 12px', fontSize: '0.7rem', pointerEvents: 'none',
      }}>
        {Object.entries(DRONE_EMOJI).map(([cat, em]) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[cat], display: 'inline-block' }} />
            {em} {cat}
          </div>
        ))}
        <div style={{ marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
          <span style={{ color: '#10b981' }}>■</span> Cleared &nbsp;
          <span style={{ color: '#f59e0b' }}>■</span> Active
        </div>
      </div>

      {/* Hint overlay */}
      {boundary.length === 0 && (
        <div className="map-overlay">
          <div style={{
            background: '#0a0e1acc', backdropFilter: 'blur(8px)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-secondary)',
          }}>
            🖱️ Click to place boundary points
            <div style={{ fontSize: '0.7rem', marginTop: 4, color: 'var(--text-muted)' }}>
              Add Google Maps API key in .env for satellite view
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
