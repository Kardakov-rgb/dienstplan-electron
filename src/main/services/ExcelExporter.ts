import ExcelJS from 'exceljs'
import { Dienstplan, Dienst, DienstArt, StatistikDaten } from '../../shared/types'
import { getDb } from '../database/DatabaseManager'

const FARBEN = {
  header: '7a1d21',
  headerFont: 'FFFFFF',
  DIENST_24H: 'd4e6f1',
  VISTEN: 'fde9d9',
  DAVINCI: 'e8f5e9',
  offen: 'fce4ec'
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

function formatDatum(datum: string): string {
  const d = new Date(datum + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function getWochentag(datum: string): string {
  const d = new Date(datum + 'T00:00:00')
  return WOCHENTAGE[d.getDay()]
}

function dienstArtLabel(art: DienstArt): string {
  if (art === DienstArt.DIENST_24H) return 'Vordergrund (24h)'
  if (art === DienstArt.VISTEN) return 'Visitendienst'
  if (art === DienstArt.DAVINCI) return 'DaVinci'
  return art
}

export class ExcelExporter {
  async exportDienstplan(dienstplanId: number, filePath: string): Promise<void> {
    const dienstplan = getDb()
      .prepare('SELECT * FROM dienstplan WHERE id = ?')
      .get(dienstplanId) as Dienstplan
    const dienste = getDb()
      .prepare('SELECT * FROM dienst WHERE dienstplan_id = ? ORDER BY datum, art')
      .all(dienstplanId) as Dienst[]

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Dienstplan-Manager'
    wb.created = new Date()

    // Sheet 1: Dienstplan
    const ws = wb.addWorksheet('Dienstplan')
    ws.columns = [
      { header: 'Datum', key: 'datum', width: 14 },
      { header: 'Tag', key: 'tag', width: 6 },
      { header: 'Dienstart', key: 'art', width: 20 },
      { header: 'Person', key: 'person', width: 25 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Bemerkung', key: 'bemerkung', width: 30 }
    ]

    // Header style
    ws.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF' + FARBEN.header }
      }
      cell.font = { color: { argb: 'FF' + FARBEN.headerFont }, bold: true }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })

    for (const dienst of dienste) {
      const row = ws.addRow({
        datum: formatDatum(dienst.datum),
        tag: getWochentag(dienst.datum),
        art: dienstArtLabel(dienst.art),
        person: dienst.person_name ?? '– offen –',
        status: dienst.status,
        bemerkung: dienst.bemerkung ?? ''
      })

      const farbe = dienst.person_id
        ? FARBEN[dienst.art as keyof typeof FARBEN] ?? 'FFFFFF'
        : FARBEN.offen

      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF' + farbe }
        }
      })
    }

    // Sheet 2: Zusammenfassung
    const ws2 = wb.addWorksheet('Zusammenfassung')
    ws2.columns = [
      { header: 'Person', key: 'person', width: 25 },
      { header: '24h-Dienste', key: 'h24', width: 14 },
      { header: 'Visitendienste', key: 'visten', width: 16 },
      { header: 'DaVinci-Dienste', key: 'davinci', width: 16 },
      { header: 'Gesamt', key: 'gesamt', width: 10 }
    ]

    ws2.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF' + FARBEN.header }
      }
      cell.font = { color: { argb: 'FF' + FARBEN.headerFont }, bold: true }
    })

    // Aggregation
    const personMap = new Map<
      string,
      { h24: number; visten: number; davinci: number }
    >()
    for (const d of dienste) {
      if (!d.person_name) continue
      if (!personMap.has(d.person_name)) {
        personMap.set(d.person_name, { h24: 0, visten: 0, davinci: 0 })
      }
      const entry = personMap.get(d.person_name)!
      if (d.art === DienstArt.DIENST_24H) entry.h24++
      if (d.art === DienstArt.VISTEN) entry.visten++
      if (d.art === DienstArt.DAVINCI) entry.davinci++
    }

    for (const [name, counts] of personMap.entries()) {
      ws2.addRow({
        person: name,
        h24: counts.h24,
        visten: counts.visten,
        davinci: counts.davinci,
        gesamt: counts.h24 + counts.visten + counts.davinci
      })
    }

    await wb.xlsx.writeFile(filePath)
  }

  async exportStatistiken(statistiken: StatistikDaten, filePath: string): Promise<void> {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Dienstplan-Manager'

    const ws = wb.addWorksheet('Statistiken')
    ws.columns = [
      { header: 'Person', key: 'person', width: 25 },
      { header: 'Soll', key: 'soll', width: 10 },
      { header: 'Ist', key: 'ist', width: 10 },
      { header: '24h', key: 'h24', width: 10 },
      { header: 'Visten', key: 'visten', width: 12 },
      { header: 'DaVinci', key: 'davinci', width: 12 },
      { header: 'Erfüllung', key: 'erfuellung', width: 12 }
    ]

    ws.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF' + FARBEN.header }
      }
      cell.font = { color: { argb: 'FF' + FARBEN.headerFont }, bold: true }
    })

    for (const v of statistiken.verteilung) {
      ws.addRow({
        person: v.person_name,
        soll: v.soll,
        ist: v.ist,
        h24: v.dienste_24h,
        visten: v.visten,
        davinci: v.davinci,
        erfuellung: `${Math.round(v.erfuellung * 100)}%`
      })
    }

    await wb.xlsx.writeFile(filePath)
  }

  async importWuensche(
    filePath: string
  ): Promise<{ personName: string; datum: string; typ: string }[]> {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(filePath)

    const ws = wb.worksheets[0]
    const result: { personName: string; datum: string; typ: string }[] = []

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return // Skip header if present

      const personName = String(row.getCell(1).value ?? '').trim()
      const datumRaw = row.getCell(2).value
      const typRaw = String(row.getCell(3).value ?? '').trim().toUpperCase()

      if (!personName || !datumRaw) return

      let datum: string
      if (datumRaw instanceof Date) {
        datum = datumRaw.toISOString().split('T')[0]
      } else {
        datum = String(datumRaw).trim()
      }

      // Typ normalisieren
      let typ = typRaw
      if (typ === 'U') typ = 'URLAUB'
      if (typ === 'F') typ = 'FREIWUNSCH'
      if (typ === 'D') typ = 'DIENSTWUNSCH'

      if (!['URLAUB', 'FREIWUNSCH', 'DIENSTWUNSCH'].includes(typ)) return

      result.push({ personName, datum, typ })
    })

    return result
  }
}
