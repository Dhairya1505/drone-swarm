import { useState } from 'react';
import {
  MapPin, Trash2, Play, Settings, ChevronDown, ChevronUp
} from 'lucide-react';

const DISASTER_TYPES = ['flood', 'earthquake', 'wildfire', 'hurricane', 'tsunami', 'landslide'];

export default function ControlPanel({ boundary, onClearBoundary, onLaunch, missionStatus }) {
  const [numSquads, setNumSquads] = useState(3);
  const [maxTicks, setMaxTicks] = useState(5);
  const [disasterType, setDisasterType] = useState('flood');
  const [reserves, setReserves] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canLaunch = boundary.length >= 2 && missionStatus !== 'running';

  const handleLaunch = () => {
    onLaunch({ boundary, numSquads, maxTicks, disasterType, reservesPerSquad: reserves });
  };

  return (
    <div className="panel" style={{ gap: 0 }}>
      {/* Header */}
      <div className="panel-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Settings size={14} color="var(--accent-light)" />
          <span className="panel-title" style={{ margin: 0 }}>Mission Configuration</span>
        </div>

        <div className="field">
          <label>Disaster Type</label>
          <select value={disasterType} onChange={e => setDisasterType(e.target.value)}>
            {DISASTER_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Number of Squads</label>
          <input
            type="number" min={1} max={20} value={numSquads}
            onChange={e => setNumSquads(Number(e.target.value))}
          />
        </div>

        <button
          className="btn btn-ghost"
          style={{ width: '100%', marginBottom: 8, fontSize: '0.75rem' }}
          onClick={() => setShowAdvanced(v => !v)}
        >
          Advanced {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showAdvanced && (
          <div className="fade-in">
            <div className="field">
              <label>Max Ticks</label>
              <input
                type="number" min={1} max={50} value={maxTicks}
                onChange={e => setMaxTicks(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Reserves per Squad</label>
              <input
                type="number" min={0} max={5} value={reserves}
                onChange={e => setReserves(Number(e.target.value))}
              />
            </div>
          </div>
        )}
      </div>

      {/* Boundary */}
      <div className="panel-section">
        <div className="panel-title">Boundary Points</div>
        <div className="instruction-box" style={{ marginBottom: 10 }}>
          📍 Click on the map to place boundary points. At least 2 points define the search area.
        </div>

        {boundary.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', padding: '16px 0' }}>
            No points placed yet
          </div>
        ) : (
          <>
            {boundary.map((pt, i) => (
              <div key={i} className="coord-tag">
                <MapPin size={10} />
                <span>Pt {i + 1}</span>
                <span>{pt.lat.toFixed(5)}, {pt.lon.toFixed(5)}</span>
              </div>
            ))}
            <button
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: 6, fontSize: '0.78rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={onClearBoundary}
            >
              <Trash2 size={13} /> Clear Boundary
            </button>
          </>
        )}
      </div>

      {/* Launch */}
      <div className="panel-section" style={{ marginTop: 'auto' }}>
        <button className="btn btn-primary" onClick={handleLaunch} disabled={!canLaunch}>
          {missionStatus === 'running'
            ? <><span className="spinner" /> Running…</>
            : <><Play size={15} /> Launch Mission</>
          }
        </button>
        {boundary.length < 2 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textAlign: 'center', marginTop: 8 }}>
            Place at least 2 boundary points on the map
          </div>
        )}
      </div>
    </div>
  );
}
