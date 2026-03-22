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
import type { RetailerProductDoc, PriceDoc, ProductGroup } from './types'

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
 * Search retailerProducts using searchTokens (array-contains).
 * First word → Firestore array-contains, remaining words → client-side filter on nameLower.
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

  const words = queryStr
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0)

  if (words.length === 0) return []

  // Firestore only allows one array-contains per query — use the first word
  const firstWord = words[0]!
  const q = query(
    retailerProductsRef,
    where('searchTokens', 'array-contains', firstWord),
    limit(200),
  )
  const snap = await getDocs(q)
  let results = snap.docs.map(docToRetailerProduct)

  // Client-side filter for remaining words using nameLower from the doc data
  if (words.length > 1) {
    const remainingWords = words.slice(1)
    results = results.filter((p) => {
      const nameLower = p.name.toLowerCase()
      return remainingWords.every((w) => nameLower.includes(w))
    })
  }

  // Filter out pet food, baby food, and animal-related products
  const excludeKeywords = [
    // Djurmat
    'djur', 'hund', 'hundmat', 'katt', 'kattmat', 'fågel', 'husdjur',
    'torrfoder', 'våtfoder', 'hundgodis', 'kattgodis', 'paté hund',
    'paté katt', 'vov ', 'doggy',
    // Barnmat (specifikt för bebisar)
    'barnmat', 'från 4 mån', 'från 6 mån', 'från 8 mån',
    '4 mån', '6 mån', '8 mån', '12 mån',
  ]
  results = results.filter((p) => {
    const nameLower = p.name.toLowerCase()
    const catLower = p.category?.toLowerCase() ?? ''
    const brandLower = p.brand?.toLowerCase() ?? ''
    const combined = `${nameLower} ${catLower} ${brandLower}`
    return !excludeKeywords.some((kw) => combined.includes(kw))
  })

  // Boost relevance: products where query appears at start of name rank higher
  const queryLower = queryStr.trim().toLowerCase()
  results.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(queryLower) ? 0 : 1
    const bStarts = b.name.toLowerCase().startsWith(queryLower) ? 0 : 1
    return aStarts - bStarts
  })

  return results
}

/**
 * Normaliserar ett produktnamn för grupperingsändamål.
 * Tar bort varumärkessymboler, normaliserar siffror och enheter.
 */
export function normalizeProductName(name: string): string {
  let n = name.toLowerCase()
  // Ta bort ®, ™, ©
  n = n.replace(/[®™©]/g, '')
  // Normalisera whitespace
  n = n.replace(/\s+/g, ' ').trim()
  // Normalisera komma till punkt i siffror (1,5 → 1.5)
  n = n.replace(/(\d),(\d)/g, '$1.$2')
  // Normalisera enhetsformatering: "1.5l" → "1.5 l", "500g" → "500 g"
  n = n.replace(/(\d)(g|kg|ml|cl|dl|l|liter|st)\b/gi, '$1 $2')
  // Normalisera "liter" → "l"
  n = n.replace(/\bliter\b/g, 'l')
  // Rensa extra mellanslag
  n = n.replace(/\s+/g, ' ').trim()
  return n
}

/**
 * Grupperar produkter. Använder EAN som primär grupperingsnyckel
 * (samma EAN = exakt samma produkt oavsett butiksnamn). Produkter
 * utan EAN grupperas efter normaliserat namn som fallback.
 *
 * Returnerar ProductGroup[] sorterade efter antal kedjor (mest först).
 */
export function groupProducts(products: RetailerProductDoc[]): ProductGroup[] {
  const eanToGroupKey = new Map<string, string>()
  const groups = new Map<string, ProductGroup>()

  function addToGroup(key: string, product: RetailerProductDoc) {
    const existing = groups.get(key)
    if (existing) {
      existing.entries.push(product)
      if (!existing.imageUrl && product.imageUrl) {
        existing.imageUrl = product.imageUrl
      }
      if (!existing.brand && product.brand) {
        existing.brand = product.brand
      }
      if (!existing.ean && product.ean) {
        existing.ean = product.ean
      }
    } else {
      groups.set(key, {
        name: product.name,
        brand: product.brand,
        imageUrl: product.imageUrl,
        ean: product.ean,
        category: product.category,
        entries: [product],
      })
    }
  }

  // Första passet: produkter med EAN grupperas efter EAN
  for (const product of products.filter((p) => p.ean)) {
    const ean = product.ean!
    const existingKey = eanToGroupKey.get(ean)
    if (existingKey) {
      addToGroup(existingKey, product)
    } else {
      const key = `ean:${ean}`
      eanToGroupKey.set(ean, key)
      addToGroup(key, product)
    }
  }

  // Andra passet: produkter utan EAN grupperas efter normaliserat namn
  for (const product of products.filter((p) => !p.ean)) {
    const key = `name:${normalizeProductName(product.name)}`
    addToGroup(key, product)
  }

  const result = Array.from(groups.values())
  // Sortera: flest kedjor först, sedan flest poster
  result.sort((a, b) => {
    const chainsA = new Set(a.entries.map((e) => e.chainId)).size
    const chainsB = new Set(b.entries.map((e) => e.chainId)).size
    if (chainsB !== chainsA) return chainsB - chainsA
    return b.entries.length - a.entries.length
  })
  return result
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
