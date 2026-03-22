import type { ReactNode } from 'react'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">{children}</div>
      <footer className="mt-8 border-t border-gray-100 px-4 py-6 text-center">
        <p className="text-sm font-medium text-gray-400">
          Matjakt — Prisjämförelse för mat i Sverige
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Data uppdateras var 4–12:e timme. Priser kan ha ändrats sedan senaste uppdateringen.
        </p>
      </footer>
    </div>
  )
}
