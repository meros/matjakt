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

  // Multi-level relevance scoring
  const queryLower = queryStr.trim().toLowerCase()

  const CATEGORY_HINTS: Record<string, string[]> = {
    'mjölk': ['mejeri', 'mjölk', 'dairy'],
    'smör': ['mejeri', 'smör', 'margarin'],
    'bröd': ['bröd', 'bageri', 'bread'],
    'ost': ['mejeri', 'ost', 'cheese'],
    'kött': ['kött', 'chark', 'meat'],
    'fisk': ['fisk', 'seafood', 'skaldjur'],
    'kaffe': ['kaffe', 'te', 'coffee'],
    'ris': ['skafferi', 'ris', 'rice'],
    'pasta': ['skafferi', 'pasta'],
  }

  const categoryHints = CATEGORY_HINTS[queryLower]

  function relevanceScore(p: RetailerProductDoc): number {
    const nameLower = p.name.toLowerCase()
    const catLower = p.category?.toLowerCase() ?? ''

    // Exact name match
    if (nameLower === queryLower) return 0
    // Name starts with query
    if (nameLower.startsWith(queryLower)) return 1
    // First word of name matches query
    const firstWord = nameLower.split(/\s+/)[0]
    if (firstWord === queryLower) return 2
    // Category matches food category hint for query
    if (categoryHints && categoryHints.some((hint) => catLower.includes(hint))) return 3
    // Query appears elsewhere in name
    return 4
  }

  results.sort((a, b) => relevanceScore(a) - relevanceScore(b))

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
 * Tar bort kvantitets-/storleksinformation från ett produktnamn.
 * Används för att gruppera storleksvarianter av samma produkt.
 *
 * Exempel:
 *   "Arla Mellanmjölk Längre Hållbarhet 1,5l" → "arla mellanmjölk längre hållbarhet"
 *   "Coca-Cola 4x330ml" → "coca-cola"
 *   "Nötfärs 12% 800 g" → "nötfärs 12%"
 *   "6-pack Ramlösa Citrus 33cl" → "ramlösa citrus"
 */
export function stripQuantityFromName(name: string): string {
  let n = normalizeProductName(name)
  // Ta bort multipack-prefix: "6-pack", "4x", "12 x" etc. (i början eller mitt av namn)
  n = n.replace(/\b\d+[\s-]*(?:pack|x)\b\s*/gi, '')
  // Ta bort mängd med multiplikator: "4x125 g", "6 x 33 cl"
  n = n.replace(/\b\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|cl|dl|l|liter|st)\b/gi, '')
  // Ta bort mängd + enhet: "1.5 l", "500 g", "330 ml", "1 kg" etc.
  n = n.replace(/\b(?:ca\.?\s*)?\d+(?:[.,]\d+)?\s*(?:g|kg|ml|cl|dl|l|liter|st)\b/gi, '')
  // Rensa extra mellanslag och trimma
  n = n.replace(/\s+/g, ' ').trim()
  return n
}

/**
 * Grupperar produkter. Använder EAN som primär grupperingsnyckel
 * (samma EAN = exakt samma produkt oavsett butiksnamn). Produkter
 * utan EAN grupperas efter normaliserat namn utan kvantitet, så att
 * storleksvarianter (t.ex. "Mjölk 1,5l" och "Mjölk 3l") hamnar
 * i samma grupp.
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
        baseName: stripQuantityFromName(product.name),
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
  // utan kvantitet, så storleksvarianter hamnar ihop
  for (const product of products.filter((p) => !p.ean)) {
    const key = `name:${stripQuantityFromName(product.name)}`
    addToGroup(key, product)
  }

  // Tredje passet: slå ihop EAN-grupper med samma basnamn (storleksvarianter)
  // T.ex. EAN för "Mjölk 1,5l" och EAN för "Mjölk 3l" → samma grupp
  // Om basnamnet är tomt (hela namnet var en kvantitet), använd normaliseratnamn istället
  const mergedGroups = new Map<string, ProductGroup>()
  for (const group of groups.values()) {
    const baseKey = group.baseName
      ? `base:${group.baseName}`
      : `full:${normalizeProductName(group.name)}`
    const existing = mergedGroups.get(baseKey)
    if (existing) {
      existing.entries.push(...group.entries)
      if (!existing.imageUrl && group.imageUrl) {
        existing.imageUrl = group.imageUrl
      }
      if (!existing.brand && group.brand) {
        existing.brand = group.brand
      }
    } else {
      mergedGroups.set(baseKey, { ...group })
    }
  }

  const result = Array.from(mergedGroups.values())

  // Sortera entries inom grupp: efter kvantitet (minst först)
  for (const group of result) {
    group.entries.sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0))
  }

  // Sortera grupper: flest kedjor först, sedan flest poster
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
