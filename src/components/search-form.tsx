import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

interface SearchFormProps {
  defaultValue?: string
}

export function SearchForm({ defaultValue = '' }: SearchFormProps) {
  const [query, setQuery] = useState(defaultValue)
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus on homepage
  useEffect(() => {
    if (location.pathname === '/' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [location.pathname])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed) {
      navigate(`/sok?q=${encodeURIComponent(trimmed)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
      <div className="relative min-w-0 flex-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Sök efter produkt, t.ex. "havregrynsgröt"...'
          className="w-full rounded-full border border-gray-300 py-4 pl-12 pr-10 text-lg shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:text-gray-600"
            aria-label="Rensa sökning"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        )}
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
      >
        Sök
      </button>
    </form>
  )
}
