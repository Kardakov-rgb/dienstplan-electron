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

// Gibt das Samstag-Datum des zugehörigen Wochenendes zurück (Fr→Sa+1, Sa→Sa, So→Sa-1), sonst null
function getWochenendeId(datum: string): string | null {
  const wt = datumToWochentag(datum)
  if (wt === Wochentag.FREITAG) return addDays(datum, 1)
  if (wt === Wochentag.SAMSTAG) return datum
  if (wt === Wochentag.SONNTAG) return subtractDays(datum, 1)
  return null
}

export class DienstplanGenerator {
  private personen: Person[]
  private monatJahr: string
  private wuensche: MonatsWunsch[]
  private fairnessScores: FairnessScore[]
  private vorherigeDienste: Pick<Dienst, 'datum' | 'art' | 'person_id'>[]
  private progressCallback?: (progress: number) => void

  // Laufende Zähler
  private personDienste: Map<number, Set<string>> = new Map()
  // Nur DIENST_24H-Daten, für 2-Tage-Abstandsregel
  private personDienste24h: Map<number, Set<string>> = new Map()
  private personDienstArten: Map<number, { h24: number; visten: number; davinci: number }> =
    new Map()
  private warnungen: string[] = []

  constructor(
    personen: Person[],
    monatJahr: string,
    wuensche: MonatsWunsch[],
    fairnessScores: FairnessScore[],
    progressCallback?: (progress: number) => void,
    vorherigeDienste: Pick<Dienst, 'datum' | 'art' | 'person_id'>[] = []
  ) {
    this.personen = personen
    this.monatJahr = monatJahr
    this.wuensche = wuensche
    this.fairnessScores = fairnessScores
    this.progressCallback = progressCallback
    this.vorherigeDienste = vorherigeDienste

    // Initialisierung
    for (const p of personen) {
      this.personDienste.set(p.id, new Set())
      this.personDienste24h.set(p.id, new Set())
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

    // Nachwirkung Urlaub (1 Tag nach Urlaub gesperrt)
    const vortag = subtractDays(slot.datum, 1)
    const urlaubVortag = this.wuensche.find(
      (w) => w.person_id === person.id && w.datum === vortag && w.typ === WunschTyp.URLAUB
    )
    if (urlaubVortag) return false

    // Regel 3: WE vor und nach dem Urlaub sperren
    if (wt === Wochentag.SAMSTAG || wt === Wochentag.SONNTAG) {
      // "WE vor dem Urlaub": Urlaub startet am Montag nach diesem Wochenende
      const naechsterMontag =
        wt === Wochentag.SAMSTAG ? addDays(slot.datum, 2) : addDays(slot.datum, 1)
      const urlaubMontag = this.wuensche.find(
        (w) =>
          w.person_id === person.id && w.datum === naechsterMontag && w.typ === WunschTyp.URLAUB
      )
      if (urlaubMontag) return false

      // "WE nach dem Urlaub": Urlaub endet am Freitag vor diesem Wochenende
      const vorherigenFreitag =
        wt === Wochentag.SAMSTAG ? subtractDays(slot.datum, 1) : subtractDays(slot.datum, 2)
      const urlaubFreitag = this.wuensche.find(
        (w) =>
          w.person_id === person.id &&
          w.datum === vorherigenFreitag &&
          w.typ === WunschTyp.URLAUB
      )
      if (urlaubFreitag) return false
    }

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

    // Regel 1: Mind. 2 Tage Abstand zwischen DIENST_24H
    if (slot.art === DienstArt.DIENST_24H) {
      const dienste24h = this.personDienste24h.get(person.id) ?? new Set()
      const vorvorTag = subtractDays(slot.datum, 2)
      if (dienste24h.has(vorvorTag)) return false
    }

    // Regel 2: Bei DAVINCI/DIENST_24H an Freitag: kein VISTEN am Samstag danach bereits zugewiesen
    if (
      wt === Wochentag.FREITAG &&
      (slot.art === DienstArt.DAVINCI || slot.art === DienstArt.DIENST_24H)
    ) {
      const naechsterSamstag = addDays(slot.datum, 1)
      const vistenSamstag = slots.find(
        (s) =>
          s.datum === naechsterSamstag &&
          s.art === DienstArt.VISTEN &&
          s.zugewiesenePerson?.id === person.id
      )
      if (vistenSamstag) return false
    }

    // Regel 4 (hart): Max. 2 Wochenenden pro Monat (DIENST_24H + VISTEN auf Fr/Sa/So)
    const neueWeId = getWochenendeId(slot.datum)
    if (neueWeId !== null && slot.art !== DienstArt.DAVINCI) {
      const belegteWEs = new Set<string>()

      // Wochenenden aus bereits zugewiesenen Slots (DIENST_24H + VISTEN)
      for (const s of slots) {
        if (
          s.zugewiesenePerson?.id === person.id &&
          s.art !== DienstArt.DAVINCI
        ) {
          const weId = getWochenendeId(s.datum)
          if (weId) belegteWEs.add(weId)
        }
      }
      // Wochenenden aus personDienste (Constraint Propagation bereits zugewiesen)
      for (const datum of diensteDaten) {
        const weId = getWochenendeId(datum)
        if (weId) belegteWEs.add(weId)
      }

      // Wenn neues WE noch nicht belegt und bereits 2 WEs voll → blockieren
      if (!belegteWEs.has(neueWeId) && belegteWEs.size >= 2) return false
    }

    // Regel 5: Feiertag → kein VISTEN
    if (slot.art === DienstArt.VISTEN) {
      const istFeiertag = this.wuensche.some(
        (w) => w.datum === slot.datum && w.typ === WunschTyp.FEIERTAG
      )
      if (istFeiertag) return false
    }

    // Regel 6 (hart): Max. 1 VisitenDienst-Wochenende pro Monat (= max. 2 VISTEN-Slots)
    if (slot.art === DienstArt.VISTEN) {
      const arten = this.personDienstArten.get(person.id) ?? { h24: 0, visten: 0, davinci: 0 }
      if (arten.visten >= 2) return false
    }

    // Soll-Limit
    if (person.anzahl_dienste > 0) {
      const aktuelle = diensteDaten.size
      const zugewiesen = slots.filter(
        (s) => s.datum !== slot.datum && s.zugewiesenePerson?.id === person.id
      ).length
      if (aktuelle + zugewiesen >= person.anzahl_dienste) return false
    }

    return true
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

    // Priorität 0: Regel 7 – Monat-X+1 Samstag-Bevorzugung (weich)
    if (this.vorherigeDienste.length > 0) {
      const hatFreitagVormonat = this.vorherigeDienste.some(
        (d) =>
          d.person_id === person.id &&
          d.art === DienstArt.DIENST_24H &&
          datumToWochentag(d.datum) === Wochentag.FREITAG
      )
      const hatSonntagVormonat = this.vorherigeDienste.some(
        (d) =>
          d.person_id === person.id &&
          d.art === DienstArt.DIENST_24H &&
          datumToWochentag(d.datum) === Wochentag.SONNTAG
      )

      if (hatFreitagVormonat && hatSonntagVormonat) {
        // Person hatte letzten Monat Fr + So Vordergrund an verschiedenen WEs →
        // diesen Monat Samstag bevorzugen, Fr/So meiden
        if (slot.art === DienstArt.DIENST_24H && wt === Wochentag.SAMSTAG) score += 60
        if (slot.art === DienstArt.DIENST_24H && (wt === Wochentag.FREITAG || wt === Wochentag.SONNTAG)) score -= 40
        if (slot.art === DienstArt.VISTEN) score += 30
      }
    }

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

    // Priorität 8b (weich): Regel 4 – DAVINCI zählt als WE-Belastung
    if (slot.art === DienstArt.DAVINCI) {
      const belegteWEs = new Set<string>()
      for (const s of slots) {
        if (s.zugewiesenePerson?.id === person.id) {
          const weId = getWochenendeId(s.datum)
          if (weId) belegteWEs.add(weId)
        }
      }
      for (const datum of diensteSet) {
        const weId = getWochenendeId(datum)
        if (weId) belegteWEs.add(weId)
      }
      // DaVinci auf Freitag würde neues WE belegen → Penalty wenn schon 2 WEs voll
      const daVinciWeId = getWochenendeId(slot.datum) // immer ein Freitag → gibt Sa zurück
      if (daVinciWeId && !belegteWEs.has(daVinciWeId) && belegteWEs.size >= 2) {
        score -= 50
      }
    }

    // Priorität 9: Alphabetisch (Determinismus)
    score -= person.name.charCodeAt(0) * 0.001

    return score
  }

  private zuweisen(slot: DienstSlot, person: Person): void {
    slot.zugewiesenePerson = person
    const dienste = this.personDienste.get(person.id) ?? new Set()
    dienste.add(slot.datum)
    this.personDienste.set(person.id, dienste)

    if (slot.art === DienstArt.DIENST_24H) {
      const dienste24h = this.personDienste24h.get(person.id) ?? new Set()
      dienste24h.add(slot.datum)
      this.personDienste24h.set(person.id, dienste24h)
    }

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

    if (slot.art === DienstArt.DIENST_24H) {
      const dienste24h = this.personDienste24h.get(person.id) ?? new Set()
      dienste24h.delete(slot.datum)
      this.personDienste24h.set(person.id, dienste24h)
    }

    const arten = this.personDienstArten.get(person.id) ?? { h24: 0, visten: 0, davinci: 0 }
    if (slot.art === DienstArt.DIENST_24H) arten.h24 = Math.max(0, arten.h24 - 1)
    if (slot.art === DienstArt.VISTEN) arten.visten = Math.max(0, arten.visten - 1)
    if (slot.art === DienstArt.DAVINCI) arten.davinci = Math.max(0, arten.davinci - 1)
    this.personDienstArten.set(person.id, arten)
  }
}
