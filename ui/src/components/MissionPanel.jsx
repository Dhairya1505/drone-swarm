import { Shield, Activity, Layers, Cpu } from 'lucide-react';

const CATEGORY_COLOR = {
  scout: 'var(--scout)',
  medical: 'var(--medical)',
  supply: 'var(--supply)',
  comms_relay: 'var(--comms)',
};

const STATUS_COLOR = {
  idle: 'var(--text-muted)',
  en_route: 'var(--warning)',
  executing: 'var(--accent-light)',
  returned: 'var(--success)',
  compromised: 'var(--danger)',
  offline: 'var(--danger)',
  reserve: 'var(--text-muted)',
};

export default function MissionPanel({ missionData }) {
  if (!missionData) {
    return (
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
        Launch a mission to see live data here.
      </div>
    );
  }

  const { zones = [], squads = [], drones = [], event_log = [], tick, max_ticks } = missionData;
  const cleared = zones.filter(z => z.cleared).length;
  const totalDrones = drones.length;
  const activeDrones = drones.filter(d => !['offline', 'compromised', 'reserve'].includes(d.status)).length;
  const avgBattery = totalDrones > 0
    ? (drones.reduce((s, d) => s + d.battery, 0) / totalDrones).toFixed(1)
    : 0;

  return (
    <>
      {/* Stats */}
      <div className="panel-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Activity size={14} color="var(--accent-light)" />
          <span className="panel-title" style={{ margin: 0 }}>Mission Status</span>
          <span style={{
            marginLeft: 'auto', fontFamily: 'JetBrains Mono', fontSize: '0.72rem',
            color: 'var(--accent-light)',
          }}>
            Tick {tick}/{max_ticks}
          </span>
        </div>

        {/* Tick progress bar */}
        <div style={{ marginBottom: 12 }}>
          <div className="battery-bar">
            <div
              className="battery-bar-fill"
              style={{
                width: `${max_ticks > 0 ? (tick / max_ticks) * 100 : 0}%`,
                background: 'var(--accent)',
              }}
            />
          </div>
        </div>

        <div className="stat-row"><span className="label">Zones Cleared</span><span className="value" style={{ color: cleared === zones.length && zones.length > 0 ? 'var(--success)' : 'var(--text-primary)' }}>{cleared}/{zones.length}</span></div>
        <div className="stat-row"><span className="label">Active Drones</span><span className="value">{activeDrones}/{totalDrones}</span></div>
        <div className="stat-row"><span className="label">Avg Battery</span><span className="value" style={{ color: avgBattery < 30 ? 'var(--danger)' : avgBattery < 60 ? 'var(--warning)' : 'var(--success)' }}>{avgBattery}%</span></div>
        <div className="stat-row"><span className="label">Squads</span><span className="value">{squads.length}</span></div>
      </div>

      {/* Zones */}
      <div className="panel-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Layers size={14} color="var(--accent-light)" />
          <span className="panel-title" style={{ margin: 0 }}>Zones</span>
        </div>
        {zones.map(zone => (
          <div key={zone.id} className="zone-item">
            <div className={`zone-dot ${zone.cleared ? 'cleared' : 'uncleared'}`} />
            <span style={{ flex: 1, fontSize: '0.77rem', fontFamily: 'JetBrains Mono' }}>
              {zone.id.split('_').pop()}
            </span>
            <span style={{ fontSize: '0.7rem', color: zone.cleared ? 'var(--success)' : 'var(--warning)' }}>
              {zone.cleared ? 'Cleared' : 'Active'}
            </span>
          </div>
        ))}
      </div>

      {/* Drones */}
      <div className="panel-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Cpu size={14} color="var(--accent-light)" />
          <span className="panel-title" style={{ margin: 0 }}>Drones</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {drones.map(drone => (
            <div key={drone.id} className="card" style={{ padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span
                  style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: CATEGORY_COLOR[drone.category] || '#fff',
                    boxShadow: drone.is_leader ? `0 0 6px ${CATEGORY_COLOR[drone.category]}` : 'none',
                  }}
                />
                <span style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono', flex: 1, color: 'var(--text-secondary)' }}>
                  {drone.id.split('_').pop()}
                </span>
                {drone.is_leader && (
                  <span style={{ fontSize: '0.62rem', color: 'var(--warning)', fontWeight: 700 }}>LEAD</span>
                )}
                <span className={`drone-badge ${drone.category}`}>
                  {drone.category.replace('_', ' ')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                <span style={{ color: STATUS_COLOR[drone.status] || 'var(--text-muted)' }}>
                  {drone.status}
                </span>
                <span>trust: {drone.trust_score}</span>
              </div>
              <div className="battery-bar">
                <div
                  className="battery-bar-fill"
                  style={{
                    width: `${drone.battery}%`,
                    background: drone.battery < 20 ? 'var(--danger)' : drone.battery < 50 ? 'var(--warning)' : 'var(--success)',
                  }}
                />
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {drone.battery}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Event Log */}
      <div className="panel-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Shield size={14} color="var(--accent-light)" />
          <span className="panel-title" style={{ margin: 0 }}>Event Log</span>
        </div>
        <div className="event-log">
          {event_log.slice().reverse().map((line, i) => (
            <div
              key={i}
              className={`log-line ${line.toLowerCase().includes('warn') ? 'warn' : line.toLowerCase().includes('cleared') ? 'ok' : ''}`}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
