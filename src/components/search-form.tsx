import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

interface SearchFormProps {
  defaultValue?: string
}

export function SearchForm({ defaultValue = '' }: SearchFormProps) {
  const [query, setQuery] = useState(defaultValue)
  const navigate = useNavigate()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed) {
      navigate(`/sok?q=${encodeURIComponent(trimmed)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Sök efter produkt, t.ex. "havregrynsgröt"...'
        className="flex-1 rounded-full border border-gray-300 px-6 py-4 text-lg shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
      >
        Sök
      </button>
    </form>
  )
}
