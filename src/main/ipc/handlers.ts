import { ipcMain, dialog } from 'electron'
import { PersonDAO } from '../database/PersonDAO'
import { DienstplanDAO } from '../database/DienstplanDAO'
import { DienstDAO } from '../database/DienstDAO'
import { MonatsWunschDAO } from '../database/MonatsWunschDAO'
import { FairnessHistorieDAO } from '../database/FairnessHistorieDAO'
import { DienstplanService } from '../services/DienstplanService'
import { StatistikService } from '../services/StatistikService'
import { ExcelExporter } from '../services/ExcelExporter'
import { Person, Dienstplan, Dienst, MonatsWunsch, WunschTyp } from '../../shared/types'

const personDAO = new PersonDAO()
const dienstplanDAO = new DienstplanDAO()
const dienstDAO = new DienstDAO()
const wunschDAO = new MonatsWunschDAO()
const fairnessDAO = new FairnessHistorieDAO()
const dienstplanService = new DienstplanService()
const statistikService = new StatistikService()
const excelExporter = new ExcelExporter()

export function registerIpcHandlers(): void {
  // ===== PERSONEN =====
  ipcMain.handle('persons:getAll', async () => {
    return personDAO.getAll()
  })

  ipcMain.handle('persons:create', async (_e, person: Omit<Person, 'id'>) => {
    return personDAO.create(person)
  })

  ipcMain.handle('persons:update', async (_e, person: Person) => {
    return personDAO.update(person)
  })

  ipcMain.handle('persons:delete', async (_e, id: number) => {
    personDAO.delete(id)
  })

  // ===== DIENSTPLÄNE =====
  ipcMain.handle('dienstplaene:getAll', async () => {
    return dienstplanDAO.getAll()
  })

  ipcMain.handle('dienstplaene:forMonat', async (_e, monatJahr: string) => {
    return dienstplanDAO.getForMonat(monatJahr)
  })

  ipcMain.handle(
    'dienstplaene:save',
    async (_e, dienstplan: Dienstplan, dienste: Dienst[]) => {
      return dienstplanDAO.save(dienstplan, dienste)
    }
  )

  ipcMain.handle('dienstplaene:delete', async (_e, id: number) => {
    dienstplanDAO.delete(id)
  })

  ipcMain.handle(
    'dienstplaene:generate',
    async (event, monatJahr: string, dienstplanName: string) => {
      return dienstplanService.generiere(monatJahr, dienstplanName, event.sender)
    }
  )

  ipcMain.handle('dienstplaene:getDienste', async (_e, dienstplanId: number) => {
    return dienstDAO.getByDienstplanId(dienstplanId)
  })

  // ===== WÜNSCHE =====
  ipcMain.handle('wuensche:forMonat', async (_e, monatJahr: string) => {
    return wunschDAO.getForMonat(monatJahr)
  })

  ipcMain.handle('wuensche:create', async (_e, wunsch: Omit<MonatsWunsch, 'id' | 'erfuellt'>) => {
    return wunschDAO.create(wunsch)
  })

  ipcMain.handle(
    'wuensche:createBatch',
    async (_e, wuensche: Omit<MonatsWunsch, 'id' | 'erfuellt'>[]) => {
      return wunschDAO.createBatch(wuensche)
    }
  )

  ipcMain.handle('wuensche:delete', async (_e, id: number) => {
    wunschDAO.delete(id)
  })

  // ===== STATISTIKEN =====
  ipcMain.handle('statistiken:gesamt', async (_e, von: string, bis: string) => {
    return statistikService.getGesamt(von, bis)
  })

  ipcMain.handle('statistiken:fairness', async () => {
    return statistikService.getFairnessScores()
  })

  // ===== EXCEL =====
  ipcMain.handle('excel:exportDienstplan', async (_e, dienstplanId: number, filePath: string) => {
    await excelExporter.exportDienstplan(dienstplanId, filePath)
  })

  ipcMain.handle(
    'excel:exportStatistiken',
    async (_e, von: string, bis: string, filePath: string) => {
      const daten = statistikService.getGesamt(von, bis)
      await excelExporter.exportStatistiken(daten, filePath)
    }
  )

  ipcMain.handle('excel:importWuensche', async (_e, filePath: string) => {
    return excelExporter.importWuensche(filePath)
  })

  // ===== DIALOGE =====
  ipcMain.handle('dialog:saveExcel', async (event) => {
    const win = event.sender
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('dialog:openExcel', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
