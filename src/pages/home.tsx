import { Link } from 'react-router-dom'
import { SearchForm } from '@/components/search-form'
import { CHAINS } from '@/lib/types'

const POPULAR_SEARCHES = [
  'Mjölk', 'Smör', 'Bröd', 'Kaffe', 'Ägg', 'Pasta', 'Ris', 'Ost',
]

export function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <div>
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
            Mat<span className="text-brand-600">jakt</span>
          </h1>
          <p className="mt-3 text-lg text-gray-600">
            Jämför matpriser från alla stora kedjor i Sverige
          </p>
        </div>

        <SearchForm />

        <div className="flex flex-wrap justify-center gap-2">
          {POPULAR_SEARCHES.map((term) => (
            <Link
              key={term}
              to={`/sok?q=${encodeURIComponent(term)}`}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              {term}
            </Link>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
          {Object.values(CHAINS).map((chain) => (
            <span
              key={chain.id}
              className="text-sm font-semibold opacity-60"
              style={{ color: chain.color }}
            >
              {chain.displayName}
            </span>
          ))}
        </div>
      </div>
    </main>
  )
}
