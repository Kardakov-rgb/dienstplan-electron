/// <reference types="vite/client" />

import { IpcApi } from '../../shared/types'

declare global {
  interface Window {
    api: IpcApi & {
      dienstplaeneGetDienste: (dienstplanId: number) => Promise<import('../../shared/types').Dienst[]>
    }
  }
}
