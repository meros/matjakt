import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import type { RetailerProductDoc, PriceDoc, ChainId } from '@/lib/types'
import { CHAINS } from '@/lib/types'
import { getProductById, getProductsByName, getLatestPrice } from '@/lib/api'
import { track } from '@/lib/firebase'
import { formatRelativeTime } from '@/lib/format'
import { PriceHistoryChart } from '@/components/price-history-chart'
import { parseQuantity, calculateUnitPrice } from '@/lib/normalizer'

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
  const location = useLocation()
  const fromQuery = (location.state as { fromQuery?: string } | null)?.fromQuery ?? ''

  const [mainProduct, setMainProduct] = useState<RetailerProductDoc | null>(
    null,
  )
  const [comparisons, setComparisons] = useState<ProductWithPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const backLink = fromQuery
    ? `/sok?q=${encodeURIComponent(fromQuery)}`
    : '/sok'

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
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-center text-gray-500">Laddar produkt...</p>
      </main>
    )
  }

  if (error || !mainProduct) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link
          to={backLink}
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
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link
        to={backLink}
        className="mb-6 inline-flex items-center text-sm text-brand-600 hover:text-brand-700"
      >
        &larr; Tillbaka till sökresultat
      </Link>

      <div className="mb-8 grid gap-8 lg:grid-cols-2">
        {/* Left column: product info + image */}
        <div>
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
          {mainProduct.quantityString && (
            <p className="text-base text-gray-500">{mainProduct.quantityString}</p>
          )}
          {mainProduct.brand && (
            <p className="text-base text-gray-500">{mainProduct.brand}</p>
          )}
        </div>

        {/* Right column: price comparison table */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-800">
            Prisjämförelse
          </h2>

          {comparisons.length === 0 ? (
            <p className="text-gray-500">Inga priser hittade</p>
          ) : (
            (() => {
              // Deduplicate: keep only the cheapest entry per chain
              const seen = new Map<string, number>()
              const deduped = comparisons.filter(({ product, price }, i) => {
                const prev = seen.get(product.chainId)
                if (prev !== undefined) {
                  // Keep if this one is cheaper
                  if (price && comparisons[prev]!.price && price.price < comparisons[prev]!.price!.price) {
                    seen.set(product.chainId, i)
                    return true
                  }
                  return false
                }
                seen.set(product.chainId, i)
                return true
              })

              return (
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
                    {deduped.map(({ product, price }, i) => {
                      const chainId = product.chainId as ChainId
                      const chain = CHAINS[chainId]
                      const isPromo =
                        price?.ordinaryPrice != null &&
                        price.ordinaryPrice > price.price

                      const qtySource = product.quantityString || product.name
                      const parsed = parseQuantity(qtySource)
                      const unitPriceInfo =
                        price && parsed ? calculateUnitPrice(price.price, parsed) : null

                      // Show chain-specific product name if different from main product
                      const chainProductName =
                        product.name !== mainProduct.name ? product.name : null

                      return (
                        <tr
                          key={product.id}
                          className={`border-b border-gray-100 ${i === 0 ? 'bg-brand-50' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`font-semibold ${chainTextClasses[chainId] ?? ''}`}
                              >
                                {chain?.displayName ?? product.chainId}
                              </span>
                              {product.url && (
                                <a
                                  href={product.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-400 hover:text-brand-600"
                                  title="Visa på kedjans webbplats"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    className="h-3.5 w-3.5"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Zm7.25-.938a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 1 1-1.06-1.06l5.22-5.22H12.25a.75.75 0 0 1-.75-.75Z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </a>
                              )}
                              {isPromo && (
                                <span className="inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                                  Kampanjpris
                                </span>
                              )}
                            </div>
                            {chainProductName && (
                              <p className="mt-0.5 text-xs text-gray-500">
                                {chainProductName}
                              </p>
                            )}
                            {price && (
                              <p className="mt-0.5 text-xs text-gray-400">
                                Senast sedd: {formatRelativeTime(price.scrapedAt)}
                              </p>
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
                          <td className="px-4 py-3 text-right">
                            {unitPriceInfo ? (
                              <span className="text-sm font-semibold text-gray-600">
                                {unitPriceInfo.unitPrice.toFixed(2).replace('.', ',')} {unitPriceInfo.unitLabel}
                              </span>
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
              )
            })()
          )}
        </section>
      </div>

      <PriceHistoryChart
        products={comparisons.map((c) => c.product)}
      />
    </main>
  )
}
