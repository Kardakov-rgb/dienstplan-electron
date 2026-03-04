import { WebContents } from 'electron'
import { PersonDAO } from '../database/PersonDAO'
import { DienstplanDAO } from '../database/DienstplanDAO'
import { MonatsWunschDAO } from '../database/MonatsWunschDAO'
import { FairnessHistorieDAO } from '../database/FairnessHistorieDAO'
import { DienstplanGenerator } from '../algorithm/DienstplanGenerator'
import {
  Dienstplan,
  Dienst,
  DienstplanStatus,
  DienstArt,
  WunschTyp,
  GenerierungErgebnis,
  WunschStatistik
} from '../../shared/types'

export class DienstplanService {
  private personDAO = new PersonDAO()
  private dienstplanDAO = new DienstplanDAO()
  private wunschDAO = new MonatsWunschDAO()
  private fairnessDAO = new FairnessHistorieDAO()

  async generiere(
    monatJahr: string,
    dienstplanName: string,
    sender: WebContents
  ): Promise<GenerierungErgebnis> {
    const personen = this.personDAO.getAll()
    const wuensche = this.wunschDAO.getForMonat(monatJahr)
    const fairnessScores = this.fairnessDAO.getScoresBeforeMonat(monatJahr)

    const generator = new DienstplanGenerator(
      personen,
      monatJahr,
      wuensche,
      fairnessScores,
      (progress) => {
        sender.send('dienstplaene:generate:progress', progress)
      }
    )

    const result = generator.generate()

    const heute = new Date().toISOString().split('T')[0]
    const dienstplan: Omit<Dienstplan, 'id'> = {
      name: dienstplanName,
      monat_jahr: monatJahr,
      erstellt_am: heute,
      letztes_update: heute,
      status: DienstplanStatus.ENTWURF,
      bemerkung: ''
    }

    const diensteOhneId: Omit<Dienst, 'id' | 'dienstplan_id'>[] = result.dienste

    const savedDienstplan = this.dienstplanDAO.create(dienstplan)

    const diensteWithPlanId: Omit<Dienst, 'id'>[] = diensteOhneId.map((d) => ({
      ...d,
      dienstplan_id: savedDienstplan.id
    }))

    const savedDienstplan2 = this.dienstplanDAO.save(
      savedDienstplan,
      diensteWithPlanId as Dienst[]
    )

    // Wunsch-Statistik berechnen
    const wunschStatistik = this.berechneWunschStatistik(
      personen,
      wuensche,
      diensteWithPlanId as Dienst[]
    )

    // Fairness-Historie speichern
    for (const stat of wunschStatistik) {
      const anzahlWeiche = stat.anzahl_freiwuensche + stat.anzahl_dienstwuensche
      const erfuellteWeiche = stat.erfuellte_freiwuensche + stat.erfuellte_dienstwuensche
      this.fairnessDAO.upsert({
        person_id: stat.person_id,
        person_name: stat.person_name,
        monat_jahr: monatJahr,
        anzahl_wuensche: anzahlWeiche,
        erfuellte_wuensche: erfuellteWeiche
      })
    }

    // Wunsch-Erfüllung in DB updaten
    for (const wunsch of wuensche) {
      const dienst = (diensteWithPlanId as Dienst[]).find(
        (d) => d.datum === wunsch.datum && d.person_id === wunsch.person_id
      )
      if (wunsch.typ === WunschTyp.URLAUB) {
        this.wunschDAO.updateErfuellt(wunsch.id, 1)
      } else if (wunsch.typ === WunschTyp.FREIWUNSCH) {
        this.wunschDAO.updateErfuellt(wunsch.id, dienst ? 0 : 1)
      } else if (wunsch.typ === WunschTyp.DIENSTWUNSCH) {
        const hat24h = (diensteWithPlanId as Dienst[]).find(
          (d) =>
            d.datum === wunsch.datum &&
            d.person_id === wunsch.person_id &&
            d.art === DienstArt.DIENST_24H
        )
        this.wunschDAO.updateErfuellt(wunsch.id, hat24h ? 1 : 0)
      }
    }

    const alleDienste = this.dienstplanDAO.getById(savedDienstplan2.id)

    return {
      dienstplan: savedDienstplan2,
      dienste: diensteWithPlanId as Dienst[],
      warnungen: result.warnungen,
      wunschStatistik
    }
  }

  private berechneWunschStatistik(
    personen: ReturnType<PersonDAO['getAll']>,
    wuensche: ReturnType<MonatsWunschDAO['getForMonat']>,
    dienste: Omit<Dienst, 'id'>[]
  ): WunschStatistik[] {
    return personen.map((person) => {
      const personWuensche = wuensche.filter((w) => w.person_id === person.id)
      const personDienste = dienste.filter((d) => d.person_id === person.id)

      const urlaubWuensche = personWuensche.filter((w) => w.typ === WunschTyp.URLAUB)
      const freiwuensche = personWuensche.filter((w) => w.typ === WunschTyp.FREIWUNSCH)
      const dienstwuensche = personWuensche.filter((w) => w.typ === WunschTyp.DIENSTWUNSCH)

      const erfuellteFreiwuensche = freiwuensche.filter(
        (w) => !personDienste.some((d) => d.datum === w.datum)
      ).length

      const erfuellteDienstwuensche = dienstwuensche.filter((w) =>
        personDienste.some((d) => d.datum === w.datum && d.art === DienstArt.DIENST_24H)
      ).length

      return {
        person_id: person.id,
        person_name: person.name,
        anzahl_urlaub: urlaubWuensche.length,
        anzahl_freiwuensche: freiwuensche.length,
        erfuellte_freiwuensche: erfuellteFreiwuensche,
        anzahl_dienstwuensche: dienstwuensche.length,
        erfuellte_dienstwuensche: erfuellteDienstwuensche
      }
    })
  }
}
