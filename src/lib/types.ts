/** Firestore document types */

export interface Product {
  id: string
  ean?: string
  name: string
  brand?: string
  category?: string
  imageUrl?: string
}

export type ChainId = 'ica' | 'willys' | 'coop' | 'hemkop' | 'lidl' | 'citygross'

export interface ChainInfo {
  id: ChainId
  displayName: string
  color: string
}

export const CHAINS: Record<ChainId, ChainInfo> = {
  ica: { id: 'ica', displayName: 'ICA', color: '#e3000b' },
  willys: { id: 'willys', displayName: 'Willys', color: '#e30613' },
  coop: { id: 'coop', displayName: 'Coop', color: '#00aa46' },
  hemkop: { id: 'hemkop', displayName: 'Hemköp', color: '#ffd100' },
  lidl: { id: 'lidl', displayName: 'Lidl', color: '#0050aa' },
  citygross: { id: 'citygross', displayName: 'City Gross', color: '#e4002b' },
}

export interface RetailerProduct {
  id: string
  productId?: string
  chainId: ChainId
  externalId: string
  name: string
  url?: string
}

export interface Price {
  retailerProductId: string
  chainId: ChainId
  priceSek: number
  ordinaryPriceSek?: number
  unit: string
  unitPriceSek?: number
  quantity?: number
  observedAt: Date
}

/** Product with aggregated prices across chains */
export interface ProductWithPrices extends Product {
  prices: Price[]
  lowestUnitPrice?: number
  unitLabel?: string
}
