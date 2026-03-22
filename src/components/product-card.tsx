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

  // Hitta billigaste priset och vilken entry det tillhör
  let cheapestEntry = group.entries[0]!
  let cheapestPrice: PriceDoc | null = null

  for (const entry of group.entries) {
    const price = prices[entry.id]
    if (price && (!cheapestPrice || price.price < cheapestPrice.price)) {
      cheapestPrice = price
      cheapestEntry = entry
    }
  }

  // Länka till billigaste entryn, preserve search query in state
  const linkTo = `/produkt/${cheapestEntry.id}`

  // Parse quantity from quantityString or product name
  const quantitySource =
    cheapestEntry.quantityString || group.entries.find((e) => e.quantityString)?.quantityString || group.name
  const parsed = parseQuantity(quantitySource)
  const unitPriceInfo =
    cheapestPrice && parsed ? calculateUnitPrice(cheapestPrice.price, parsed) : null

  // Display quantity string
  const displayQuantity =
    cheapestEntry.quantityString || group.entries.find((e) => e.quantityString)?.quantityString || null

  // Unique chains for badges
  const uniqueChains = [...new Set(group.entries.map((e) => e.chainId as ChainId))]

  return (
    <Link
      to={linkTo}
      state={{ fromQuery: currentQuery }}
      className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex gap-4">
        {group.imageUrl && (
          <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-lg bg-gray-50">
            <img
              src={group.imageUrl}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        <div className="mb-3 min-w-0">
          <h3 className="text-base font-bold text-gray-900">{group.name}</h3>
          {displayQuantity && (
            <p className="text-sm text-gray-500">{displayQuantity}</p>
          )}
          {group.brand && (
            <p className="text-sm text-gray-500">{group.brand}</p>
          )}
        </div>
      </div>

      {unitPriceInfo && (
        <div className="mb-2">
          <span className="text-2xl font-extrabold text-brand-700">
            {unitPriceInfo.unitPrice.toFixed(2).replace('.', ',')}
          </span>
          <span className="ml-1 text-sm font-medium text-gray-500">
            {unitPriceInfo.unitLabel}
          </span>
        </div>
      )}

      {cheapestPrice != null && (
        <div className="mb-3">
          <div>
            <span className={unitPriceInfo ? 'text-lg font-bold text-gray-700' : 'text-3xl font-extrabold text-brand-700'}>
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
