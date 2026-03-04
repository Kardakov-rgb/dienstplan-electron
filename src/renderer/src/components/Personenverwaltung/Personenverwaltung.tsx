import React, { useCallback, useEffect, useState } from 'react'
import { Person, Wochentag, DienstArt } from '../../../../shared/types'

const WOCHENTAGE = [
  { id: Wochentag.MONTAG, label: 'Mo' },
  { id: Wochentag.DIENSTAG, label: 'Di' },
  { id: Wochentag.MITTWOCH, label: 'Mi' },
  { id: Wochentag.DONNERSTAG, label: 'Do' },
  { id: Wochentag.FREITAG, label: 'Fr' },
  { id: Wochentag.SAMSTAG, label: 'Sa' },
  { id: Wochentag.SONNTAG, label: 'So' }
]

const DIENST_ARTEN = [
  { id: DienstArt.DIENST_24H, label: 'Vordergrund (24h)' },
  { id: DienstArt.VISTEN, label: 'Visitendienst' },
  { id: DienstArt.DAVINCI, label: 'DaVinci' }
]

interface FormData {
  name: string
  anzahl_dienste: number
  arbeitsTage: Set<Wochentag>
  dienstArten: Set<DienstArt>
}

const DEFAULT_FORM: FormData = {
  name: '',
  anzahl_dienste: 0,
  arbeitsTage: new Set(Object.values(Wochentag)),
  dienstArten: new Set(Object.values(DienstArt))
}

function personToForm(p: Person): FormData {
  return {
    name: p.name,
    anzahl_dienste: p.anzahl_dienste,
    arbeitsTage: new Set(p.arbeits_tage.split(',').map((s) => s.trim()) as Wochentag[]),
    dienstArten: new Set(
      p.verfuegbare_dienst_arten.split(',').map((s) => s.trim()) as DienstArt[]
    )
  }
}

