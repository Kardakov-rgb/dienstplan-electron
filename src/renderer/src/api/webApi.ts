import Dexie, { type Table } from 'dexie'
import {
  Person,
  Dienstplan,
  Dienst,
  MonatsWunsch,
  FairnessHistorie,
  FairnessScore,
  StatistikDaten,
  PersonVerteilung,
  KonfliktEintrag,
  GenerierungErgebnis,
  WunschStatistik,
  DienstplanStatus,
  WunschTyp,
  DienstArt
} from '../../../shared/types'
import { DienstplanGenerator } from '../../../main/algorithm/DienstplanGenerator'

// ---- Dexie-Datenbank ----

class DienstplanDB extends Dexie {
  persons!: Table<Person, number>
  dienstplaene!: Table<Dienstplan, number>
  dienste!: Table<Dienst, number>
  wuensche!: Table<MonatsWunsch, number>
  fairnessHistorie!: Table<FairnessHistorie, number>

  constructor() {
    super('DienstplanWebDB')
    this.version(1).stores({
      persons: '++id, &name',
      dienstplaene: '++id, monat_jahr',
      dienste: '++id, dienstplan_id, person_id',
      wuensche: '++id, person_id, monat_jahr, [person_id+datum]',
      fairnessHistorie: '++id, person_id, monat_jahr, [person_id+monat_jahr]'
    })
  }
}

const db = new DienstplanDB()

// ---- Progress-Callbacks für generate ----

const progressCallbacks: ((p: number) => void)[] = []

// ---- Hilfsfunktionen ----

