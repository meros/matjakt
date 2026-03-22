import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchForm } from '@/components/search-form'
import { ProductCard } from '@/components/product-card'
import type { ProductGroup, PriceDoc, ChainId } from '@/lib/types'
import { CHAINS } from '@/lib/types'
import { searchProducts, groupProducts, getLatestPrice } from '@/lib/api'
import { track } from '@/lib/firebase'
import { parseQuantity, calculateUnitPrice } from '@/lib/normalizer'

/** Pris per grupp: mappar retailerProduct-id till senaste pris */
type GroupPrices = Record<string, PriceDoc | null>

type SortOption = 'shelf_asc' | 'unit_asc' | 'price_desc' | 'chains'

function getLowestShelfPrice(group: ProductGroup, prices: GroupPrices): number {
  let min = Infinity
  for (const entry of group.entries) {
    const p = prices[entry.id]
    if (p && p.price < min) min = p.price
  }
  return min
}

function getLowestUnitPrice(group: ProductGroup, prices: GroupPrices): number {
  let min = Infinity
  for (const entry of group.entries) {
    const p = prices[entry.id]
    if (!p) continue
    const qSource = entry.quantityString || entry.name
    const parsed = parseQuantity(qSource)
    const upi = parsed ? calculateUnitPrice(p.price, parsed) : null
    if (upi && upi.unitPrice < min) min = upi.unitPrice
  }
  return min
}

const CHAIN_FILTERS: { id: 'alla' | ChainId; label: string }[] = [
  { id: 'alla', label: 'Alla' },
  { id: 'willys', label: 'Willys' },
  { id: 'hemkop', label: 'Hemköp' },
  { id: 'coop', label: 'Coop' },
  { id: 'citygross', label: 'City Gross' },
  { id: 'ica', label: 'ICA' },
]

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const queryStr = searchParams.get('q') ?? ''

  const [groups, setGroups] = useState<ProductGroup[]>([])
  const [prices, setPrices] = useState<GroupPrices>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortOption>('shelf_asc')
  const [chainFilter, setChainFilter] = useState<'alla' | ChainId>('alla')

  useEffect(() => {
    if (!queryStr.trim()) {
      setGroups([])
      setPrices({})
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    searchProducts(queryStr)
      .then(async (products) => {
        if (cancelled) return

        const grouped = groupProducts(products)
        setGroups(grouped)

        if (queryStr) {
          track.search(queryStr, grouped.length)
        }

        // Hämta senaste pris för alla entries i alla grupper
        const allEntries = grouped.flatMap((g) => g.entries)
        const priceEntries = await Promise.all(
          allEntries.map(async (p) => {
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

  const filteredAndSortedGroups = useMemo(() => {
    let filtered = groups
    if (chainFilter !== 'alla') {
      filtered = groups.filter((g) =>
        g.entries.some((e) => e.chainId === chainFilter),
      )
    }

    const sorted = [...filtered]
    switch (sort) {
      case 'shelf_asc':
        sorted.sort((a, b) => getLowestShelfPrice(a, prices) - getLowestShelfPrice(b, prices))
        break
      case 'unit_asc':
        sorted.sort((a, b) => getLowestUnitPrice(a, prices) - getLowestUnitPrice(b, prices))
        break
      case 'price_desc':
        sorted.sort((a, b) => getLowestShelfPrice(b, prices) - getLowestShelfPrice(a, prices))
        break
      case 'chains':
        sorted.sort((a, b) => {
          const chainsA = new Set(a.entries.map((e) => e.chainId)).size
          const chainsB = new Set(b.entries.map((e) => e.chainId)).size
          return chainsB - chainsA
        })
        break
    }
    return sorted
  }, [groups, prices, sort, chainFilter])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex justify-center">
        <SearchForm defaultValue={queryStr} />
      </div>

      {!queryStr.trim() && !loading && (
        <p className="text-center text-gray-500">
          Sök efter en produkt för att jämföra priser
        </p>
      )}

      {loading && (
        <p className="text-center text-gray-500">Söker...</p>
      )}

      {error && (
        <p className="text-center text-red-600">{error}</p>
      )}

      {!loading && !error && queryStr.trim() && (
        <>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg text-gray-700">
              <span className="font-semibold">{filteredAndSortedGroups.length}</span> resultat
              {queryStr && (
                <>
                  {' '}för &ldquo;<span className="font-medium">{queryStr}</span>
                  &rdquo;
                </>
              )}
            </h2>

            <div className="flex gap-1.5">
              {([
                ['shelf_asc', 'Lägsta pris'],
                ['unit_asc', 'Lägsta jämförpris'],
                ['price_desc', 'Högsta pris'],
                ['chains', 'Flest kedjor'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setSort(value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    sort === value
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {CHAIN_FILTERS.map(({ id, label }) => {
              const isActive = chainFilter === id
              const chainInfo = id !== 'alla' ? CHAINS[id] : null
              return (
                <button
                  key={id}
                  onClick={() => setChainFilter(id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={
                    isActive && chainInfo
                      ? { backgroundColor: chainInfo.color }
                      : isActive
                        ? { backgroundColor: '#4b5563' }
                        : undefined
                  }
                >
                  {label}
                </button>
              )
            })}
          </div>

          {filteredAndSortedGroups.length === 0 ? (
            <p className="text-center text-gray-500">
              Inga produkter hittade
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAndSortedGroups.map((group) => (
                <ProductCard
                  key={group.name}
                  group={group}
                  prices={prices}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
