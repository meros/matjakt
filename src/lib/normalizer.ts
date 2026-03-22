/**
 * Normalizes Swedish grocery quantity strings to canonical form.
 *
 * Examples:
 *   "500 g" → { quantity: 500, unit: "g" }
 *   "6-pack 330 ml" → { quantity: 1980, unit: "ml" }
 *   "ca 400g" → { quantity: 400, unit: "g" }
 *   "4 x 125 g" → { quantity: 500, unit: "g" }
 */

export interface NormalizedQuantity {
  quantity: number
  unit: 'g' | 'kg' | 'ml' | 'l' | 'st'
  canonicalQuantity: number
  canonicalUnit: 'g' | 'ml' | 'st'
}

const QUANTITY_PATTERN =
  /(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*(?:(?:x|-pack)\s+(\d+(?:[,.]\d+)?)\s*)?\s*(g|kg|ml|cl|dl|l|liter|st)\b/i

function parseSwedishNumber(s: string): number {
  return parseFloat(s.replace(',', '.'))
}

export function parseQuantity(input: string): NormalizedQuantity | null {
  const match = input.match(QUANTITY_PATTERN)
  if (!match) return null

  const num1 = parseSwedishNumber(match[1]!)
  const num2 = match[2] ? parseSwedishNumber(match[2]) : null
  const rawUnit = match[3]!.toLowerCase()

  let quantity = num2 !== null ? num1 * num2 : num1
  let unit: NormalizedQuantity['unit']

  switch (rawUnit) {
    case 'kg': unit = 'kg'; break
    case 'g': unit = 'g'; break
    case 'l': case 'liter': unit = 'l'; break
    case 'dl': quantity *= 100; unit = 'ml'; break
    case 'cl': quantity *= 10; unit = 'ml'; break
    case 'ml': unit = 'ml'; break
    case 'st': unit = 'st'; break
    default: return null
  }

  let canonicalQuantity: number
  let canonicalUnit: NormalizedQuantity['canonicalUnit']

  switch (unit) {
    case 'kg': canonicalQuantity = quantity * 1000; canonicalUnit = 'g'; break
    case 'g': canonicalQuantity = quantity; canonicalUnit = 'g'; break
    case 'l': canonicalQuantity = quantity * 1000; canonicalUnit = 'ml'; break
    case 'ml': canonicalQuantity = quantity; canonicalUnit = 'ml'; break
    case 'st': canonicalQuantity = quantity; canonicalUnit = 'st'; break
  }

  return { quantity, unit, canonicalQuantity, canonicalUnit }
}

export function calculateUnitPrice(
  priceSek: number,
  parsed: NormalizedQuantity,
): { unitPrice: number; unitLabel: string } | null {
  if (parsed.canonicalUnit === 'st') return { unitPrice: priceSek, unitLabel: 'kr/st' }
  if (parsed.canonicalUnit === 'g') return { unitPrice: (priceSek / parsed.canonicalQuantity) * 100, unitLabel: 'kr/100g' }
  if (parsed.canonicalUnit === 'ml') return { unitPrice: (priceSek / parsed.canonicalQuantity) * 1000, unitLabel: 'kr/l' }
  return null
}
