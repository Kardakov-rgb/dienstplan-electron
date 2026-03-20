import { getDb } from './DatabaseManager'
import { Dienst } from '../../shared/types'

export class DienstDAO {
  getByDienstplanId(dienstplanId: number): Dienst[] {
    return getDb()
      .prepare('SELECT * FROM dienst WHERE dienstplan_id = ? ORDER BY datum, art')
      .all(dienstplanId) as Dienst[]
  }

  getByMonatJahr(monatJahr: string): Dienst[] {
    return getDb()
      .prepare(
        `SELECT d.* FROM dienst d
         JOIN dienstplan dp ON d.dienstplan_id = dp.id
         WHERE dp.monat_jahr = ?
         ORDER BY d.datum, d.art`
      )
      .all(monatJahr) as Dienst[]
  }

  insertMany(dienste: Omit<Dienst, 'id'>[]): void {
    const stmt = getDb().prepare(
      'INSERT INTO dienst (dienstplan_id, datum, art, person_id, person_name, status, bemerkung) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    for (const d of dienste) {
      stmt.run(
        d.dienstplan_id,
        d.datum,
        d.art,
        d.person_id ?? null,
        d.person_name ?? null,
        d.status,
        d.bemerkung ?? null
      )
    }
  }

  deleteByDienstplanId(dienstplanId: number): void {
    getDb().prepare('DELETE FROM dienst WHERE dienstplan_id = ?').run(dienstplanId)
  }

  getStatistikByPersonAndZeitraum(
    von: string,
    bis: string
  ): { person_id: number; person_name: string; art: string; anzahl: number }[] {
    return getDb()
      .prepare(
        `SELECT d.person_id, d.person_name, d.art, COUNT(*) as anzahl
         FROM dienst d
         JOIN dienstplan dp ON d.dienstplan_id = dp.id
         WHERE dp.monat_jahr >= ? AND dp.monat_jahr <= ?
           AND d.person_id IS NOT NULL
         GROUP BY d.person_id, d.art
         ORDER BY d.person_name, d.art`
      )
      .all(von, bis) as { person_id: number; person_name: string; art: string; anzahl: number }[]
  }

  getOffeneDienste(von: string, bis: string): Dienst[] {
    return getDb()
      .prepare(
        `SELECT d.* FROM dienst d
         JOIN dienstplan dp ON d.dienstplan_id = dp.id
         WHERE dp.monat_jahr >= ? AND dp.monat_jahr <= ?
           AND d.person_id IS NULL
         ORDER BY d.datum, d.art`
      )
      .all(von, bis) as Dienst[]
  }

  getKonflikte(von: string, bis: string): { datum: string; person_name: string; anzahl: number }[] {
    return getDb()
      .prepare(
        `SELECT d.datum, d.person_name, COUNT(*) as anzahl
         FROM dienst d
         JOIN dienstplan dp ON d.dienstplan_id = dp.id
         WHERE dp.monat_jahr >= ? AND dp.monat_jahr <= ?
           AND d.person_id IS NOT NULL
         GROUP BY d.datum, d.person_id
         HAVING COUNT(*) > 1
         ORDER BY d.datum`
      )
      .all(von, bis) as { datum: string; person_name: string; anzahl: number }[]
  }

  getVistenEinheitenByPersonAndZeitraum(
    von: string,
    bis: string
  ): { person_id: number; visten_einheiten: number }[] {
    return getDb()
      .prepare(
        `SELECT d.person_id, COUNT(DISTINCT dp.monat_jahr) as visten_einheiten
         FROM dienst d
         JOIN dienstplan dp ON d.dienstplan_id = dp.id
         WHERE dp.monat_jahr >= ? AND dp.monat_jahr <= ?
           AND d.person_id IS NOT NULL AND d.art = 'VISTEN'
         GROUP BY d.person_id`
      )
      .all(von, bis) as { person_id: number; visten_einheiten: number }[]
  }

  getEffektiveDienstDurchschnitte(
    bisMonatJahr: string
  ): { person_id: number; durchschnitt: number; anzahl_monate: number }[] {
    return getDb()
      .prepare(
        `WITH monthly AS (
           SELECT d.person_id, dp.monat_jahr,
             SUM(CASE WHEN d.art = 'DIENST_24H' THEN 1 ELSE 0 END) as h24,
             SUM(CASE WHEN d.art = 'DAVINCI' THEN 1 ELSE 0 END) as davinci,
             CASE WHEN SUM(CASE WHEN d.art = 'VISTEN' THEN 1 ELSE 0 END) > 0
                  THEN 1 ELSE 0 END as hat_visten
           FROM dienst d
           JOIN dienstplan dp ON d.dienstplan_id = dp.id
           WHERE dp.monat_jahr < ? AND d.person_id IS NOT NULL
           GROUP BY d.person_id, dp.monat_jahr
         )
         SELECT person_id,
           CAST(SUM(h24 + davinci + hat_visten) AS REAL) / COUNT(*) as durchschnitt,
           COUNT(*) as anzahl_monate
         FROM monthly
         GROUP BY person_id`
      )
      .all(bisMonatJahr) as { person_id: number; durchschnitt: number; anzahl_monate: number }[]
  }
}
