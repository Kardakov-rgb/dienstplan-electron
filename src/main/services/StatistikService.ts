import { PersonDAO } from '../database/PersonDAO'
import { DienstDAO } from '../database/DienstDAO'
import { MonatsWunschDAO } from '../database/MonatsWunschDAO'
import { FairnessHistorieDAO } from '../database/FairnessHistorieDAO'
import { StatistikDaten, PersonVerteilung, KonfliktEintrag, FairnessScore } from '../../shared/types'
import { getDb } from '../database/DatabaseManager'

export class StatistikService {
  private personDAO = new PersonDAO()
  private dienstDAO = new DienstDAO()
  private wunschDAO = new MonatsWunschDAO()
  private fairnessDAO = new FairnessHistorieDAO()

  getGesamt(von: string, bis: string): StatistikDaten {
    const personen = this.personDAO.getAll()

    // Gesamtzählung
    const zaehlung = getDb()
      .prepare(
        `SELECT COUNT(*) as gesamt,
                SUM(CASE WHEN person_id IS NOT NULL THEN 1 ELSE 0 END) as zugewiesen,
                SUM(CASE WHEN person_id IS NULL THEN 1 ELSE 0 END) as offen
         FROM dienst d
         JOIN dienstplan dp ON d.dienstplan_id = dp.id
         WHERE dp.monat_jahr >= ? AND dp.monat_jahr <= ?`
      )
      .get(von, bis) as { gesamt: number; zugewiesen: number; offen: number }

    // Wunscherfüllung
    const wunschStats = getDb()
      .prepare(
        `SELECT COUNT(*) as gesamt,
                SUM(CASE WHEN erfuellt = 1 THEN 1 ELSE 0 END) as erfuellt
         FROM monats_wunsch
         WHERE monat_jahr >= ? AND monat_jahr <= ?
           AND typ IN ('FREIWUNSCH', 'DIENSTWUNSCH')
           AND erfuellt IS NOT NULL`
      )
      .get(von, bis) as { gesamt: number; erfuellt: number }

    // Dienstverteilung
    const verteilung = this.berechneVerteilung(personen, von, bis)

    // Offene Dienste
    const offeneDienste = this.dienstDAO.getOffeneDienste(von, bis)

    // Konflikte
    const konfliktRows = this.dienstDAO.getKonflikte(von, bis)
    const konflikteList: KonfliktEintrag[] = konfliktRows.map((k) => ({
      datum: k.datum,
      person_name: k.person_name,
      dienste: []
    }))

    const gesamt = zaehlung?.gesamt ?? 0
    const zugewiesen = zaehlung?.zugewiesen ?? 0
    const offen = zaehlung?.offen ?? 0

    return {
      gesamt,
      zugewiesen,
      offen,
      zuweisungsgrad: gesamt > 0 ? zugewiesen / gesamt : 0,
      wunscherfuellung:
        wunschStats?.gesamt > 0 ? wunschStats.erfuellt / wunschStats.gesamt : 0,
      konflikte: konflikteList.length,
      verteilung,
      offeneDienste,
      konflikteList
    }
  }

  private berechneVerteilung(
    personen: ReturnType<PersonDAO['getAll']>,
    von: string,
    bis: string
  ): PersonVerteilung[] {
    const rows = this.dienstDAO.getStatistikByPersonAndZeitraum(von, bis)
    const vistenEinheiten = this.dienstDAO.getVistenEinheitenByPersonAndZeitraum(von, bis)

    return personen
      .map((person) => {
        const personRows = rows.filter((r) => r.person_id === person.id)
        const h24 = personRows.find((r) => r.art === 'DIENST_24H')?.anzahl ?? 0
        const visten = personRows.find((r) => r.art === 'VISTEN')?.anzahl ?? 0
        const vistenEinh =
          vistenEinheiten.find((v) => v.person_id === person.id)?.visten_einheiten ?? 0
        const davinci = personRows.find((r) => r.art === 'DAVINCI')?.anzahl ?? 0
        const ist = h24 + vistenEinh + davinci

        // Soll über Zeitraum berechnen
        const monate = this.getMonateInZeitraum(von, bis)
        const soll = person.anzahl_dienste > 0 ? person.anzahl_dienste * monate : ist

        return {
          person_id: person.id,
          person_name: person.name,
          soll,
          ist,
          dienste_24h: h24,
          visten,
          davinci,
          erfuellung: soll > 0 ? Math.min(ist / soll, 1.0) : 1.0
        }
      })
      .filter((v) => v.ist > 0)
  }

  private getMonateInZeitraum(von: string, bis: string): number {
    const [vonY, vonM] = von.split('-').map(Number)
    const [bisY, bisM] = bis.split('-').map(Number)
    return (bisY - vonY) * 12 + (bisM - vonM) + 1
  }

  getFairnessScores(): FairnessScore[] {
    return this.fairnessDAO.getAllScores()
  }
}
