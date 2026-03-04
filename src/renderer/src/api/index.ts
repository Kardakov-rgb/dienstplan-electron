import { IpcApi } from '../../../shared/types'
import { webApi } from './webApi'

// In Electron wird window.api vom Preload-Script gesetzt.
// Im Browser ist window.api undefined → webApi (Dexie/IndexedDB) wird verwendet.
export function getApi(): IpcApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const electronApi = (window as any).api
  return (electronApi ?? webApi) as IpcApi
}
