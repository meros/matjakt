import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { RetailerProductDoc, PriceDoc, ChainId } from '@/lib/types'
import { CHAINS } from '@/lib/types'
import { getProductById, getProductsByName, getLatestPrice } from '@/lib/api'
import { track } from '@/lib/firebase'

const chainTextClasses: Record<ChainId, string> = {
  ica: 'text-chain-ica',
  willys: 'text-chain-willys',
  coop: 'text-chain-coop',
  hemkop: 'text-chain-hemkop',
  lidl: 'text-chain-lidl',
  citygross: 'text-chain-citygross',
}

interface ProductWithPrice {
  product: RetailerProductDoc
  price: PriceDoc | null
}

export function ProductPage() {
  const { id } = useParams<{ id: string }>()

  const [mainProduct, setMainProduct] = useState<RetailerProductDoc | null>(
    null,
  )
  const [comparisons, setComparisons] = useState<ProductWithPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const product = await getProductById(id!)
        if (cancelled) return
        if (!product) {
          setError('Produkten hittades inte')
          setLoading(false)
          return
        }

        setMainProduct(product)
        track.viewProduct(product.id, product.name)

        // Fetch similar products across chains with the same name
        const similar = await getProductsByName(product.name)
        if (cancelled) return

        // Fetch prices for all (including main product)
        const withPrices = await Promise.all(
          similar.map(async (p) => ({
            product: p,
            price: await getLatestPrice(p.id),
          })),
        )
        if (cancelled) return

        // Sort by price (lowest first), products without price last
        withPrices.sort((a, b) => {
          if (!a.price) return 1
          if (!b.price) return -1
          return a.price.price - b.price.price
        })

        setComparisons(withPrices)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load product:', err)
          setError('Kunde inte hämta produktinformation. Försök igen.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-center text-gray-500">Laddar produkt...</p>
      </main>
    )
  }

  if (error || !mainProduct) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link
          to="/sok"
          className="mb-6 inline-flex items-center text-sm text-brand-600 hover:text-brand-700"
        >
          &larr; Tillbaka till sökresultat
        </Link>
        <p className="text-center text-red-600">
          {error ?? 'Produkten hittades inte'}
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/sok"
        className="mb-6 inline-flex items-center text-sm text-brand-600 hover:text-brand-700"
      >
        &larr; Tillbaka till sökresultat
      </Link>

      <div className="mb-8">
        {mainProduct.imageUrl ? (
          <div className="mb-4 flex h-48 items-center justify-center rounded-xl bg-gray-100">
            <img
              src={mainProduct.imageUrl}
              alt={mainProduct.name}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="mb-4 flex h-48 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
            Produktbild saknas
          </div>
        )}
        <h1 className="text-2xl font-bold text-gray-900">
          {mainProduct.name}
        </h1>
        {mainProduct.brand && (
          <p className="text-base text-gray-500">{mainProduct.brand}</p>
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Prisjämförelse
        </h2>

        {comparisons.length === 0 ? (
          <p className="text-gray-500">Inga priser hittade</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-sm text-gray-500">
                  <th className="px-4 py-3 font-medium">Kedja</th>
                  <th className="px-4 py-3 font-medium text-right">Pris</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map(({ product, price }, i) => {
                  const chainId = product.chainId as ChainId
                  const chain = CHAINS[chainId]
                  const isPromo =
                    price?.ordinaryPrice != null &&
                    price.ordinaryPrice > price.price

                  return (
                    <tr
                      key={product.id}
                      className={`border-b border-gray-100 ${i === 0 ? 'bg-brand-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${chainTextClasses[chainId] ?? ''}`}
                        >
                          {chain?.displayName ?? product.chainId}
                        </span>
                        {isPromo && (
                          <span className="ml-2 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                            Kampanjpris
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {price ? (
                          <>
                            <span
                              className={`text-lg font-bold ${i === 0 ? 'text-brand-700' : 'text-gray-900'}`}
                            >
                              {price.price.toFixed(2)} kr
                            </span>
                            {isPromo && (
                              <span className="ml-1 text-xs text-gray-400 line-through">
                                {price.ordinaryPrice!.toFixed(2)} kr
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-gray-400">
        Prishistorik kommer snart
      </section>
    </main>
  )
}
