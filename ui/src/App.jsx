import { useState, useEffect, useCallback } from 'react';
import './index.css';
import ControlPanel from './components/ControlPanel';
import MapView from './components/MapView';
import MissionPanel from './components/MissionPanel';
import ChatPanel from './components/ChatPanel';
import { startMission, getMission } from './api';
import { Radio } from 'lucide-react';

const POLL_INTERVAL = 2000; // ms

export default function App() {
  const [boundary, setBoundary] = useState([]);
  const [missionId, setMissionId] = useState(null);
  const [missionData, setMissionData] = useState(null);
  const [missionStatus, setMissionStatus] = useState('idle'); // idle | running | done | error
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState('mission'); // mission | chat

  // Poll mission state while running
  useEffect(() => {
    if (!missionId || missionStatus === 'done') return;
    const poll = setInterval(async () => {
      try {
        const data = await getMission(missionId);
        setMissionData(data);
        if (data.status === 'done' || data.status.startsWith('error')) {
          setMissionStatus(data.status);
          clearInterval(poll);
        }
      } catch (e) {
        console.error('Poll error:', e);
      }
    }, POLL_INTERVAL);
    return () => clearInterval(poll);
  }, [missionId, missionStatus]);

  const handleLaunch = useCallback(async ({ boundary, numSquads, maxTicks, disasterType, reservesPerSquad }) => {
    setError(null);
    setMissionData(null);
    setMissionStatus('running');
    try {
      const { mission_id } = await startMission({
        boundary,
        num_squads: numSquads,
        max_ticks: maxTicks,
        disaster_type: disasterType,
        reserves_per_squad: reservesPerSquad,
      });
      setMissionId(mission_id);
    } catch (e) {
      setError(e.message);
      setMissionStatus('idle');
    }
  }, []);

  const handleClearBoundary = () => setBoundary([]);

  const statusLabel = missionStatus === 'idle' ? 'idle'
    : missionStatus === 'running' ? 'running'
    : missionStatus === 'done' ? 'done'
    : 'error';

  return (
    <div className="app-shell">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="dot" />
          DroneSwarm Command
        </div>
        <div style={{ marginLeft: 24, display: 'flex', gap: 4 }}>
          <button
            className={`btn btn-ghost ${activeView === 'mission' ? 'btn-primary' : ''}`}
            style={{ padding: '4px 12px', fontSize: '0.78rem' }}
            onClick={() => setActiveView('mission')}
          >
            Mission
          </button>
          <button
            className={`btn btn-ghost ${activeView === 'chat' ? 'btn-primary' : ''}`}
            style={{ padding: '4px 12px', fontSize: '0.78rem' }}
            onClick={() => setActiveView('chat')}
          >
            AI Chat
          </button>
        </div>
        <div className="topbar-spacer" />
        {missionId && (
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {missionId}
          </span>
        )}
        <div className={`status-badge ${statusLabel}`}>
          <Radio size={12} />
          {statusLabel.toUpperCase()}
        </div>
      </header>

      {/* Left panel */}
      <ControlPanel
        boundary={boundary}
        onClearBoundary={handleClearBoundary}
        onLaunch={handleLaunch}
        missionStatus={missionStatus}
      />

      {/* Center map */}
      <MapView
        boundary={boundary}
        setBoundary={setBoundary}
        missionData={missionData}
      />

      {/* Right panel */}
      {activeView === 'mission' ? (
        <div className="panel right" style={{ overflowY: 'auto' }}>
          {error && (
            <div style={{
              margin: 12, padding: '10px 14px', borderRadius: 'var(--radius)',
              background: '#ef444418', border: '1px solid #ef444466', color: 'var(--danger)',
              fontSize: '0.8rem',
            }}>
              ⚠️ {error}
            </div>
          )}
          <MissionPanel missionData={missionData} />
        </div>
      ) : (
        <ChatPanel missionId={missionId} />
      )}
    </div>
  );
}
