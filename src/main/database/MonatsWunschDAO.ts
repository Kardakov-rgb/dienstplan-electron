import { getDb } from './DatabaseManager'
import { MonatsWunsch } from '../../shared/types'

export class MonatsWunschDAO {
  getForMonat(monatJahr: string): MonatsWunsch[] {
    return getDb()
      .prepare('SELECT * FROM monats_wunsch WHERE monat_jahr = ? ORDER BY datum, person_name')
      .all(monatJahr) as MonatsWunsch[]
  }

  getForPersonAndMonat(personId: number, monatJahr: string): MonatsWunsch[] {
    return getDb()
      .prepare(
        'SELECT * FROM monats_wunsch WHERE person_id = ? AND monat_jahr = ? ORDER BY datum'
      )
      .all(personId, monatJahr) as MonatsWunsch[]
  }

  create(wunsch: Omit<MonatsWunsch, 'id' | 'erfuellt'>): MonatsWunsch {
    const stmt = getDb().prepare(
      'INSERT INTO monats_wunsch (person_id, person_name, datum, monat_jahr, typ, erfuellt) VALUES (?, ?, ?, ?, ?, NULL)'
    )
    const result = stmt.run(
      wunsch.person_id,
      wunsch.person_name,
      wunsch.datum,
      wunsch.monat_jahr,
      wunsch.typ
    )
    return getDb()
      .prepare('SELECT * FROM monats_wunsch WHERE id = ?')
      .get(result.lastInsertRowid) as MonatsWunsch
  }

  createBatch(wuensche: Omit<MonatsWunsch, 'id' | 'erfuellt'>[]): MonatsWunsch[] {
    const stmt = getDb().prepare(
      'INSERT INTO monats_wunsch (person_id, person_name, datum, monat_jahr, typ, erfuellt) VALUES (?, ?, ?, ?, ?, NULL)'
    )
    const ids: number[] = []
    const transaction = getDb().transaction(() => {
      for (const w of wuensche) {
        const result = stmt.run(w.person_id, w.person_name, w.datum, w.monat_jahr, w.typ)
        ids.push(result.lastInsertRowid as number)
      }
    })
    transaction()
    return ids.map(
      (id) =>
        getDb()
          .prepare('SELECT * FROM monats_wunsch WHERE id = ?')
          .get(id) as MonatsWunsch
    )
  }

  updateErfuellt(id: number, erfuellt: number | null): void {
    getDb().prepare('UPDATE monats_wunsch SET erfuellt = ? WHERE id = ?').run(erfuellt, id)
  }

  delete(id: number): void {
    getDb().prepare('DELETE FROM monats_wunsch WHERE id = ?').run(id)
  }

  deleteForPersonAndMonat(personId: number, monatJahr: string): void {
    getDb()
      .prepare('DELETE FROM monats_wunsch WHERE person_id = ? AND monat_jahr = ?')
      .run(personId, monatJahr)
  }
}
