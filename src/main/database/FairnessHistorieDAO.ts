import { getDb } from './DatabaseManager'
import { FairnessHistorie, FairnessScore } from '../../shared/types'

export class FairnessHistorieDAO {
  getForMonat(monatJahr: string): FairnessHistorie[] {
    return getDb()
      .prepare('SELECT * FROM fairness_historie WHERE monat_jahr = ?')
      .all(monatJahr) as FairnessHistorie[]
  }

  // Gibt Scores aus ALLEN Monaten VOR dem angegebenen Monat zurück
  getScoresBeforeMonat(monatJahr: string): FairnessScore[] {
    const rows = getDb()
      .prepare(
        `SELECT person_id, person_name,
                SUM(anzahl_wuensche) as gesamt_wuensche,
                SUM(erfuellte_wuensche) as erfuellte_wuensche,
                COUNT(*) as monate
         FROM fairness_historie
         WHERE monat_jahr < ?
         GROUP BY person_id
         ORDER BY person_name`
      )
      .all(monatJahr) as {
      person_id: number
      person_name: string
      gesamt_wuensche: number
      erfuellte_wuensche: number
      monate: number
    }[]

    return rows.map((r) => ({
      person_id: r.person_id,
      person_name: r.person_name,
      gesamt_wuensche: r.gesamt_wuensche,
      erfuellte_wuensche: r.erfuellte_wuensche,
      score: r.gesamt_wuensche > 0 ? r.erfuellte_wuensche / r.gesamt_wuensche : 1.0,
      monate: r.monate
    }))
  }

  getAllScores(): FairnessScore[] {
    const rows = getDb()
      .prepare(
        `SELECT person_id, person_name,
                SUM(anzahl_wuensche) as gesamt_wuensche,
                SUM(erfuellte_wuensche) as erfuellte_wuensche,
                COUNT(*) as monate
         FROM fairness_historie
         GROUP BY person_id
         ORDER BY person_name`
      )
      .all() as {
      person_id: number
      person_name: string
      gesamt_wuensche: number
      erfuellte_wuensche: number
      monate: number
    }[]

    return rows.map((r) => ({
      person_id: r.person_id,
      person_name: r.person_name,
      gesamt_wuensche: r.gesamt_wuensche,
      erfuellte_wuensche: r.erfuellte_wuensche,
      score: r.gesamt_wuensche > 0 ? r.erfuellte_wuensche / r.gesamt_wuensche : 1.0,
      monate: r.monate
    }))
  }

  upsert(historie: Omit<FairnessHistorie, 'id'>): void {
    const existing = getDb()
      .prepare(
        'SELECT id FROM fairness_historie WHERE person_id = ? AND monat_jahr = ?'
      )
      .get(historie.person_id, historie.monat_jahr) as { id: number } | undefined

    if (existing) {
      getDb()
        .prepare(
          'UPDATE fairness_historie SET anzahl_wuensche = ?, erfuellte_wuensche = ? WHERE id = ?'
        )
        .run(historie.anzahl_wuensche, historie.erfuellte_wuensche, existing.id)
    } else {
      getDb()
        .prepare(
          'INSERT INTO fairness_historie (person_id, person_name, monat_jahr, anzahl_wuensche, erfuellte_wuensche) VALUES (?, ?, ?, ?, ?)'
        )
        .run(
          historie.person_id,
          historie.person_name,
          historie.monat_jahr,
          historie.anzahl_wuensche,
          historie.erfuellte_wuensche
        )
    }
  }
}
