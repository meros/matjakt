/** Firestore document types */

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

/** Document from `retailerProducts` collection */
export interface RetailerProductDoc {
  id: string
  chainId: string
  externalId: string
  name: string
  brand?: string
  ean?: string
  unit: string
  quantity?: number
  quantityString?: string
  imageUrl?: string
  url?: string
  category?: string
  lastScrapedAt?: Date
}

/** Grupperad produkt med poster från flera butikskedjor */
export interface ProductGroup {
  name: string
  brand?: string
  imageUrl?: string
  ean?: string
  category?: string
  entries: RetailerProductDoc[]
}

/** Document from `retailerProducts/{id}/prices` subcollection */
export interface PriceDoc {
  price: number
  ordinaryPrice?: number | null
  scrapedAt: Date
}
