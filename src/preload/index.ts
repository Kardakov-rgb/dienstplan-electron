import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Personen
  personsGetAll: () => ipcRenderer.invoke('persons:getAll'),
  personsCreate: (person: unknown) => ipcRenderer.invoke('persons:create', person),
  personsUpdate: (person: unknown) => ipcRenderer.invoke('persons:update', person),
  personsDelete: (id: number) => ipcRenderer.invoke('persons:delete', id),

  // Dienstpläne
  dienstplaeneGetAll: () => ipcRenderer.invoke('dienstplaene:getAll'),
  dienstplaeneForMonat: (monatJahr: string) =>
    ipcRenderer.invoke('dienstplaene:forMonat', monatJahr),
  dienstplaeneSave: (dienstplan: unknown, dienste: unknown) =>
    ipcRenderer.invoke('dienstplaene:save', dienstplan, dienste),
  dienstplaeneDelete: (id: number) => ipcRenderer.invoke('dienstplaene:delete', id),
  dienstplaeneGenerate: (monatJahr: string, dienstplanName: string) =>
    ipcRenderer.invoke('dienstplaene:generate', monatJahr, dienstplanName),
  dienstplaeneGetDienste: (dienstplanId: number) =>
    ipcRenderer.invoke('dienstplaene:getDienste', dienstplanId),
  onGenerateProgress: (callback: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: number): void => callback(value)
    ipcRenderer.on('dienstplaene:generate:progress', handler)
    return () => ipcRenderer.removeListener('dienstplaene:generate:progress', handler)
  },

  // Wünsche
  wuenscheForMonat: (monatJahr: string) => ipcRenderer.invoke('wuensche:forMonat', monatJahr),
  wuenscheCreate: (wunsch: unknown) => ipcRenderer.invoke('wuensche:create', wunsch),
  wuenscheCreateBatch: (wuensche: unknown) => ipcRenderer.invoke('wuensche:createBatch', wuensche),
  wuenscheDelete: (id: number) => ipcRenderer.invoke('wuensche:delete', id),

  // Statistiken
  statistikenGesamt: (von: string, bis: string) =>
    ipcRenderer.invoke('statistiken:gesamt', von, bis),
  statistikenFairness: () => ipcRenderer.invoke('statistiken:fairness'),

  // Excel
  excelExportDienstplan: (dienstplanId: number, filePath: string) =>
    ipcRenderer.invoke('excel:exportDienstplan', dienstplanId, filePath),
  excelExportStatistiken: (von: string, bis: string, filePath: string) =>
    ipcRenderer.invoke('excel:exportStatistiken', von, bis, filePath),
  excelImportWuensche: (filePath: string) =>
    ipcRenderer.invoke('excel:importWuensche', filePath),

  // Dialoge
  dialogSaveExcel: () => ipcRenderer.invoke('dialog:saveExcel'),
  dialogOpenExcel: () => ipcRenderer.invoke('dialog:openExcel')
})
