import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { ProductWithPrices, ChainId } from '@/lib/types'
import { CHAINS } from '@/lib/types'
import { track } from '@/lib/firebase'

const chainTextClasses: Record<ChainId, string> = {
  ica: 'text-chain-ica',
  willys: 'text-chain-willys',
  coop: 'text-chain-coop',
  hemkop: 'text-chain-hemkop',
  lidl: 'text-chain-lidl',
  citygross: 'text-chain-citygross',
}

const MOCK_PRODUCT: ProductWithPrices = {
  id: '1',
  name: 'Arla Svenskt Smör 500g',
  brand: 'Arla',
  prices: [
    { retailerProductId: 'r1', chainId: 'willys', priceSek: 55.9, unit: 'g', quantity: 500, unitPriceSek: 11.18, observedAt: new Date() },
    { retailerProductId: 'r2', chainId: 'ica', priceSek: 59.9, unit: 'g', quantity: 500, unitPriceSek: 11.98, observedAt: new Date() },
    { retailerProductId: 'r3', chainId: 'coop', priceSek: 62.5, unit: 'g', quantity: 500, unitPriceSek: 12.5, observedAt: new Date() },
    { retailerProductId: 'r4', chainId: 'hemkop', priceSek: 64.9, unit: 'g', quantity: 500, unitPriceSek: 12.98, ordinaryPriceSek: 69.9, observedAt: new Date() },
    { retailerProductId: 'r5', chainId: 'lidl', priceSek: 52.9, unit: 'g', quantity: 500, unitPriceSek: 10.58, observedAt: new Date() },
  ],
  lowestUnitPrice: 10.58,
  unitLabel: 'kr/100g',
}

export function ProductPage() {
  const { id } = useParams<{ id: string }>()

  // Mock: always return the same product for now
  const product: ProductWithPrices = { ...MOCK_PRODUCT, id: id ?? '1' }

  useEffect(() => {
    track.viewProduct(product.id, product.name)
  }, [product.id, product.name])
  const sortedPrices = [...product.prices].sort(
    (a, b) => (a.unitPriceSek ?? Infinity) - (b.unitPriceSek ?? Infinity),
  )

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/sok"
        className="mb-6 inline-flex items-center text-sm text-brand-600 hover:text-brand-700"
      >
        &larr; Tillbaka till sökresultat
      </Link>

      <div className="mb-8">
        <div className="mb-4 flex h-48 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
          Produktbild saknas
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
        {product.brand && (
          <p className="text-base text-gray-500">{product.brand}</p>
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Prisjämförelse
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-sm text-gray-500">
                <th className="px-4 py-3 font-medium">Kedja</th>
                <th className="px-4 py-3 font-medium text-right">Pris</th>
                <th className="px-4 py-3 font-medium text-right">Jämförpris</th>
              </tr>
            </thead>
            <tbody>
              {sortedPrices.map((price, i) => {
                const isPromo =
                  price.ordinaryPriceSek != null &&
                  price.priceSek < price.ordinaryPriceSek
                return (
                  <tr
                    key={price.retailerProductId}
                    className={`border-b border-gray-100 ${i === 0 ? 'bg-brand-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${chainTextClasses[price.chainId]}`}
                      >
                        {CHAINS[price.chainId].displayName}
                      </span>
                      {isPromo && (
                        <span className="ml-2 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                          Kampanjpris
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium">
                        {price.priceSek.toFixed(2)} kr
                      </span>
                      {isPromo && (
                        <span className="ml-1 text-xs text-gray-400 line-through">
                          {price.ordinaryPriceSek!.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-lg font-bold ${i === 0 ? 'text-brand-700' : 'text-gray-900'}`}
                      >
                        {price.unitPriceSek != null
                          ? price.unitPriceSek.toFixed(2)
                          : '—'}
                      </span>
                      {product.unitLabel && (
                        <span className="ml-1 text-xs text-gray-500">
                          {product.unitLabel}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-gray-400">
        Prishistorik kommer snart
      </section>
    </main>
  )
}
