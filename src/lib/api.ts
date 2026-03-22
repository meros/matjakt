import { db } from './firebase'
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  orderBy,
  limit,
} from 'firebase/firestore'
import type { RetailerProductDoc, PriceDoc } from './types'

const retailerProductsRef = collection(db, 'retailerProducts')

function docToRetailerProduct(
  d: import('firebase/firestore').DocumentSnapshot,
): RetailerProductDoc {
  const data = d.data()!
  return {
    id: d.id,
    chainId: data.chainId,
    externalId: data.externalId,
    name: data.name,
    brand: data.brand ?? undefined,
    ean: data.ean ?? undefined,
    unit: data.unit,
    quantity: data.quantity ?? undefined,
    quantityString: data.quantityString ?? undefined,
    imageUrl: data.imageUrl ?? undefined,
    url: data.url ?? undefined,
    category: data.category ?? undefined,
    lastScrapedAt: data.lastScrapedAt?.toDate() ?? undefined,
  }
}

/**
 * Search retailerProducts by name prefix.
 * If query is empty, returns recent products ordered by lastScrapedAt.
 */
export async function searchProducts(
  queryStr: string,
): Promise<RetailerProductDoc[]> {
  if (!queryStr.trim()) {
    const q = query(
      retailerProductsRef,
      orderBy('lastScrapedAt', 'desc'),
      limit(50),
    )
    const snap = await getDocs(q)
    return snap.docs.map(docToRetailerProduct)
  }

  // Firestore prefix search: name >= query AND name < query + '\uf8ff'
  // Try both original case and lowercase first letter
  const trimmed = queryStr.trim()
  const variants = new Set([
    trimmed,
    trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
    trimmed.charAt(0).toLowerCase() + trimmed.slice(1),
  ])

  const allResults = new Map<string, RetailerProductDoc>()

  for (const variant of variants) {
    const q = query(
      retailerProductsRef,
      where('name', '>=', variant),
      where('name', '<', variant + '\uf8ff'),
      limit(100),
    )
    const snap = await getDocs(q)
    for (const d of snap.docs) {
      if (!allResults.has(d.id)) {
        allResults.set(d.id, docToRetailerProduct(d))
      }
    }
  }

  return Array.from(allResults.values()).slice(0, 100)
}

/** Get a single retailerProduct by document ID */
export async function getProductById(
  docId: string,
): Promise<RetailerProductDoc | null> {
  const ref = doc(db, 'retailerProducts', docId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return docToRetailerProduct(snap)
}

/** Find retailerProducts with the exact same name (for cross-chain comparison) */
export async function getProductsByName(
  name: string,
): Promise<RetailerProductDoc[]> {
  const q = query(retailerProductsRef, where('name', '==', name), limit(20))
  const snap = await getDocs(q)
  return snap.docs.map(docToRetailerProduct)
}

/** Get most recent price from the prices subcollection */
export async function getLatestPrice(
  retailerProductId: string,
): Promise<PriceDoc | null> {
  const pricesRef = collection(
    db,
    'retailerProducts',
    retailerProductId,
    'prices',
  )
  const q = query(pricesRef, orderBy('scrapedAt', 'desc'), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const data = snap.docs[0]!.data()
  return {
    price: data.price,
    ordinaryPrice: data.ordinaryPrice ?? undefined,
    scrapedAt: data.scrapedAt?.toDate() ?? new Date(),
  }
}

/** Get price history for a retailerProduct (most recent N entries) */
export async function getPriceHistory(
  retailerProductId: string,
  maxEntries = 100,
): Promise<PriceDoc[]> {
  const pricesRef = collection(
    db,
    'retailerProducts',
    retailerProductId,
    'prices',
  )
  const q = query(pricesRef, orderBy('scrapedAt', 'asc'), limit(maxEntries))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      price: data.price,
      ordinaryPrice: data.ordinaryPrice ?? undefined,
      scrapedAt: data.scrapedAt?.toDate() ?? new Date(),
    }
  })
}