function berechneWunschStatistik(
  personen: Person[],
  wuensche: MonatsWunsch[],
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

function berechneVerteilung(
  personen: Person[],
  dienste: Dienst[],
  von: string,
  bis: string
): PersonVerteilung[] {
  const [vonY, vonM] = von.split('-').map(Number)
  const [bisY, bisM] = bis.split('-').map(Number)
  const monate = (bisY - vonY) * 12 + (bisM - vonM) + 1

  return personen
    .map((person) => {
      const personDienste = dienste.filter((d) => d.person_id === person.id)
      const h24 = personDienste.filter((d) => d.art === DienstArt.DIENST_24H).length
      const visten = personDienste.filter((d) => d.art === DienstArt.VISTEN).length
      const davinci = personDienste.filter((d) => d.art === DienstArt.DAVINCI).length
      const ist = h24 + visten + davinci
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

async function computeFairnessScoresBeforeMonat(monatJahr: string): Promise<FairnessScore[]> {
  const alleHistorie = await db.fairnessHistorie.where('monat_jahr').below(monatJahr).toArray()
  const personen = await db.persons.toArray()

  return personen.map((person) => {
    const entries = alleHistorie.filter((h) => h.person_id === person.id)
    const gesamt = entries.reduce((sum, e) => sum + e.anzahl_wuensche, 0)
    const erfuellt = entries.reduce((sum, e) => sum + e.erfuellte_wuensche, 0)
    return {
      person_id: person.id,
      person_name: person.name,
      gesamt_wuensche: gesamt,
      erfuellte_wuensche: erfuellt,
      score: gesamt > 0 ? erfuellt / gesamt : 1.0,
      monate: entries.length
    }
  })
}

async function upsertFairnessHistorie(data: Omit<FairnessHistorie, 'id'>): Promise<void> {
  const existing = await db.fairnessHistorie
    .where('[person_id+monat_jahr]')
    .equals([data.person_id, data.monat_jahr])
    .first()
  if (existing) {
    await db.fairnessHistorie.update(existing.id, {
      anzahl_wuensche: data.anzahl_wuensche,
      erfuellte_wuensche: data.erfuellte_wuensche
    })
  } else {
    await db.fairnessHistorie.add(data as FairnessHistorie)
  }
}

// ---- Web-API (implementiert IpcApi + dienstplaeneGetDienste) ----

export const webApi = {
  // ---- Personen ----
  personsGetAll: (): Promise<Person[]> => db.persons.toArray(),

  personsCreate: async (person: Omit<Person, 'id'>): Promise<Person> => {
    const id = await db.persons.add(person as Person)
    return { ...person, id: id as number }
  },

  personsUpdate: async (person: Person): Promise<Person> => {
    await db.persons.put(person)
    return person
  },

  personsDelete: async (id: number): Promise<void> => {
    await db.persons.delete(id)
    await db.dienste.where('person_id').equals(id).modify({ person_id: null, person_name: null })
    await db.wuensche.where('person_id').equals(id).delete()
    await db.fairnessHistorie.where('person_id').equals(id).delete()
  },

  // ---- Dienstpläne ----
  dienstplaeneGetAll: (): Promise<Dienstplan[]> => db.dienstplaene.toArray(),

  dienstplaeneForMonat: (monatJahr: string): Promise<Dienstplan[]> =>
    db.dienstplaene.where('monat_jahr').equals(monatJahr).toArray(),

  dienstplaeneGetDienste: (dienstplanId: number): Promise<Dienst[]> =>
    db.dienste.where('dienstplan_id').equals(dienstplanId).toArray(),

  dienstplaeneSave: async (dienstplan: Dienstplan, dienste: Dienst[]): Promise<Dienstplan> => {
    const heute = new Date().toISOString().split('T')[0]
    const updated = { ...dienstplan, letztes_update: heute }
    await db.dienstplaene.put(updated)
    await db.dienste.where('dienstplan_id').equals(dienstplan.id).delete()
    await db.dienste.bulkPut(dienste)
    return updated
  },

  dienstplaeneDelete: async (id: number): Promise<void> => {
    await db.dienste.where('dienstplan_id').equals(id).delete()
    await db.dienstplaene.delete(id)
  },

  dienstplaeneGenerate: async (
    monatJahr: string,
    dienstplanName: string
  ): Promise<GenerierungErgebnis> => {
    const personen = await db.persons.toArray()
    const wuensche = await db.wuensche.where('monat_jahr').equals(monatJahr).toArray()
    const fairnessScores = await computeFairnessScoresBeforeMonat(monatJahr)

    progressCallbacks.forEach((cb) => cb(0))

    const generator = new DienstplanGenerator(
      personen,
      monatJahr,
      wuensche,
      fairnessScores,
      (p) => progressCallbacks.forEach((cb) => cb(p))
    )

    const result = generator.generate()

    const heute = new Date().toISOString().split('T')[0]
    const dienstplanId = (await db.dienstplaene.add({
      id: 0,
      name: dienstplanName,
      monat_jahr: monatJahr,
      erstellt_am: heute,
      letztes_update: heute,
      status: DienstplanStatus.ENTWURF,
      bemerkung: ''
    })) as number

    const diensteToSave: Dienst[] = result.dienste.map((d) => ({
      ...d,
      id: 0,
      dienstplan_id: dienstplanId
    }))

    const ids = (await db.dienste.bulkAdd(diensteToSave, { allKeys: true })) as number[]
    const savedDienste = diensteToSave.map((d, i) => ({ ...d, id: ids[i] }))

    const wunschStatistik = berechneWunschStatistik(personen, wuensche, diensteToSave)

    for (const stat of wunschStatistik) {
      const anzahlWeiche = stat.anzahl_freiwuensche + stat.anzahl_dienstwuensche
      const erfuellteWeiche = stat.erfuellte_freiwuensche + stat.erfuellte_dienstwuensche
      await upsertFairnessHistorie({
        person_id: stat.person_id,
        person_name: stat.person_name,
        monat_jahr: monatJahr,
        anzahl_wuensche: anzahlWeiche,
        erfuellte_wuensche: erfuellteWeiche
      })
    }

    for (const wunsch of wuensche) {
      const dienst = diensteToSave.find(
        (d) => d.datum === wunsch.datum && d.person_id === wunsch.person_id
      )
      if (wunsch.typ === WunschTyp.URLAUB) {
        await db.wuensche.update(wunsch.id, { erfuellt: 1 })
      } else if (wunsch.typ === WunschTyp.FREIWUNSCH) {
        await db.wuensche.update(wunsch.id, { erfuellt: dienst ? 0 : 1 })
      } else if (wunsch.typ === WunschTyp.DIENSTWUNSCH) {
        const hat24h = diensteToSave.find(
          (d) =>
            d.datum === wunsch.datum &&
            d.person_id === wunsch.person_id &&
            d.art === DienstArt.DIENST_24H
        )
        await db.wuensche.update(wunsch.id, { erfuellt: hat24h ? 1 : 0 })
      }
    }

    const dienstplan = (await db.dienstplaene.get(dienstplanId))!
    progressCallbacks.forEach((cb) => cb(1))

    return { dienstplan, dienste: savedDienste, warnungen: result.warnungen, wunschStatistik }
  },

  onGenerateProgress: (callback: (progress: number) => void): (() => void) => {
    progressCallbacks.push(callback)
    return () => {
      const idx = progressCallbacks.indexOf(callback)
      if (idx >= 0) progressCallbacks.splice(idx, 1)
    }
  },

  // ---- Wünsche ----
  wuenscheForMonat: (monatJahr: string): Promise<MonatsWunsch[]> =>
    db.wuensche.where('monat_jahr').equals(monatJahr).toArray(),

  wuenscheCreate: async (
    wunsch: Omit<MonatsWunsch, 'id' | 'erfuellt'>
  ): Promise<MonatsWunsch> => {
    const id = (await db.wuensche.add({ ...wunsch, erfuellt: null } as MonatsWunsch)) as number
    return { ...wunsch, id, erfuellt: null }
  },

  wuenscheCreateBatch: async (
    wuensche: Omit<MonatsWunsch, 'id' | 'erfuellt'>[]
  ): Promise<MonatsWunsch[]> => {
    const toAdd = wuensche.map((w) => ({ ...w, erfuellt: null })) as MonatsWunsch[]
    const ids = (await db.wuensche.bulkAdd(toAdd, { allKeys: true })) as number[]
    return toAdd.map((w, i) => ({ ...w, id: ids[i] }))
  },

  wuenscheDelete: (id: number): Promise<void> => db.wuensche.delete(id),

  // ---- Statistiken ----
  statistikenGesamt: async (von: string, bis: string): Promise<StatistikDaten> => {
    const allePlaene = await db.dienstplaene
      .where('monat_jahr')
      .between(von, bis, true, true)
      .toArray()
    const planIds = allePlaene.map((p) => p.id)
    const alleDienste =
      planIds.length > 0
        ? await db.dienste.where('dienstplan_id').anyOf(planIds).toArray()
        : []

    const gesamt = alleDienste.length
    const zugewiesen = alleDienste.filter((d) => d.person_id !== null).length
    const offen = gesamt - zugewiesen

    const alleWuensche = await db.wuensche
      .where('monat_jahr')
      .between(von, bis, true, true)
      .filter((w) => w.typ !== WunschTyp.URLAUB && w.erfuellt !== null)
      .toArray()
    const wunschGesamt = alleWuensche.length
    const wunschErfuellt = alleWuensche.filter((w) => w.erfuellt === 1).length

    const personen = await db.persons.toArray()
    const verteilung = berechneVerteilung(personen, alleDienste, von, bis)
    const offeneDienste = alleDienste.filter((d) => d.person_id === null)

    const konflikteMap = new Map<string, KonfliktEintrag>()
    for (const dienst of alleDienste) {
      if (!dienst.person_id) continue
      const key = `${dienst.datum}-${dienst.person_id}`
      if (!konflikteMap.has(key)) {
        konflikteMap.set(key, { datum: dienst.datum, person_name: dienst.person_name!, dienste: [] })
      }
      konflikteMap.get(key)!.dienste.push(dienst)
    }
    const konflikteList = [...konflikteMap.values()].filter((k) => k.dienste.length > 1)

    return {
      gesamt,
      zugewiesen,
      offen,
      zuweisungsgrad: gesamt > 0 ? zugewiesen / gesamt : 0,
      wunscherfuellung: wunschGesamt > 0 ? wunschErfuellt / wunschGesamt : 0,
      konflikte: konflikteList.length,
      verteilung,
      offeneDienste,
      konflikteList
    }
  },

  statistikenFairness: async (): Promise<FairnessScore[]> => {
    const alleHistorie = await db.fairnessHistorie.toArray()
    const personen = await db.persons.toArray()

    return personen
      .map((person) => {
        const entries = alleHistorie.filter((h) => h.person_id === person.id)
        const gesamt = entries.reduce((sum, e) => sum + e.anzahl_wuensche, 0)
        const erfuellt = entries.reduce((sum, e) => sum + e.erfuellte_wuensche, 0)
        return {
          person_id: person.id,
          person_name: person.name,
          gesamt_wuensche: gesamt,
          erfuellte_wuensche: erfuellt,
          score: gesamt > 0 ? erfuellt / gesamt : 1.0,
          monate: entries.length
        }
      })
      .filter((f) => f.gesamt_wuensche > 0)
  },

  // ---- Excel (nicht verfügbar im Browser) ----
  excelExportDienstplan: async (_dienstplanId: number, _filePath: string): Promise<void> => {
    alert('Excel-Export ist in der Web-Version nicht verfügbar.')
  },

  excelExportStatistiken: async (
    _von: string,
    _bis: string,
    _filePath: string
  ): Promise<void> => {
    alert('Excel-Export ist in der Web-Version nicht verfügbar.')
  },

  excelImportWuensche: async (_filePath: string): Promise<MonatsWunsch[]> => {
    alert('Excel-Import ist in der Web-Version nicht verfügbar.')
    return []
  },

  // ---- Dialoge (Browser hat keine nativen Datei-Dialoge) ----
  dialogSaveExcel: async (): Promise<string | null> => null,
  dialogOpenExcel: async (): Promise<string | null> => null
}
