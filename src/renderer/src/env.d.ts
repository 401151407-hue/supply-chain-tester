import type { SupplyChainTesterAPI } from '../preload/index'

declare global {
  interface Window {
    supplyChainTester: SupplyChainTesterAPI
  }
}

export {}
