import {
  Person,
  Dienst,
  MonatsWunsch,
  DienstArt,
  DienstStatus,
  Wochentag,
  WunschTyp,
  FairnessScore
} from '../../shared/types'

interface DienstSlot {
  datum: string
  art: DienstArt
  zugewiesenePerson: Person | null
  dienstId?: number
}

export interface GeneratorResult {
  dienste: Omit<Dienst, 'id' | 'dienstplan_id'>[]
  warnungen: string[]
  personDienstCounts: Map<number, { gesamt: number; h24: number; visten: number; davinci: number }>
}

function datumToWochentag(datum: string): Wochentag {
  const d = new Date(datum + 'T00:00:00')
  const day = d.getDay() // 0=So, 1=Mo, ..., 6=Sa
  const map = [
    Wochentag.SONNTAG,
    Wochentag.MONTAG,
    Wochentag.DIENSTAG,
    Wochentag.MITTWOCH,
    Wochentag.DONNERSTAG,
    Wochentag.FREITAG,
    Wochentag.SAMSTAG
  ]
  return map[day]
}

function getTageMonate(monatJahr: string): string[] {
  const [year, month] = monatJahr.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const tage: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    tage.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return tage
}

function addDays(datum: string, days: number): string {
  const d = new Date(datum + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function subtractDays(datum: string, days: number): string {
  return addDays(datum, -days)
}

export class DienstplanGenerator {
  private personen: Person[]
  private monatJahr: string
  private wuensche: MonatsWunsch[]
  private fairnessScores: FairnessScore[]
  private progressCallback?: (progress: number) => void

  // Laufende Zähler
  private personDienste: Map<number, Set<string>> = new Map()
  private personDienstArten: Map<number, { h24: number; visten: number; davinci: number }> =
    new Map()
  private warnungen: string[] = []

  constructor(
    personen: Person[],
    monatJahr: string,
    wuensche: MonatsWunsch[],
    fairnessScores: FairnessScore[],
    progressCallback?: (progress: number) => void
  ) {
    this.personen = personen
    this.monatJahr = monatJahr
    this.wuensche = wuensche
    this.fairnessScores = fairnessScores
    this.progressCallback = progressCallback

    // Initialisierung
    for (const p of personen) {
      this.personDienste.set(p.id, new Set())
      this.personDienstArten.set(p.id, { h24: 0, visten: 0, davinci: 0 })
    }
  }

  generate(): GeneratorResult {
    this.progressCallback?.(0.05)

    // Phase 1: Slots erstellen
    const slots = this.erstelleSlots()
    this.progressCallback?.(0.1)

    // Phase 2: Constraint Propagation
    this.constraintPropagation(slots)
    this.progressCallback?.(0.3)

    // Phase 3: MCV-Sortierung (nur unzugewiesene)
    const offeneSlots = slots.filter((s) => !s.zugewiesenePerson)
    offeneSlots.sort((a, b) => {
      // Primär: Prioritätsgruppe (Visten → 24h Fr/Sa/So → 24h Rest → DaVinci)
      const pa = this.getPriorityGruppe(a)
      const pb = this.getPriorityGruppe(b)
      if (pa !== pb) return pa - pb

      // Sekundär: MCV (wenigste Kandidaten zuerst)
      const ka = this.getKandidaten(a, slots).length
      const kb = this.getKandidaten(b, slots).length
      return ka - kb
    })

    // Sortierte offene Slots in die Gesamtliste einarbeiten
    let offeneIdx = 0
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].zugewiesenePerson) {
        slots[i] = offeneSlots[offeneIdx++]
      }
    }

    this.progressCallback?.(0.4)

    // Phase 4: Backtracking
    this.backtrack(slots, 0)
    this.progressCallback?.(0.9)

    // Ergebnisse zusammenbauen
    const dienste: Omit<Dienst, 'id' | 'dienstplan_id'>[] = slots.map((slot) => ({
      datum: slot.datum,
      art: slot.art,
      person_id: slot.zugewiesenePerson?.id ?? null,
      person_name: slot.zugewiesenePerson?.name ?? null,
      status: DienstStatus.GEPLANT,
      bemerkung: null
    }))

    this.progressCallback?.(1.0)

    const counts: Map<
      number,
      { gesamt: number; h24: number; visten: number; davinci: number }
    > = new Map()
    for (const p of this.personen) {
      const arten = this.personDienstArten.get(p.id) ?? { h24: 0, visten: 0, davinci: 0 }
      counts.set(p.id, {
        gesamt: arten.h24 + arten.visten + arten.davinci,
        ...arten
      })
    }

    return {
      dienste,
      warnungen: this.warnungen,
      personDienstCounts: counts
    }
  }

  private erstelleSlots(): DienstSlot[] {
    const tage = getTageMonate(this.monatJahr)
    const slots: DienstSlot[] = []

    for (const datum of tage) {
      const wt = datumToWochentag(datum)

      // 24h Dienst - täglich (Mo-So)
      slots.push({ datum, art: DienstArt.DIENST_24H, zugewiesenePerson: null })

      // Visten - nur Sa+So
      if (wt === Wochentag.SAMSTAG || wt === Wochentag.SONNTAG) {
        slots.push({ datum, art: DienstArt.VISTEN, zugewiesenePerson: null })
      }

      // DaVinci - nur Freitag
      if (wt === Wochentag.FREITAG) {
        slots.push({ datum, art: DienstArt.DAVINCI, zugewiesenePerson: null })
      }
    }

    return slots
  }

  private constraintPropagation(slots: DienstSlot[]): void {
    // Einmalig nach Prioritätsgruppe vorsortieren (Visten → 24h Fr/Sa/So → 24h Rest → DaVinci)
    slots.sort((a, b) => {
      if (a.zugewiesenePerson && !b.zugewiesenePerson) return 1
      if (!a.zugewiesenePerson && b.zugewiesenePerson) return -1
      return this.getPriorityGruppe(a) - this.getPriorityGruppe(b)
    })

    let changed = true
    let iterations = 0

    while (changed && iterations < 100) {
      changed = false
      iterations++

      for (const slot of slots) {
        if (slot.zugewiesenePerson) continue

        const kandidaten = this.getKandidaten(slot, slots)
        if (kandidaten.length === 0) {
          this.warnungen.push(
            `MANUELL ZUWEISEN: ${slot.datum} ${slot.art} – kein Kandidat verfügbar`
          )
        } else if (kandidaten.length === 1) {
          this.zuweisen(slot, kandidaten[0])
          changed = true
        }
      }
    }
  }

  private backtrack(slots: DienstSlot[], index: number): boolean {
    if (index >= slots.length) return true

    const slot = slots[index]
    if (slot.zugewiesenePerson !== null) {
      return this.backtrack(slots, index + 1)
    }

    const kandidaten = this.getKandidaten(slot, slots)
    const sortiert = this.sortiereKandidaten(kandidaten, slot, slots)

    for (const kandidat of sortiert) {
      this.zuweisen(slot, kandidat)

      if (this.backtrack(slots, index + 1)) return true

      this.zuweisungRueckgaengig(slot, kandidat)
    }

    // Kein Kandidat – Slot leer lassen, weitermachen
    if (!this.warnungen.some((w) => w.includes(`${slot.datum} ${slot.art}`))) {
      this.warnungen.push(`MANUELL ZUWEISEN: ${slot.datum} ${slot.art}`)
    }
    return this.backtrack(slots, index + 1)
  }

  private getKandidaten(slot: DienstSlot, slots: DienstSlot[]): Person[] {
    return this.personen.filter((p) => this.istKandidat(p, slot, slots))
  }

  private istKandidat(person: Person, slot: DienstSlot, slots: DienstSlot[]): boolean {
    const arbeitsTage = person.arbeits_tage.split(',').map((s) => s.trim())
    const dienstArten = person.verfuegbare_dienst_arten.split(',').map((s) => s.trim())
    const wt = datumToWochentag(slot.datum)

    // DienstArt-Check
    if (!dienstArten.includes(slot.art)) return false

    // Wochentag-Check
    if (!arbeitsTage.includes(wt)) return false

    // Urlaub-Check
    const urlaubTag = this.wuensche.find(
      (w) => w.person_id === person.id && w.datum === slot.datum && w.typ === WunschTyp.URLAUB
    )
    if (urlaubTag) return false

    // Nachwirkung Urlaub
    const vortag = subtractDays(slot.datum, 1)
    const urlaubVortag = this.wuensche.find(
      (w) => w.person_id === person.id && w.datum === vortag && w.typ === WunschTyp.URLAUB
    )
    if (urlaubVortag) return false

    // Doppelbesetzung
    const diensteHeute = slots.filter(
      (s) => s.datum === slot.datum && s.zugewiesenePerson?.id === person.id
    )
    if (diensteHeute.length > 0) return false

    // Ruhezeit 24h (Tag nach Dienst ist frei) – außer Visten Sa→So
    const diensteDaten = this.personDienste.get(person.id) ?? new Set()

    if (diensteDaten.has(vortag)) {
      // Ausnahme: Visten Sa→So
      const wt_vortag = datumToWochentag(vortag)
      const vistenVortag = slots.find(
        (s) =>
          s.datum === vortag &&
          s.art === DienstArt.VISTEN &&
          s.zugewiesenePerson?.id === person.id
      )
      const istVistenWE =
        vistenVortag &&
        wt_vortag === Wochentag.SAMSTAG &&
        slot.art === DienstArt.VISTEN &&
        wt === Wochentag.SONNTAG
      if (!istVistenWE) return false
    }

    // Ruhezeit vorwärts (1 Tag) – für alle Diensttypen
    const morgen = addDays(slot.datum, 1)
    const dienstMorgen = slots.find(
      (s) => s.datum === morgen && s.zugewiesenePerson?.id === person.id
    )
    if (dienstMorgen) {
      // Ausnahme: Sa Visten → So Visten (Wochenend-Paar)
      const istVistenWE =
        slot.art === DienstArt.VISTEN &&
        wt === Wochentag.SAMSTAG &&
        dienstMorgen.art === DienstArt.VISTEN &&
        datumToWochentag(morgen) === Wochentag.SONNTAG
      if (!istVistenWE) return false
    }

    // 2-Tage-Ruhezeit rückwärts (nur 24h→24h)
    if (slot.art === DienstArt.DIENST_24H) {
      const vorvorTag = subtractDays(slot.datum, 2)
      const hat24hVorvorTag = slots.find(
        (s) =>
          s.datum === vorvorTag &&
          s.art === DienstArt.DIENST_24H &&
          s.zugewiesenePerson?.id === person.id
      )
      if (hat24hVorvorTag) return false
    }

    // 2-Tage-Ruhezeit vorwärts (nur 24h→24h)
    if (slot.art === DienstArt.DIENST_24H) {
      const uebermorgen = addDays(slot.datum, 2)
      const hat24hUebermorgen = slots.find(
        (s) =>
          s.datum === uebermorgen &&
          s.art === DienstArt.DIENST_24H &&
          s.zugewiesenePerson?.id === person.id
      )
      if (hat24hUebermorgen) return false
    }

    // Max. 1 Visten-Einheit pro Monat (Sa+So Paar = 1 Einheit)
    if (slot.art === DienstArt.VISTEN) {
      const arten = this.personDienstArten.get(person.id) ?? { h24: 0, visten: 0, davinci: 0 }
      if (arten.visten >= 1) {
        // Ausnahme: zweiter Teil eines Sa→So Paares erlaubt
        if (wt === Wochentag.SONNTAG) {
          const samstag = subtractDays(slot.datum, 1)
          const hatSamstagVisten = slots.find(
            (s) =>
              s.datum === samstag &&
              s.art === DienstArt.VISTEN &&
              s.zugewiesenePerson?.id === person.id
          )
          if (!hatSamstagVisten) return false
        } else {
          return false
        }
      }
    }

    // Soll-Limit (Sa+So Visten = 1 Dienst)
    if (person.anzahl_dienste > 0) {
      const arten = this.personDienstArten.get(person.id) ?? { h24: 0, visten: 0, davinci: 0 }
      const vistenBeitrag = arten.visten > 0 ? 1 : 0
      const effektivBelegte = arten.h24 + arten.davinci + vistenBeitrag
      if (effektivBelegte >= person.anzahl_dienste) return false
    }

    return true
  }

  private getPriorityGruppe(slot: DienstSlot): number {
    const wt = datumToWochentag(slot.datum)
    const wochenendeTage = [Wochentag.FREITAG, Wochentag.SAMSTAG, Wochentag.SONNTAG]

    if (slot.art === DienstArt.VISTEN) return 0
    if (slot.art === DienstArt.DIENST_24H && wochenendeTage.includes(wt)) return 1
    if (slot.art === DienstArt.DIENST_24H) return 2
    if (slot.art === DienstArt.DAVINCI) return 3
    return 4
  }

  private sortiereKandidaten(
    kandidaten: Person[],
    slot: DienstSlot,
    slots: DienstSlot[]
  ): Person[] {
    return [...kandidaten].sort((a, b) => {
      const scoreA = this.berechneScore(a, slot, slots)
      const scoreB = this.berechneScore(b, slot, slots)
      return scoreB - scoreA // höher = besser = zuerst
    })
  }

  private berechneScore(person: Person, slot: DienstSlot, slots: DienstSlot[]): number {
    let score = 0
    const wt = datumToWochentag(slot.datum)

    // Priorität 1: Visten Wochenend-Paket
    if (slot.art === DienstArt.VISTEN && wt === Wochentag.SONNTAG) {
      const samstag = subtractDays(slot.datum, 1)
      const hatSamstagVisten = slots.find(
        (s) =>
          s.datum === samstag &&
          s.art === DienstArt.VISTEN &&
          s.zugewiesenePerson?.id === person.id
      )
      if (hatSamstagVisten) score += 1000
    }

    // Priorität 2: Wunsch-Score
    const wunschHeute = this.wuensche.find(
      (w) => w.person_id === person.id && w.datum === slot.datum
    )
    if (wunschHeute) {
      if (wunschHeute.typ === WunschTyp.FREIWUNSCH) score -= 100
      if (wunschHeute.typ === WunschTyp.DIENSTWUNSCH && slot.art === DienstArt.DIENST_24H)
        score += 50
    }

    // Priorität 3: DaVinci-Regeln
    if (slot.art === DienstArt.DAVINCI) {
      const arten = this.personDienstArten.get(person.id) ?? { h24: 0, visten: 0, davinci: 0 }
      if (arten.davinci > 0) score -= 70
    }
    if (wt === Wochentag.SAMSTAG) {
      const freitag = subtractDays(slot.datum, 1)
      const hatDaVinciFr = slots.find(
        (s) =>
          s.datum === freitag &&
          s.art === DienstArt.DAVINCI &&
          s.zugewiesenePerson?.id === person.id
      )
      if (hatDaVinciFr) score -= 80
    }

    // Priorität 4: Fairness
    const fairness = this.fairnessScores.find((f) => f.person_id === person.id)
    if (fairness) {
      score += (1.0 - fairness.score) * 30 // Benachteiligte bevorzugen
    }

    // Priorität 5: Soll-Erfüllung
    if (person.anzahl_dienste > 0) {
      const diensteDaten = this.personDienste.get(person.id) ?? new Set()
      const ratio = diensteDaten.size / person.anzahl_dienste
      score += (1.0 - ratio) * 25
    }

    // Priorität 6: Abstand zum letzten Dienst
    const diensteSet = this.personDienste.get(person.id) ?? new Set()
    const diensteDaten = [...diensteSet].sort()
    if (diensteDaten.length > 0) {
      const letzterDienst = diensteDaten[diensteDaten.length - 1]
      const abstand =
        (new Date(slot.datum).getTime() - new Date(letzterDienst).getTime()) /
        (1000 * 60 * 60 * 24)
      score += Math.min(abstand, 14) // max 14 Punkte für Abstand
    } else {
      score += 14
    }

    // Priorität 7: Wenigste Dienste bisher
    score -= diensteSet.size * 2

    // Priorität 8: DienstArt-Balance
    const arten = this.personDienstArten.get(person.id) ?? { h24: 0, visten: 0, davinci: 0 }
    if (slot.art === DienstArt.DIENST_24H) score -= arten.h24
    if (slot.art === DienstArt.VISTEN) score -= arten.visten * 2
    if (slot.art === DienstArt.DAVINCI) score -= arten.davinci * 2

    // Priorität 9: Alphabetisch (Determinismus)
    score -= person.name.charCodeAt(0) * 0.001

    return score
  }

  private zuweisen(slot: DienstSlot, person: Person): void {
    slot.zugewiesenePerson = person
    const dienste = this.personDienste.get(person.id) ?? new Set()
    dienste.add(slot.datum)
    this.personDienste.set(person.id, dienste)

    const arten = this.personDienstArten.get(person.id) ?? { h24: 0, visten: 0, davinci: 0 }
    if (slot.art === DienstArt.DIENST_24H) arten.h24++
    if (slot.art === DienstArt.VISTEN) arten.visten++
    if (slot.art === DienstArt.DAVINCI) arten.davinci++
    this.personDienstArten.set(person.id, arten)
  }

  private zuweisungRueckgaengig(slot: DienstSlot, person: Person): void {
    slot.zugewiesenePerson = null
    const dienste = this.personDienste.get(person.id) ?? new Set()

    // Prüfe ob Person noch andere Dienste an diesem Tag hat
    const andereAmTag = [...dienste].filter((d) => d === slot.datum).length
    if (andereAmTag <= 1) {
      dienste.delete(slot.datum)
    }
    this.personDienste.set(person.id, dienste)

    const arten = this.personDienstArten.get(person.id) ?? { h24: 0, visten: 0, davinci: 0 }
    if (slot.art === DienstArt.DIENST_24H) arten.h24 = Math.max(0, arten.h24 - 1)
    if (slot.art === DienstArt.VISTEN) arten.visten = Math.max(0, arten.visten - 1)
    if (slot.art === DienstArt.DAVINCI) arten.davinci = Math.max(0, arten.davinci - 1)
    this.personDienstArten.set(person.id, arten)
  }
}
