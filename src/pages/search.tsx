import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchForm } from '@/components/search-form'
import { ProductCard } from '@/components/product-card'
import type { RetailerProductDoc, PriceDoc } from '@/lib/types'
import { searchProducts, getLatestPrice } from '@/lib/api'
import { track } from '@/lib/firebase'

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const queryStr = searchParams.get('q') ?? ''

  const [results, setResults] = useState<RetailerProductDoc[]>([])
  const [prices, setPrices] = useState<Record<string, PriceDoc | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    searchProducts(queryStr)
      .then(async (products) => {
        if (cancelled) return
        setResults(products)

        if (queryStr) {
          track.search(queryStr, products.length)
        }

        // Fetch latest price for each product
        const priceEntries = await Promise.all(
          products.map(async (p) => {
            const price = await getLatestPrice(p.id)
            return [p.id, price] as const
          }),
        )
        if (!cancelled) {
          setPrices(Object.fromEntries(priceEntries))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Search failed:', err)
          setError('Kunde inte hämta produkter. Försök igen.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [queryStr])

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex justify-center">
        <SearchForm defaultValue={queryStr} />
      </div>

      {loading && (
        <p className="text-center text-gray-500">Söker...</p>
      )}

      {error && (
        <p className="text-center text-red-600">{error}</p>
      )}

      {!loading && !error && (
        <>
          <h2 className="mb-6 text-lg text-gray-700">
            <span className="font-semibold">{results.length}</span> resultat
            {queryStr && (
              <>
                {' '}för &ldquo;<span className="font-medium">{queryStr}</span>
                &rdquo;
              </>
            )}
          </h2>

          {results.length === 0 ? (
            <p className="text-center text-gray-500">
              Inga produkter hittade
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  latestPrice={prices[product.id]}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
