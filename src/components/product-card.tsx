import { Link, useSearchParams } from 'react-router-dom'
import type { ProductGroup, PriceDoc, ChainId } from '@/lib/types'
import { CHAINS } from '@/lib/types'
import { formatRelativeTime } from '@/lib/format'
import { parseQuantity, calculateUnitPrice } from '@/lib/normalizer'

interface ProductCardProps {
  group: ProductGroup
  /** Priser indexerade på retailerProduct-id */
  prices: Record<string, PriceDoc | null>
}

export function ProductCard({ group, prices }: ProductCardProps) {
  const [searchParams] = useSearchParams()
  const currentQuery = searchParams.get('q') ?? ''

  // Beräkna bästa enhetspris per entry (för att hitta billigaste varianten totalt)
  let cheapestEntry = group.entries[0]!
  let cheapestPrice: PriceDoc | null = null
  let bestUnitPriceInfo: { unitPrice: number; unitLabel: string } | null = null

  for (const entry of group.entries) {
    const price = prices[entry.id]
    if (!price) continue

    const qSource = entry.quantityString || entry.name
    const parsed = parseQuantity(qSource)
    const upi = parsed ? calculateUnitPrice(price.price, parsed) : null

    // Jämför med bästa enhetspris, eller fallback på lägsta kronpris
    if (upi && bestUnitPriceInfo) {
      if (upi.unitPrice < bestUnitPriceInfo.unitPrice) {
        bestUnitPriceInfo = upi
        cheapestPrice = price
        cheapestEntry = entry
      }
    } else if (upi && !bestUnitPriceInfo) {
      bestUnitPriceInfo = upi
      cheapestPrice = price
      cheapestEntry = entry
    } else if (!cheapestPrice || price.price < cheapestPrice.price) {
      cheapestPrice = price
      cheapestEntry = entry
    }
  }

  // Länka till billigaste entryn, preserve search query in state
  const linkTo = `/produkt/${cheapestEntry.id}`

  // Samla unika storleksvarianter
  const sizeVariants = collectSizeVariants(group.entries)

  // Visa basnamn om det finns varianter, annars originalnamnet
  const displayName = sizeVariants.length > 1
    ? capitalizeFirst(group.baseName)
    : group.name

  // Unique chains for badges
  const uniqueChains = [...new Set(group.entries.map((e) => e.chainId as ChainId))]

  // Calculate savings
  const savings = cheapestPrice?.ordinaryPrice != null &&
    cheapestPrice.ordinaryPrice > cheapestPrice.price
    ? cheapestPrice.ordinaryPrice - cheapestPrice.price
    : null

  return (
    <Link
      to={linkTo}
      state={{ fromQuery: currentQuery }}
      className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="flex gap-4">
        {group.imageUrl && (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-50">
            <img
              src={group.imageUrl}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        <div className="mb-3 min-w-0">
          <h3 className="text-base font-bold text-gray-900">{displayName}</h3>
          {sizeVariants.length > 1 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {sizeVariants.map((size) => (
                <span
                  key={size}
                  className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                >
                  {size}
                </span>
              ))}
            </div>
          ) : (
            cheapestEntry.quantityString && (
              <p className="text-sm text-gray-500">{cheapestEntry.quantityString}</p>
            )
          )}
          {group.brand && (
            <p className="text-sm text-gray-500">{group.brand}</p>
          )}
        </div>
      </div>

      {bestUnitPriceInfo && (
        <div className="mb-2">
          <span className="text-3xl font-extrabold text-brand-700">
            {bestUnitPriceInfo.unitPrice.toFixed(2).replace('.', ',')}
          </span>
          <span className="ml-1 text-sm font-medium text-gray-500">
            {bestUnitPriceInfo.unitLabel}
          </span>
        </div>
      )}

      {cheapestPrice != null && (
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div>
              <span className={bestUnitPriceInfo ? 'text-lg font-bold text-gray-700' : 'text-3xl font-extrabold text-brand-700'}>
                {cheapestPrice.price.toFixed(2)}
              </span>
              <span className="ml-1 text-sm font-medium text-gray-500">kr</span>
              {cheapestPrice.ordinaryPrice != null &&
                cheapestPrice.ordinaryPrice > cheapestPrice.price && (
                  <span className="ml-2 text-sm text-gray-400 line-through">
                    {cheapestPrice.ordinaryPrice.toFixed(2)} kr
                  </span>
                )}
              {group.entries.length > 1 && (
                <span className="ml-2 text-xs text-gray-400">lägsta pris</span>
              )}
            </div>
            {savings != null && (
              <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                Spara {savings.toFixed(0)} kr
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-400">
            Uppdaterad {formatRelativeTime(cheapestPrice.scrapedAt)}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {uniqueChains.map((chainId) => (
          <ChainBadge key={chainId} chainId={chainId} />
        ))}
        {uniqueChains.length > 1 && (
          <span className="text-xs text-gray-500">
            Finns i {uniqueChains.length} kedjor
          </span>
        )}
      </div>
    </Link>
  )
}

/** Samlar unika storlekssträngar från entries */
function collectSizeVariants(entries: ProductCardProps['group']['entries']): string[] {
  const sizes = new Set<string>()
  for (const entry of entries) {
    const qs = entry.quantityString?.trim()
    if (qs) sizes.add(qs)
  }
  // Sortera efter numeriskt värde
  return [...sizes].sort((a, b) => {
    const numA = parseFloat(a.replace(',', '.').replace(/[^\d.]/g, '')) || 0
    const numB = parseFloat(b.replace(',', '.').replace(/[^\d.]/g, '')) || 0
    return numA - numB
  })
}

/** Gör första bokstaven versal i en sträng */
function capitalizeFirst(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const chainColorClasses: Record<ChainId, string> = {
  ica: 'bg-chain-ica',
  willys: 'bg-chain-willys',
  coop: 'bg-chain-coop',
  hemkop: 'bg-chain-hemkop',
  lidl: 'bg-chain-lidl',
  citygross: 'bg-chain-citygross',
}

function ChainBadge({ chainId }: { chainId: ChainId }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white ${chainColorClasses[chainId] ?? 'bg-gray-500'}`}
      title={CHAINS[chainId]?.displayName ?? chainId}
    >
      {CHAINS[chainId]?.displayName ?? chainId}
    </span>
  )
}
