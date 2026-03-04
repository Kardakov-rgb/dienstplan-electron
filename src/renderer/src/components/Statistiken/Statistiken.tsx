import React, { useCallback, useEffect, useState } from 'react'
import { StatistikDaten, FairnessScore } from '../../../../shared/types'
import { getApi } from '../../api'

function getMonatVor(monate: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - monate)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getCurrentMonat(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export default function Statistiken(): React.ReactElement {
  const [von, setVon] = useState(getMonatVor(6))
  const [bis, setBis] = useState(getCurrentMonat())
  const [daten, setDaten] = useState<StatistikDaten | null>(null)
  const [fairness, setFairness] = useState<FairnessScore[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    try {
      const [d, f] = await Promise.all([
        getApi().statistikenGesamt(von, bis),
        getApi().statistikenFairness()
      ])
      setDaten(d)
      setFairness(f)
    } catch (e: unknown) {
      setMsg(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [von, bis])

  useEffect(() => {
    load()
  }, [load])

  const exportExcel = async (): Promise<void> => {
    const path = await getApi().dialogSaveExcel()
    if (!path) return
    try {
      await getApi().excelExportStatistiken(von, bis, path)
      setMsg('Export erfolgreich.')
    } catch (e: unknown) {
      setMsg(`Export-Fehler: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="statistiken-layout">
      {/* SIDEBAR */}
      <div className="statistiken-sidebar">
        <div>
          <div className="sidebar-section-title">Zeitraum</div>
          <div className="form-group">
            <label className="form-label">Von</label>
            <input type="month" className="form-control" value={von} onChange={(e) => setVon(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Bis</label>
            <input type="month" className="form-control" value={bis} onChange={(e) => setBis(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary btn-sm w-full" onClick={load} disabled={loading}>
              {loading ? '⏳' : '🔄'} Aktualisieren
            </button>
            <button className="btn btn-outline btn-sm" onClick={exportExcel}>
              📥
            </button>
          </div>
        </div>

        {msg && (
          <div className="alert alert-info" style={{ fontSize: '12px' }}>{msg}</div>
        )}

        {/* Fairness-Scores */}
        {fairness.length > 0 && (
          <div>
            <div className="sidebar-section-title">Fairness-Scores</div>
            <div className="fairness-person-list">
              {fairness.map((f) => (
                <div key={f.person_id} className="fairness-person-item">
                  <div className="fairness-person-name">
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{f.person_name}</span>
                    <span style={{ fontSize: '12px', color: f.score >= 0.7 ? 'var(--color-success)' : 'var(--color-accent)' }}>
                      {pct(f.score)}
                    </span>
                  </div>
                  <div className="fairness-bar-bg">
                    <div
                      className={`fairness-bar-fill ${f.score >= 0.7 ? 'good' : 'bad'}`}
                      style={{ width: pct(f.score) }}
                    />
                  </div>
                  <div className="fairness-person-sub">
                    {f.erfuellte_wuensche}/{f.gesamt_wuensche} Wünsche ({f.monate} Monat{f.monate !== 1 ? 'e' : ''})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {fairness.length === 0 && !loading && (
          <div style={{ fontSize: '12px', color: 'var(--text-light)', textAlign: 'center' }}>
            Noch keine Fairness-Daten vorhanden
          </div>
        )}
      </div>

      {/* INHALT */}
      <div className="statistiken-content">
        {loading ? (
          <div className="loading-spinner">
            <div className="spinner" />
            Lädt Statistiken…
          </div>
        ) : !daten ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div>Keine Daten verfügbar</div>
          </div>
        ) : (
          <>
            {/* Übersichtskarten */}
            <div className="stat-cards-row">
              <div className="stat-mini-card">
                <div className="stat-mini-value">{daten.gesamt}</div>
                <div className="stat-mini-label">Dienste gesamt</div>
              </div>
              <div className="stat-mini-card">
                <div className="stat-mini-value" style={{ color: 'var(--color-success)' }}>
                  {daten.zugewiesen}
                </div>
                <div className="stat-mini-label">Zugewiesen</div>
              </div>
              <div className="stat-mini-card">
                <div className="stat-mini-value" style={{ color: daten.offen > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {daten.offen}
                </div>
                <div className="stat-mini-label">Offen</div>
              </div>
              <div className="stat-mini-card">
                <div className="stat-mini-value">{pct(daten.zuweisungsgrad)}</div>
                <div className="stat-mini-label">Zuweisungsgrad</div>
              </div>
              <div className="stat-mini-card">
                <div className="stat-mini-value">{pct(daten.wunscherfuellung)}</div>
                <div className="stat-mini-label">Wunscherfüllung</div>
              </div>
              <div className="stat-mini-card">
                <div className="stat-mini-value" style={{ color: daten.konflikte > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {daten.konflikte}
                </div>
                <div className="stat-mini-label">Konflikte</div>
              </div>
            </div>

            {/* Dienst-Verteilung */}
            {daten.verteilung.length > 0 && (
              <div className="card">
                <div className="card-header">Dienst-Verteilung pro Person</div>
                <div className="table-container" style={{ maxHeight: '350px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th style={{ textAlign: 'center' }}>Soll</th>
                        <th style={{ textAlign: 'center' }}>Ist</th>
                        <th style={{ textAlign: 'center' }}>24h</th>
                        <th style={{ textAlign: 'center' }}>Visten</th>
                        <th style={{ textAlign: 'center' }}>DaVinci</th>
                        <th>Erfüllung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daten.verteilung.map((v) => (
                        <tr key={v.person_id}>
                          <td style={{ fontWeight: 500 }}>{v.person_name}</td>
                          <td style={{ textAlign: 'center' }}>{v.soll === v.ist && v.soll === 0 ? '∞' : v.soll}</td>
                          <td style={{ textAlign: 'center' }}>{v.ist}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ background: 'var(--dienst-24h)', padding: '1px 6px', borderRadius: '3px', fontSize: '12px' }}>
                              {v.dienste_24h}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ background: 'var(--dienst-visten)', padding: '1px 6px', borderRadius: '3px', fontSize: '12px' }}>
                              {v.visten}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ background: 'var(--dienst-davinci)', padding: '1px 6px', borderRadius: '3px', fontSize: '12px' }}>
                              {v.davinci}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                width: '80px', height: '6px',
                                background: '#e0e0e0', borderRadius: '3px', overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: pct(v.erfuellung),
                                  height: '100%',
                                  background: v.erfuellung >= 1 ? 'var(--color-success)' : v.erfuellung >= 0.7 ? '#fb8c00' : 'var(--color-danger)',
                                  borderRadius: '3px'
                                }} />
                              </div>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{pct(v.erfuellung)}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Offene Dienste */}
            {daten.offeneDienste.length > 0 && (
              <div className="card">
                <div className="card-header" style={{ background: 'var(--color-danger)' }}>
                  ⚠️ Offene Dienste ({daten.offeneDienste.length})
                </div>
                <div className="table-container" style={{ maxHeight: '200px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Dienstart</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daten.offeneDienste.map((d) => (
                        <tr key={d.id}>
                          <td>{d.datum}</td>
                          <td>
                            <span style={{
                              background: d.art === 'DIENST_24H' ? 'var(--dienst-24h)' :
                                d.art === 'VISTEN' ? 'var(--dienst-visten)' : 'var(--dienst-davinci)',
                              padding: '2px 8px', borderRadius: '3px', fontSize: '12px'
                            }}>
                              {d.art === 'DIENST_24H' ? 'Vordergrund (24h)' : d.art === 'VISTEN' ? 'Visitendienst' : 'DaVinci'}
                            </span>
                          </td>
                          <td><span className="badge badge-entwurf">{d.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Konflikte */}
            {daten.konflikteList.length > 0 && (
              <div className="card">
                <div className="card-header" style={{ background: 'var(--color-warning)' }}>
                  ⚡ Konflikte ({daten.konflikteList.length})
                </div>
                <div className="table-container" style={{ maxHeight: '200px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Person</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daten.konflikteList.map((k, i) => (
                        <tr key={i}>
                          <td>{k.datum}</td>
                          <td style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{k.person_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {daten.gesamt === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <div>Keine Dienstpläne im gewählten Zeitraum</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