export default function Personenverwaltung(): React.ReactElement {
  const [personen, setPersonen] = useState<Person[]>([])
  const [filtered, setFiltered] = useState<Person[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState<FormData | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null)

  const loadPersonen = useCallback(async () => {
    const data = await window.api.personsGetAll()
    setPersonen(data)
    setFiltered(data)
  }, [])

  useEffect(() => {
    loadPersonen()
  }, [loadPersonen])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(personen.filter((p) => p.name.toLowerCase().includes(q)))
  }, [search, personen])

  const selectPerson = (p: Person): void => {
    setSelectedId(p.id)
    setIsNew(false)
    setForm(personToForm(p))
    setErrors({})
    setMsg(null)
  }

  const newPerson = (): void => {
    setSelectedId(null)
    setIsNew(true)
    setForm({ ...DEFAULT_FORM, arbeitsTage: new Set(Object.values(Wochentag)), dienstArten: new Set(Object.values(DienstArt)) })
    setErrors({})
    setMsg(null)
  }

  const cancel = (): void => {
    setSelectedId(null)
    setIsNew(false)
    setForm(null)
    setErrors({})
    setMsg(null)
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form?.name.trim()) errs.name = 'Name ist Pflichtfeld'
    if ((form?.anzahl_dienste ?? 0) < 0) errs.anzahl = 'Muss ≥ 0 sein'
    if (form?.arbeitsTage.size === 0) errs.tage = 'Mindestens 1 Arbeitstag wählen'
    if (form?.dienstArten.size === 0) errs.arten = 'Mindestens 1 Dienstart wählen'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const save = async (): Promise<void> => {
    if (!form || !validate()) return
    setSaving(true)
    setMsg(null)
    try {
      const payload = {
        name: form.name.trim(),
        anzahl_dienste: form.anzahl_dienste,
        arbeits_tage: [...form.arbeitsTage].join(','),
        verfuegbare_dienst_arten: [...form.dienstArten].join(',')
      }
      if (isNew) {
        await window.api.personsCreate(payload)
        setMsg({ type: 'success', text: 'Person erfolgreich erstellt.' })
        cancel()
      } else if (selectedId !== null) {
        await window.api.personsUpdate({ id: selectedId, ...payload })
        setMsg({ type: 'success', text: 'Person erfolgreich gespeichert.' })
      }
      await loadPersonen()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('UNIQUE')) {
        setErrors({ name: 'Name existiert bereits' })
      } else {
        setMsg({ type: 'danger', text: `Fehler: ${msg}` })
      }
    } finally {
      setSaving(false)
    }
  }

  const deletePerson = async (): Promise<void> => {
    if (selectedId === null) return
    const p = personen.find((x) => x.id === selectedId)
    if (!confirm(`Person "${p?.name}" wirklich löschen? Alle zugehörigen Dienste und Wünsche werden ebenfalls gelöscht.`)) return
    try {
      await window.api.personsDelete(selectedId)
      setMsg({ type: 'success', text: 'Person gelöscht.' })
      cancel()
      await loadPersonen()
    } catch (e: unknown) {
      setMsg({ type: 'danger', text: `Fehler: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const toggleSet = <T,>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set)
    if (next.has(val)) next.delete(val)
    else next.add(val)
    return next
  }

  return (
    <div className="two-col-layout">
      {/* LINKE SPALTE: Personenliste */}
      <div className="sidebar-panel person-list-panel">
        <div className="person-list-toolbar">
          <input
            className="search-input"
            placeholder="🔍 Person suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={newPerson}>
            + Neu
          </button>
        </div>

        {msg && !form && (
          <div className={`alert alert-${msg.type}`} style={{ margin: '8px 12px' }}>
            {msg.text}
          </div>
        )}

        <div className="table-container">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👤</div>
              <div>Keine Personen gefunden</div>
              <button className="btn btn-primary btn-sm" onClick={newPerson}>
                + Erste Person anlegen
              </button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Soll</th>
                  <th>Dienstarten</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={selectedId === p.id ? 'selected' : ''}
                    onClick={() => selectPerson(p)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td>{p.anzahl_dienste === 0 ? '∞' : p.anzahl_dienste}</td>
                    <td style={{ fontSize: '11px' }}>
                      {p.verfuegbare_dienst_arten
                        .split(',')
                        .map((a) => a.trim())
                        .map((a) => {
                          if (a === 'DIENST_24H') return '24h'
                          if (a === 'VISTEN') return 'Vis'
                          if (a === 'DAVINCI') return 'DaV'
                          return a
                        })
                        .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* RECHTE SPALTE: Formular */}
      <div className="main-panel">
        {!form ? (
          <div className="empty-state" style={{ height: '100%', justifyContent: 'center' }}>
            <div className="empty-state-icon">👈</div>
            <div>Person aus der Liste auswählen oder neue Person anlegen</div>
            <button className="btn btn-primary" onClick={newPerson}>
              + Neue Person anlegen
            </button>
          </div>
        ) : (
          <div className="person-form-panel">
            <h2 className="person-form-title">
              {isNew ? '+ Neue Person anlegen' : `Person bearbeiten: ${personen.find((p) => p.id === selectedId)?.name ?? ''}`}
            </h2>

            {msg && (
              <div className={`alert alert-${msg.type}`}>{msg.text}</div>
            )}

            {/* Name */}
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                className={`form-control${errors.name ? ' error' : ''}`}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z.B. Dr. Müller"
              />
              {errors.name && <span className="form-error">{errors.name}</span>}
            </div>

            {/* Soll-Dienste */}
            <div className="form-group">
              <label className="form-label">Soll-Dienste / Monat (0 = unbegrenzt)</label>
              <input
                className={`form-control${errors.anzahl ? ' error' : ''}`}
                type="number"
                min={0}
                value={form.anzahl_dienste}
                onChange={(e) => setForm({ ...form, anzahl_dienste: parseInt(e.target.value, 10) || 0 })}
                style={{ maxWidth: '120px' }}
              />
              {errors.anzahl && <span className="form-error">{errors.anzahl}</span>}
            </div>

            {/* Arbeitstage */}
            <div className="form-group">
              <label className="form-label">Arbeitstage</label>
              <div className="checkbox-group">
                {WOCHENTAGE.map((wt) => (
                  <label key={wt.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={form.arbeitsTage.has(wt.id)}
                      onChange={() => setForm({ ...form, arbeitsTage: toggleSet(form.arbeitsTage, wt.id) })}
                    />
                    {wt.label}
                  </label>
                ))}
              </div>
              {errors.tage && <span className="form-error">{errors.tage}</span>}
            </div>

            {/* Verfügbare Dienstarten */}
            <div className="form-group">
              <label className="form-label">Verfügbare Dienstarten</label>
              <div className="checkbox-group">
                {DIENST_ARTEN.map((da) => (
                  <label key={da.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={form.dienstArten.has(da.id)}
                      onChange={() => setForm({ ...form, dienstArten: toggleSet(form.dienstArten, da.id) })}
                    />
                    {da.label}
                  </label>
                ))}
              </div>
              {errors.arten && <span className="form-error">{errors.arten}</span>}
            </div>

            {/* Aktionen */}
            <div className="form-actions">
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '⏳ Speichert…' : '💾 Speichern'}
              </button>
              {!isNew && (
                <button className="btn btn-danger" onClick={deletePerson}>
                  🗑 Löschen
                </button>
              )}
              <button className="btn btn-ghost" onClick={cancel}>
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
