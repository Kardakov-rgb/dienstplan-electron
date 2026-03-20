// ===================== ENUMS =====================

export enum Wochentag {
  MONTAG = 'MONTAG',
  DIENSTAG = 'DIENSTAG',
  MITTWOCH = 'MITTWOCH',
  DONNERSTAG = 'DONNERSTAG',
  FREITAG = 'FREITAG',
  SAMSTAG = 'SAMSTAG',
  SONNTAG = 'SONNTAG'
}

export enum DienstArt {
  DIENST_24H = 'DIENST_24H',
  VISTEN = 'VISTEN',
  DAVINCI = 'DAVINCI'
}

export enum DienstStatus {
  GEPLANT = 'GEPLANT',
  BESTAETIGT = 'BESTAETIGT',
  ABGESAGT = 'ABGESAGT',
  ERSETZT = 'ERSETZT',
  ABGESCHLOSSEN = 'ABGESCHLOSSEN'
}

export enum DienstplanStatus {
  ENTWURF = 'ENTWURF',
  GEPRUEFT = 'GEPRUEFT',
  VEROEFFENTLICHT = 'VEROEFFENTLICHT',
  ARCHIVIERT = 'ARCHIVIERT',
  STORNIERT = 'STORNIERT'
}

export enum WunschTyp {
  URLAUB = 'URLAUB',
  FREIWUNSCH = 'FREIWUNSCH',
  DIENSTWUNSCH = 'DIENSTWUNSCH'
}

// ===================== INTERFACES =====================

export interface Person {
  id: number
  name: string
  anzahl_dienste: number
  arbeits_tage: string // kommagetrennt z.B. "MONTAG,DIENSTAG"
  verfuegbare_dienst_arten: string // kommagetrennt z.B. "DIENST_24H,VISTEN"
}

export interface Dienstplan {
  id: number
  name: string
  monat_jahr: string // "YYYY-MM"
  erstellt_am: string // "YYYY-MM-DD"
  letztes_update: string
  status: DienstplanStatus
  bemerkung: string
}

export interface Dienst {
  id: number
  dienstplan_id: number
  datum: string // "YYYY-MM-DD"
  art: DienstArt
  person_id: number | null
  person_name: string | null
  status: DienstStatus
  bemerkung: string | null
}

export interface MonatsWunsch {
  id: number
  person_id: number
  person_name: string
  datum: string // "YYYY-MM-DD"
  monat_jahr: string // "YYYY-MM"
  typ: WunschTyp
  erfuellt: number | null // NULL=nicht ausgewertet, 0=nein, 1=ja
}

export interface FairnessHistorie {
  id: number
  person_id: number
  person_name: string
  monat_jahr: string
  anzahl_wuensche: number
  erfuellte_wuensche: number
}

export interface FairnessScore {
  person_id: number
  person_name: string
  gesamt_wuensche: number
  erfuellte_wuensche: number
  score: number // 0.0 - 1.0
  monate: number
}

export interface DienstCountScore {
  person_id: number
  durchschnitt: number // Ø effektive Dienst-Einheiten/Monat aus Vormonaten
  anzahl_monate: number // Anzahl ausgewerteter Vormonaten
}

export interface StatistikDaten {
  gesamt: number
  zugewiesen: number
  offen: number
  zuweisungsgrad: number
  wunscherfuellung: number
  konflikte: number
  verteilung: PersonVerteilung[]
  offeneDienste: Dienst[]
  konflikteList: KonfliktEintrag[]
}

export interface PersonVerteilung {
  person_id: number
  person_name: string
  soll: number
  ist: number
  dienste_24h: number
  visten: number
  davinci: number
  erfuellung: number // 0-1
}

export interface KonfliktEintrag {
  datum: string
  person_name: string
  dienste: Dienst[]
}

export interface GenerierungErgebnis {
  dienstplan: Dienstplan
  dienste: Dienst[]
  warnungen: string[]
  wunschStatistik: WunschStatistik[]
}

export interface WunschStatistik {
  person_id: number
  person_name: string
  anzahl_urlaub: number
  anzahl_freiwuensche: number
  erfuellte_freiwuensche: number
  anzahl_dienstwuensche: number
  erfuellte_dienstwuensche: number
}

// ===================== IPC API =====================

export interface IpcApi {
  // Personen
  personsGetAll: () => Promise<Person[]>
  personsCreate: (person: Omit<Person, 'id'>) => Promise<Person>
  personsUpdate: (person: Person) => Promise<Person>
  personsDelete: (id: number) => Promise<void>

  // Dienstpläne
  dienstplaeneGetAll: () => Promise<Dienstplan[]>
  dienstplaeneForMonat: (monatJahr: string) => Promise<Dienstplan[]>
  dienstplaeneGetDienste: (dienstplanId: number) => Promise<Dienst[]>
  dienstplaeneSave: (dienstplan: Dienstplan, dienste: Dienst[]) => Promise<Dienstplan>
  dienstplaeneDelete: (id: number) => Promise<void>
  dienstplaeneGenerate: (monatJahr: string, dienstplanName: string) => Promise<GenerierungErgebnis>
  onGenerateProgress: (callback: (progress: number) => void) => () => void

  // Wünsche
  wuenscheForMonat: (monatJahr: string) => Promise<MonatsWunsch[]>
  wuenscheCreate: (wunsch: Omit<MonatsWunsch, 'id' | 'erfuellt'>) => Promise<MonatsWunsch>
  wuenscheCreateBatch: (wuensche: Omit<MonatsWunsch, 'id' | 'erfuellt'>[]) => Promise<MonatsWunsch[]>
  wuenscheDelete: (id: number) => Promise<void>

  // Statistiken
  statistikenGesamt: (von: string, bis: string) => Promise<StatistikDaten>
  statistikenFairness: () => Promise<FairnessScore[]>

  // Excel
  excelExportDienstplan: (dienstplanId: number, filePath: string) => Promise<void>
  excelExportStatistiken: (von: string, bis: string, filePath: string) => Promise<void>
  excelImportWuensche: (filePath: string) => Promise<MonatsWunsch[]>

  // Dialoge
  dialogSaveExcel: () => Promise<string | null>
  dialogOpenExcel: () => Promise<string | null>
}
