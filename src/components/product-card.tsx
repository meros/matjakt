import { Link } from 'react-router-dom'
import type { RetailerProductDoc, PriceDoc, ChainId } from '@/lib/types'
import { CHAINS } from '@/lib/types'

interface ProductCardProps {
  product: RetailerProductDoc
  latestPrice?: PriceDoc | null
}

export function ProductCard({ product, latestPrice }: ProductCardProps) {
  const chainId = product.chainId as ChainId
  const chain = CHAINS[chainId]

  return (
    <Link
      to={`/produkt/${product.id}`}
      className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="mb-3">
        <h3 className="text-base font-bold text-gray-900">{product.name}</h3>
        {product.brand && (
          <p className="text-sm text-gray-500">{product.brand}</p>
        )}
      </div>

      {latestPrice != null && (
        <div className="mb-3">
          <span className="text-3xl font-extrabold text-brand-700">
            {latestPrice.price.toFixed(2)}
          </span>
          <span className="ml-1 text-sm font-medium text-gray-500">kr</span>
          {latestPrice.ordinaryPrice != null &&
            latestPrice.ordinaryPrice > latestPrice.price && (
              <span className="ml-2 text-sm text-gray-400 line-through">
                {latestPrice.ordinaryPrice.toFixed(2)} kr
              </span>
            )}
        </div>
      )}

      {chain && (
        <div className="flex gap-1.5">
          <ChainBadge chainId={chainId} />
        </div>
      )}
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
