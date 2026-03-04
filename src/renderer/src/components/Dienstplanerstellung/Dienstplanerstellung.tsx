import React, { useCallback, useEffect, useState } from 'react'
import {
  Person,
  Dienstplan,
  Dienst,
  MonatsWunsch,
  DienstArt,
  DienstStatus,
  DienstplanStatus,
  WunschTyp
} from '../../../../shared/types'
import { getApi } from '../../api'

const WOCHENTAGE_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

function getWochentag(datum: string): string {
  return WOCHENTAGE_SHORT[new Date(datum + 'T00:00:00').getDay()]
}

function isWeekend(datum: string): boolean {
  const d = new Date(datum + 'T00:00:00').getDay()
  return d === 0 || d === 6
}

function isSamstag(datum: string): boolean {
  return new Date(datum + 'T00:00:00').getDay() === 6
}

function isSonntag(datum: string): boolean {
  return new Date(datum + 'T00:00:00').getDay() === 0
}

function isFreitag(datum: string): boolean {
  return new Date(datum + 'T00:00:00').getDay() === 5
}

function getTageMonate(monatJahr: string): string[] {
  const [y, m] = monatJahr.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const tage: string[] = []
  for (let d = 1; d <= days; d++) {
    tage.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return tage
}

function statusBadgeClass(status: DienstplanStatus): string {
  const map: Record<string, string> = {
    ENTWURF: 'badge-entwurf',
    GEPRUEFT: 'badge-geprueft',
    VEROEFFENTLICHT: 'badge-veroeffentlicht',
    ARCHIVIERT: 'badge-archiviert',
    STORNIERT: 'badge-storniert'
  }
  return `badge ${map[status] ?? 'badge-entwurf'}`
}

function dienstCellClass(dienst: Dienst | undefined): string {
  if (!dienst) return 'dienst-cell-empty'
  if (!dienst.person_id) return 'dienst-cell dienst-cell-offen'
  if (dienst.art === DienstArt.DIENST_24H) return 'dienst-cell dienst-cell-24h'
  if (dienst.art === DienstArt.VISTEN) return 'dienst-cell dienst-cell-visten'
  if (dienst.art === DienstArt.DAVINCI) return 'dienst-cell dienst-cell-davinci'
  return 'dienst-cell'
}

function statusDotClass(status: DienstStatus): string {
  const map: Record<string, string> = {
    GEPLANT: 'dot-geplant',
    BESTAETIGT: 'dot-bestaetigt',
    ABGESAGT: 'dot-abgesagt',
    ERSETZT: 'dot-ersetzt',
    ABGESCHLOSSEN: 'dot-abgeschlossen'
  }
  return `dienst-status-dot ${map[status] ?? 'dot-geplant'}`
}

// ===================== EDIT MODAL =====================
interface EditModalProps {
  dienst: Dienst
  personen: Person[]
  onClose: () => void
  onSave: (updated: Dienst) => void
}

function EditModal({ dienst, personen, onClose, onSave }: EditModalProps): React.ReactElement {
  const [personId, setPersonId] = useState<number | null>(dienst.person_id)
  const [status, setStatus] = useState<DienstStatus>(dienst.status)
  const [bemerkung, setBemerkung] = useState(dienst.bemerkung ?? '')

  const artLabel =
    dienst.art === DienstArt.DIENST_24H
      ? 'Vordergrund (24h)'
      : dienst.art === DienstArt.VISTEN
        ? 'Visitendienst'
        : 'DaVinci'

  const handleSave = (): void => {
    const person = personen.find((p) => p.id === personId) ?? null
    onSave({
      ...dienst,
      person_id: personId,
      person_name: person?.name ?? null,
      status,
      bemerkung
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>
            {artLabel} – {dienst.datum} ({getWochentag(dienst.datum)})
          </span>
          <button className="modal-close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Person zuweisen</label>
            <select
              className="form-control"
              value={personId ?? ''}
              onChange={(e) =>
                setPersonId(e.target.value === '' ? null : parseInt(e.target.value, 10))
              }
            >
              <option value="">– offen –</option>
              {personen.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              className="form-control"
              value={status}
              onChange={(e) => setStatus(e.target.value as DienstStatus)}
            >
              {Object.values(DienstStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Bemerkung</label>
            <textarea
              className="form-control"
              rows={3}
              value={bemerkung}
              onChange={(e) => setBemerkung(e.target.value)}
              placeholder="Optionale Bemerkung…"
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  )
}

// ===================== WUNSCH MODAL =====================
interface WunschModalProps {
  personen: Person[]
  monatJahr: string
  onClose: () => void
  onSave: (wunsch: Omit<MonatsWunsch, 'id' | 'erfuellt'>) => void
}

function WunschModal({ personen, monatJahr, onClose, onSave }: WunschModalProps): React.ReactElement {
  const [personId, setPersonId] = useState<number | null>(personen[0]?.id ?? null)
  const [datum, setDatum] = useState('')
  const [typ, setTyp] = useState<WunschTyp>(WunschTyp.URLAUB)
  const [error, setError] = useState('')

  const save = (): void => {
    if (!personId) { setError('Person wählen'); return }
    if (!datum) { setError('Datum wählen'); return }
    const person = personen.find((p) => p.id === personId)!
    const [y, m] = datum.split('-')
    onSave({
      person_id: personId,
      person_name: person.name,
      datum,
      monat_jahr: `${y}-${m}`,
      typ
    })
  }

  const [monatMin, monatMax] = (() => {
    const [y, m] = monatJahr.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    return [
      `${monatJahr}-01`,
      `${monatJahr}-${String(last).padStart(2, '0')}`
    ]
  })()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Wunsch hinzufügen</span>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-group">
            <label className="form-label">Person</label>
            <select
              className="form-control"
              value={personId ?? ''}
              onChange={(e) => setPersonId(parseInt(e.target.value, 10))}
            >
              {personen.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Datum</label>
            <input
              type="date"
              className="form-control"
              value={datum}
              min={monatMin}
              max={monatMax}
              onChange={(e) => setDatum(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Typ</label>
            <select
              className="form-control"
              value={typ}
              onChange={(e) => setTyp(e.target.value as WunschTyp)}
            >
              <option value={WunschTyp.URLAUB}>Urlaub (harter Constraint)</option>
              <option value={WunschTyp.FREIWUNSCH}>Freiwunsch (möchte nicht arbeiten)</option>
              <option value={WunschTyp.DIENSTWUNSCH}>Dienstwunsch (möchte 24h-Dienst)</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={save}>Hinzufügen</button>
        </div>
      </div>
    </div>
  )
}

// ===================== HAUPTKOMPONENTE =====================
export default function Dienstplanerstellung(): React.ReactElement {
  const heute = new Date()
  const defaultMonat = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}`

  const [monatJahr, setMonatJahr] = useState(defaultMonat)
  const [personen, setPersonen] = useState<Person[]>([])
  const [dienstplaene, setDienstplaene] = useState<Dienstplan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<Dienstplan | null>(null)
  const [dienste, setDienste] = useState<Dienst[]>([])
  const [wuensche, setWuensche] = useState<MonatsWunsch[]>([])
  const [editingDienst, setEditingDienst] = useState<Dienst | null>(null)
  const [showWunschModal, setShowWunschModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [warnungen, setWarnungen] = useState<string[]>([])
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)
  const [hasUnsaved, setHasUnsaved] = useState(false)

  const loadData = useCallback(async () => {
    const [p, dp, w] = await Promise.all([
      getApi().personsGetAll(),
      getApi().dienstplaeneForMonat(monatJahr),
      getApi().wuenscheForMonat(monatJahr)
    ])
    setPersonen(p)
    setDienstplaene(dp)
    setWuensche(w)

    if (dp.length > 0 && !selectedPlan) {
      await selectPlan(dp[0])
    } else if (dp.length === 0) {
      setSelectedPlan(null)
      setDienste([])
    }
  }, [monatJahr])

  const selectPlan = async (plan: Dienstplan): Promise<void> => {
    setSelectedPlan(plan)
    const d = await getApi().dienstplaeneGetDienste(plan.id)
    setDienste(d)
    setHasUnsaved(false)
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  const generate = async (): Promise<void> => {
    if (personen.length === 0) {
      setMsg({ type: 'warning', text: 'Keine Personen vorhanden. Bitte zuerst Personen anlegen.' })
      return
    }
    setGenerating(true)
    setProgress(0)
    setWarnungen([])
    setMsg(null)

    const cleanup = getApi().onGenerateProgress((p) => setProgress(p))

    try {
      const monatName = new Date(monatJahr + '-01').toLocaleString('de-DE', {
        month: 'long',
        year: 'numeric'
      })
      const result = await getApi().dienstplaeneGenerate(monatJahr, `Dienstplan ${monatName}`)
      setWarnungen(result.warnungen)
      await loadData()
      setMsg({
        type: 'success',
        text: `Dienstplan erfolgreich generiert! ${result.warnungen.length > 0 ? `(${result.warnungen.length} Warnungen)` : ''}`
      })
    } catch (e: unknown) {
      setMsg({ type: 'danger', text: `Fehler: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setGenerating(false)
      cleanup()
    }
  }

  const saveDienstplan = async (): Promise<void> => {
    if (!selectedPlan) return
    try {
      await getApi().dienstplaeneSave(selectedPlan, dienste)
      setHasUnsaved(false)
      setMsg({ type: 'success', text: 'Dienstplan gespeichert.' })
    } catch (e: unknown) {
      setMsg({ type: 'danger', text: `Fehler: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const deleteDienstplan = async (): Promise<void> => {
    if (!selectedPlan) return
    if (!confirm(`Dienstplan "${selectedPlan.name}" wirklich löschen?`)) return
    try {
      await getApi().dienstplaeneDelete(selectedPlan.id)
      setSelectedPlan(null)
      setDienste([])
      await loadData()
      setMsg({ type: 'success', text: 'Dienstplan gelöscht.' })
    } catch (e: unknown) {
      setMsg({ type: 'danger', text: `Fehler: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const exportExcel = async (): Promise<void> => {
    if (!selectedPlan) return
    const path = await getApi().dialogSaveExcel()
    if (!path) return
    try {
      await getApi().excelExportDienstplan(selectedPlan.id, path)
      setMsg({ type: 'success', text: 'Excel-Export erfolgreich.' })
    } catch (e: unknown) {
      setMsg({ type: 'danger', text: `Export-Fehler: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const updateDienst = (updated: Dienst): void => {
    setDienste((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    setHasUnsaved(true)
    setEditingDienst(null)
  }

  const addWunsch = async (wunsch: Omit<MonatsWunsch, 'id' | 'erfuellt'>): Promise<void> => {
    await getApi().wuenscheCreate(wunsch)
    const w = await getApi().wuenscheForMonat(monatJahr)
    setWuensche(w)
    setShowWunschModal(false)
  }

  const deleteWunsch = async (id: number): Promise<void> => {
    await getApi().wuenscheDelete(id)
    const w = await getApi().wuenscheForMonat(monatJahr)
    setWuensche(w)
  }

  // Kalender-Daten aufbauen
  const tage = getTageMonate(monatJahr)
  const gesamt = dienste.length
  const zugewiesen = dienste.filter((d) => d.person_id !== null).length
  const offen = gesamt - zugewiesen

  const getDienst = (datum: string, art: DienstArt): Dienst | undefined =>
    dienste.find((d) => d.datum === datum && d.art === art)

  const getUrlaube = (datum: string): MonatsWunsch[] =>
    wuensche.filter((w) => w.datum === datum && w.typ === WunschTyp.URLAUB)

  return (
    <div className="two-col-layout sidebar-wider" style={{ gridTemplateColumns: '270px 1fr' }}>
      {/* SIDEBAR */}
      <div className="sidebar-panel dienstplan-sidebar">
        {/* Monatsauswahl */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Monat</div>
          <input
            type="month"
            className="form-control"
            value={monatJahr}
            onChange={(e) => {
              setMonatJahr(e.target.value)
              setSelectedPlan(null)
              setDienste([])
            }}
          />
        </div>

        {/* Generierung */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Automatisch generieren</div>
          <button
            className="btn btn-primary w-full"
            onClick={generate}
            disabled={generating}
          >
            {generating ? '⏳ Generiert…' : '⚙️ Automatisch generieren'}
          </button>
          {generating && (
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          {warnungen.length > 0 && (
            <div className="alert alert-warning mt-8" style={{ fontSize: '11px' }}>
              <strong>{warnungen.length} Warnungen:</strong>
              <ul style={{ paddingLeft: '14px', marginTop: '4px' }}>
                {warnungen.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                {warnungen.length > 5 && <li>… und {warnungen.length - 5} weitere</li>}
              </ul>
            </div>
          )}
        </div>

        {/* Dienstplan-Liste */}
        {dienstplaene.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Dienstpläne</div>
            <div className="dienstplan-list">
              {dienstplaene.map((dp) => (
                <div
                  key={dp.id}
                  className={`dienstplan-list-item${selectedPlan?.id === dp.id ? ' active' : ''}`}
                  onClick={() => selectPlan(dp)}
                >
                  <div style={{ fontWeight: 500, fontSize: '12px' }}>{dp.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                    {dp.erstellt_am} · <span className={statusBadgeClass(dp.status)}>{dp.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Wünsche */}
        <div className="sidebar-section">
          <div className="sidebar-section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Wünsche ({wuensche.length})</span>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setShowWunschModal(true)}
              style={{ padding: '2px 8px', fontSize: '11px' }}
            >
              + Neu
            </button>
          </div>
          <div className="wunsch-list">
            {wuensche.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-light)', textAlign: 'center', padding: '8px' }}>
                Keine Wünsche für diesen Monat
              </div>
            )}
            {wuensche.map((w) => (
              <div key={w.id} className="wunsch-item">
                <span className="wunsch-item-name" style={{ fontSize: '11px' }}>{w.person_name}</span>
                <span className="wunsch-item-info">
                  {w.datum.slice(8)} ·{' '}
                  <span className={`badge ${
                    w.typ === WunschTyp.URLAUB ? 'badge-urlaub' :
                    w.typ === WunschTyp.FREIWUNSCH ? 'badge-freiwunsch' : 'badge-dienstwunsch'
                  }`} style={{ fontSize: '9px' }}>
                    {w.typ === WunschTyp.URLAUB ? 'U' : w.typ === WunschTyp.FREIWUNSCH ? 'F' : 'D'}
                  </span>
                </span>
                <button className="wunsch-delete-btn" onClick={() => deleteWunsch(w.id)} title="Löschen">
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {msg && (
          <div className={`alert alert-${msg.type}`} style={{ fontSize: '12px' }}>
            {msg.text}
          </div>
        )}
      </div>

      {/* KALENDER */}
      <div className="main-panel kalender-container">
        {!selectedPlan ? (
          <div className="empty-state" style={{ height: '100%', justifyContent: 'center' }}>
            <div className="empty-state-icon">📅</div>
            <div>Kein Dienstplan für diesen Monat</div>
            <button className="btn btn-primary" onClick={generate} disabled={generating}>
              ⚙️ Jetzt generieren
            </button>
          </div>
        ) : (
          <>
            {/* Header-Leiste */}
            <div className="kalender-header-bar">
              <div className="kalender-title-area">
                <span className="kalender-plan-name">{selectedPlan.name}</span>
                <span className={statusBadgeClass(selectedPlan.status)}>{selectedPlan.status}</span>
                {hasUnsaved && (
                  <span className="badge" style={{ background: '#fff3e0', color: '#e65100' }}>
                    ● Ungespeichert
                  </span>
                )}
              </div>
              <div className="kalender-info">
                <span>Gesamt: <strong>{gesamt}</strong></span>
                <span>Zugewiesen: <strong style={{ color: 'var(--color-success)' }}>{zugewiesen}</strong></span>
                <span>Offen: <strong style={{ color: offen > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{offen}</strong></span>
              </div>
              <div className="kalender-actions">
                <select
                  className="form-control"
                  style={{ width: '150px', padding: '5px 8px', fontSize: '12px' }}
                  value={selectedPlan.status}
                  onChange={(e) => setSelectedPlan({ ...selectedPlan, status: e.target.value as DienstplanStatus })}
                >
                  {Object.values(DienstplanStatus).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button className="btn btn-success btn-sm" onClick={saveDienstplan}>
                  💾 Speichern
                </button>
                <button className="btn btn-outline btn-sm" onClick={exportExcel}>
                  📥 Excel
                </button>
                <button className="btn btn-danger btn-sm" onClick={deleteDienstplan}>
                  🗑
                </button>
              </div>
            </div>

            {/* Kalender-Tabelle */}
            <div className="kalender-scroll">
              <table className="kalender-table">
                <thead>
                  <tr>
                    <th style={{ width: '120px' }}>Datum</th>
                    <th>24h-Vordergrund</th>
                    <th>Visitendienst</th>
                    <th>DaVinci</th>
                  </tr>
                </thead>
                <tbody>
                  {tage.map((datum) => {
                    const weekend = isWeekend(datum)
                    const sa = isSamstag(datum)
                    const so = isSonntag(datum)
                    const fr = isFreitag(datum)
                    const d24 = getDienst(datum, DienstArt.DIENST_24H)
                    const dVisten = getDienst(datum, DienstArt.VISTEN)
                    const dDaVinci = getDienst(datum, DienstArt.DAVINCI)
                    const urlaube = getUrlaube(datum)

                    return (
                      <tr key={datum} className={weekend ? 'kalender-row-weekend' : ''}>
                        {/* Datum */}
                        <td className="datum-cell">
                          <div className="datum-content">
                            <div>
                              <span className="datum-tag">{getWochentag(datum)}</span>{' '}
                              {datum.slice(8)}.{datum.slice(5, 7)}.
                            </div>
                            {urlaube.length > 0 && (
                              <div className="datum-urlaub">
                                {urlaube.map((u) => (
                                  <span key={u.id} title={`Urlaub: ${u.person_name}`}>🏖 {u.person_name.split(' ').pop()}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 24h */}
                        <td
                          className={dienstCellClass(d24)}
                          onClick={() => d24 && setEditingDienst(d24)}
                        >
                          {d24 && (
                            <div className="dienst-cell-inner">
                              <div className={statusDotClass(d24.status)} />
                              {d24.person_name ?? '– offen –'}
                            </div>
                          )}
                        </td>

                        {/* Visten – nur Sa/So */}
                        <td
                          className={(sa || so) ? dienstCellClass(dVisten) : ''}
                          onClick={() => dVisten && (sa || so) && setEditingDienst(dVisten)}
                        >
                          {(sa || so) && dVisten && (
                            <div className="dienst-cell-inner">
                              <div className={statusDotClass(dVisten.status)} />
                              {dVisten.person_name ?? '– offen –'}
                            </div>
                          )}
                          {!(sa || so) && <span style={{ color: 'var(--text-light)', fontSize: '11px' }}>–</span>}
                        </td>

                        {/* DaVinci – nur Freitag */}
                        <td
                          className={fr ? dienstCellClass(dDaVinci) : ''}
                          onClick={() => dDaVinci && fr && setEditingDienst(dDaVinci)}
                        >
                          {fr && dDaVinci && (
                            <div className="dienst-cell-inner">
                              <div className={statusDotClass(dDaVinci.status)} />
                              {dDaVinci.person_name ?? '– offen –'}
                            </div>
                          )}
                          {!fr && <span style={{ color: 'var(--text-light)', fontSize: '11px' }}>–</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Legende */}
            <div className="legende">
              <div className="legende-item">
                <div className="legende-dot" style={{ background: 'var(--dienst-24h)' }} />
                Vordergrund (24h)
              </div>
              <div className="legende-item">
                <div className="legende-dot" style={{ background: 'var(--dienst-visten)' }} />
                Visitendienst (Sa/So)
              </div>
              <div className="legende-item">
                <div className="legende-dot" style={{ background: 'var(--dienst-davinci)' }} />
                DaVinci (Fr)
              </div>
              <div className="legende-item">
                <div className="legende-dot" style={{ background: 'var(--dienst-offen)' }} />
                Offen
              </div>
              <div className="legende-item">
                <div className="legende-dot" style={{ background: 'var(--dienst-urlaub)' }} />
                Urlaub
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {editingDienst && (
        <EditModal
          dienst={editingDienst}
          personen={personen}
          onClose={() => setEditingDienst(null)}
          onSave={updateDienst}
        />
      )}
      {showWunschModal && (
        <WunschModal
          personen={personen}
          monatJahr={monatJahr}
          onClose={() => setShowWunschModal(false)}
          onSave={addWunsch}
        />
      )}
    </div>
  )
}
