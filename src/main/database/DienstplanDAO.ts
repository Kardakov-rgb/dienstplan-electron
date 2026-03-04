import { getDb } from './DatabaseManager'
import { Dienstplan, Dienst } from '../../shared/types'

export class DienstplanDAO {
  getAll(): Dienstplan[] {
    return getDb()
      .prepare('SELECT * FROM dienstplan ORDER BY monat_jahr DESC, erstellt_am DESC')
      .all() as Dienstplan[]
  }

  getById(id: number): Dienstplan | undefined {
    return getDb().prepare('SELECT * FROM dienstplan WHERE id = ?').get(id) as
      | Dienstplan
      | undefined
  }

  getForMonat(monatJahr: string): Dienstplan[] {
    return getDb()
      .prepare('SELECT * FROM dienstplan WHERE monat_jahr = ? ORDER BY erstellt_am DESC')
      .all(monatJahr) as Dienstplan[]
  }

  create(dienstplan: Omit<Dienstplan, 'id'>): Dienstplan {
    const stmt = getDb().prepare(
      'INSERT INTO dienstplan (name, monat_jahr, erstellt_am, letztes_update, status, bemerkung) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const result = stmt.run(
      dienstplan.name,
      dienstplan.monat_jahr,
      dienstplan.erstellt_am,
      dienstplan.letztes_update,
      dienstplan.status,
      dienstplan.bemerkung
    )
    return this.getById(result.lastInsertRowid as number)!
  }

  update(dienstplan: Dienstplan): Dienstplan {
    getDb()
      .prepare(
        'UPDATE dienstplan SET name = ?, status = ?, bemerkung = ?, letztes_update = ? WHERE id = ?'
      )
      .run(
        dienstplan.name,
        dienstplan.status,
        dienstplan.bemerkung,
        new Date().toISOString().split('T')[0],
        dienstplan.id
      )
    return this.getById(dienstplan.id)!
  }

  // Transaktion: löscht alle alten Dienste und fügt neue ein
  save(dienstplan: Dienstplan, dienste: Dienst[]): Dienstplan {
    const db = getDb()
    const transaction = db.transaction(() => {
      let saved: Dienstplan
      if (dienstplan.id && dienstplan.id > 0) {
        saved = this.update(dienstplan)
        db.prepare('DELETE FROM dienst WHERE dienstplan_id = ?').run(dienstplan.id)
      } else {
        saved = this.create(dienstplan)
      }

      const stmt = db.prepare(
        'INSERT INTO dienst (dienstplan_id, datum, art, person_id, person_name, status, bemerkung) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      for (const d of dienste) {
        stmt.run(
          saved.id,
          d.datum,
          d.art,
          d.person_id ?? null,
          d.person_name ?? null,
          d.status,
          d.bemerkung ?? null
        )
      }
      return saved
    })

    return transaction() as Dienstplan
  }

  delete(id: number): void {
    getDb().prepare('DELETE FROM dienstplan WHERE id = ?').run(id)
  }
}
