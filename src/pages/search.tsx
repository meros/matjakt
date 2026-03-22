import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchForm } from '@/components/search-form'
import { ProductCard } from '@/components/product-card'
import type { ProductWithPrices } from '@/lib/types'
import { track } from '@/lib/firebase'

const MOCK_PRODUCTS: ProductWithPrices[] = [
  {
    id: '1',
    name: 'Arla Svenskt Smör 500g',
    brand: 'Arla',
    prices: [
      { retailerProductId: 'r1', chainId: 'ica', priceSek: 59.9, unit: 'g', quantity: 500, observedAt: new Date() },
      { retailerProductId: 'r2', chainId: 'coop', priceSek: 62.5, unit: 'g', quantity: 500, observedAt: new Date() },
      { retailerProductId: 'r3', chainId: 'willys', priceSek: 55.9, unit: 'g', quantity: 500, observedAt: new Date() },
    ],
    lowestUnitPrice: 11.18,
    unitLabel: 'kr/100g',
  },
  {
    id: '2',
    name: 'Garant Havregrynsgröt 1,5 kg',
    brand: 'Garant',
    prices: [
      { retailerProductId: 'r4', chainId: 'willys', priceSek: 19.9, unit: 'kg', quantity: 1.5, observedAt: new Date() },
      { retailerProductId: 'r5', chainId: 'hemkop', priceSek: 22.9, unit: 'kg', quantity: 1.5, observedAt: new Date() },
    ],
    lowestUnitPrice: 1.33,
    unitLabel: 'kr/100g',
  },
  {
    id: '3',
    name: 'Oatly Havredryck Barista 1 l',
    brand: 'Oatly',
    prices: [
      { retailerProductId: 'r6', chainId: 'ica', priceSek: 29.9, unit: 'l', quantity: 1, observedAt: new Date() },
      { retailerProductId: 'r7', chainId: 'coop', priceSek: 31.9, unit: 'l', quantity: 1, observedAt: new Date() },
      { retailerProductId: 'r8', chainId: 'lidl', priceSek: 27.9, unit: 'l', quantity: 1, observedAt: new Date() },
      { retailerProductId: 'r9', chainId: 'citygross', priceSek: 30.5, unit: 'l', quantity: 1, observedAt: new Date() },
    ],
    lowestUnitPrice: 27.9,
    unitLabel: 'kr/l',
  },
  {
    id: '4',
    name: 'Felix Ketchup 1 kg',
    brand: 'Felix',
    prices: [
      { retailerProductId: 'r10', chainId: 'ica', priceSek: 39.9, unit: 'kg', quantity: 1, observedAt: new Date() },
      { retailerProductId: 'r11', chainId: 'willys', priceSek: 35.9, unit: 'kg', quantity: 1, observedAt: new Date() },
      { retailerProductId: 'r12', chainId: 'coop', priceSek: 41.5, unit: 'kg', quantity: 1, observedAt: new Date() },
    ],
    lowestUnitPrice: 3.59,
    unitLabel: 'kr/100g',
  },
  {
    id: '5',
    name: 'Pågen Lingongrova 500g',
    brand: 'Pågen',
    prices: [
      { retailerProductId: 'r13', chainId: 'ica', priceSek: 32.9, unit: 'g', quantity: 500, observedAt: new Date() },
      { retailerProductId: 'r14', chainId: 'hemkop', priceSek: 34.5, unit: 'g', quantity: 500, observedAt: new Date() },
      { retailerProductId: 'r15', chainId: 'citygross', priceSek: 31.9, unit: 'g', quantity: 500, observedAt: new Date() },
    ],
    lowestUnitPrice: 6.38,
    unitLabel: 'kr/100g',
  },
  {
    id: '6',
    name: 'Skånemejerier Standard Mjölk 1,5 l',
    brand: 'Skånemejerier',
    prices: [
      { retailerProductId: 'r16', chainId: 'ica', priceSek: 18.9, unit: 'l', quantity: 1.5, observedAt: new Date() },
      { retailerProductId: 'r17', chainId: 'coop', priceSek: 19.5, unit: 'l', quantity: 1.5, observedAt: new Date() },
      { retailerProductId: 'r18', chainId: 'willys', priceSek: 17.9, unit: 'l', quantity: 1.5, observedAt: new Date() },
    ],
    lowestUnitPrice: 11.93,
    unitLabel: 'kr/l',
  },
]

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''

  const results = query
    ? MOCK_PRODUCTS.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.brand?.toLowerCase().includes(query.toLowerCase()),
      )
    : MOCK_PRODUCTS

  // Show all mock products for now regardless of filter
  const displayResults = results.length > 0 ? results : MOCK_PRODUCTS

  useEffect(() => {
    if (query) track.search(query, displayResults.length)
  }, [query, displayResults.length])

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex justify-center">
        <SearchForm defaultValue={query} />
      </div>

      <h2 className="mb-6 text-lg text-gray-700">
        <span className="font-semibold">{displayResults.length}</span> resultat
        {query && (
          <>
            {' '}för &ldquo;<span className="font-medium">{query}</span>&rdquo;
          </>
        )}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayResults.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </main>
  )
}
