import { Link } from 'react-router-dom'
import type { ProductWithPrices, ChainId } from '@/lib/types'
import { CHAINS } from '@/lib/types'

interface ProductCardProps {
  product: ProductWithPrices
}

export function ProductCard({ product }: ProductCardProps) {
  const chains = [...new Set(product.prices.map((p) => p.chainId))]
  const lowestPrice = product.prices.length
    ? Math.min(...product.prices.map((p) => p.priceSek))
    : null

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

      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold text-brand-700">
          {product.lowestUnitPrice != null
            ? product.lowestUnitPrice.toFixed(2)
            : '—'}
        </span>
        {product.unitLabel && (
          <span className="text-sm font-medium text-gray-500">
            {product.unitLabel}
          </span>
        )}
      </div>

      {lowestPrice != null && (
        <p className="mb-3 text-sm text-gray-600">
          Från <span className="font-semibold">{lowestPrice.toFixed(2)} kr</span>
        </p>
      )}

      <div className="flex gap-1.5">
        {chains.map((chainId) => (
          <ChainDot key={chainId} chainId={chainId} />
        ))}
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

function ChainDot({ chainId }: { chainId: ChainId }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white ${chainColorClasses[chainId]}`}
      title={CHAINS[chainId].displayName}
    >
      {CHAINS[chainId].displayName}
    </span>
  )
}
