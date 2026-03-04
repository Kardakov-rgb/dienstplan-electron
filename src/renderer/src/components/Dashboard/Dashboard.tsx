import React, { useEffect, useState } from 'react'

interface DashboardProps {
  onNavigate: (tab: string) => void
}

export default function Dashboard({ onNavigate }: DashboardProps): React.ReactElement {
  const [personCount, setPersonCount] = useState(0)
  const [dienstplanCount, setDienstplanCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const heute = new Date()
  const monatJahr = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [personen, dienstplaene] = await Promise.all([
          window.api.personsGetAll(),
          window.api.dienstplaeneGetAll()
        ])
        setPersonCount(personen.length)
        setDienstplanCount(dienstplaene.length)
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const monatName = heute.toLocaleString('de-DE', { month: 'long', year: 'numeric' })

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Willkommen im Dienstplan-Manager</h1>

      {loading ? (
        <div className="loading-spinner">
          <div className="spinner" />
          Lädt…
        </div>
      ) : (
        <>
          <div className="dashboard-cards">
            <div
              className="stat-card clickable"
              onClick={() => onNavigate('personen')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onNavigate('personen')}
            >
              <div className="stat-card-icon">👥</div>
              <div className="stat-card-value">{personCount}</div>
              <div className="stat-card-label">Personen im System</div>
            </div>

            <div
              className="stat-card clickable"
              onClick={() => onNavigate('dienstplan')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onNavigate('dienstplan')}
            >
              <div className="stat-card-icon">📅</div>
              <div className="stat-card-value">{dienstplanCount}</div>
              <div className="stat-card-label">Dienstpläne gesamt</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon">📆</div>
              <div className="stat-card-value" style={{ fontSize: '20px' }}>
                {monatName}
              </div>
              <div className="stat-card-label">Aktueller Monat</div>
            </div>

            <div
              className="stat-card clickable"
              onClick={() => onNavigate('statistiken')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onNavigate('statistiken')}
            >
              <div className="stat-card-icon">📊</div>
              <div className="stat-card-value">–</div>
              <div className="stat-card-label">Statistiken anzeigen</div>
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title">Schnellstart</h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-lg" onClick={() => onNavigate('personen')}>
                👥 Personen verwalten
              </button>
              <button className="btn btn-accent btn-lg" onClick={() => onNavigate('dienstplan')}>
                📅 Dienstplan erstellen
              </button>
              <button className="btn btn-outline btn-lg" onClick={() => onNavigate('statistiken')}>
                📊 Statistiken ansehen
              </button>
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title">Dienstart-Legende</h2>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="legende-item">
                <div className="legende-dot" style={{ background: '#d4e6f1', border: '1px solid #85c1e9' }} />
                Vordergrund (24h) – täglich, Mo–So
              </div>
              <div className="legende-item">
                <div className="legende-dot" style={{ background: '#fde9d9', border: '1px solid #f0b27a' }} />
                Visitendienst – Sa + So
              </div>
              <div className="legende-item">
                <div className="legende-dot" style={{ background: '#e8f5e9', border: '1px solid #a9dfb0' }} />
                DaVinci – nur Freitag
              </div>
              <div className="legende-item">
                <div className="legende-dot" style={{ background: '#fce4ec', border: '1px solid #f48fb1' }} />
                Offen / nicht besetzt
              </div>
              <div className="legende-item">
                <div className="legende-dot" style={{ background: '#f3e5f5', border: '1px solid #ce93d8' }} />
                Urlaub
              </div>
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title">Wichtige Regeln</h2>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <li>Urlaub ist ein <strong>harter Constraint</strong> – Person wird nie an Urlaubstagen eingeteilt.</li>
              <li>Nach jedem Dienst gilt ein <strong>Ruhetag</strong> (Ausnahme: Visten-Wochenend-Paket Sa→So).</li>
              <li>Jede Person kann max. <strong>1 DaVinci-Dienst</strong> pro Monat erhalten.</li>
              <li>Der <strong>Fairness-Algorithmus</strong> berücksichtigt historische Wunscherfüllungsquoten.</li>
              <li>Wünsche können als <strong>Freiwunsch</strong> (nicht arbeiten) oder <strong>Dienstwunsch</strong> (24h-Dienst) angegeben werden.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
