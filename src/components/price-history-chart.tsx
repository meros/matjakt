import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { RetailerProductDoc, ChainId } from '@/lib/types'
import { CHAINS } from '@/lib/types'
import { getPriceHistory } from '@/lib/api'

interface PriceHistoryChartProps {
  /** All retailerProducts for this product across chains */
  products: RetailerProductDoc[]
}

interface ChartDataPoint {
  date: string
  timestamp: number
  [chainId: string]: number | string
}

export function PriceHistoryChart({ products }: PriceHistoryChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [activeChains, setActiveChains] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    async function loadHistory() {
      setLoading(true)
      const chains = new Set<string>()

      // Fetch price history for each chain's product
      const allHistories = await Promise.all(
        products.map(async (p) => {
          const history = await getPriceHistory(p.id, 100)
          return { chainId: p.chainId, history }
        }),
      )

      if (cancelled) return

      // Merge all histories into a unified timeline
      const dateMap = new Map<string, ChartDataPoint>()

      for (const { chainId, history } of allHistories) {
        if (history.length === 0) continue
        chains.add(chainId)

        for (const entry of history) {
          const dateStr = entry.scrapedAt.toLocaleDateString('sv-SE')
          const existing = dateMap.get(dateStr)

          if (existing) {
            // Keep the latest price for this chain on this date
            existing[chainId] = entry.price
          } else {
            dateMap.set(dateStr, {
              date: dateStr,
              timestamp: entry.scrapedAt.getTime(),
              [chainId]: entry.price,
            })
          }
        }
      }

      // Sort by date
      const sorted = Array.from(dateMap.values()).sort(
        (a, b) => a.timestamp - b.timestamp,
      )

      setChartData(sorted)
      setActiveChains(chains)
      setLoading(false)
    }

    loadHistory()
    return () => {
      cancelled = true
    }
  }, [products])

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Prishistorik
        </h2>
        <p className="text-center text-gray-400">Laddar prishistorik...</p>
      </section>
    )
  }

  if (chartData.length < 2) {
    return (
      <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-gray-800">
          Prishistorik
        </h2>
        <p className="text-center text-gray-400">
          Prishistorik visas när vi har samlat data från flera skrapningar
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">
        Prishistorik
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: '#9ca3af' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v} kr`}
          />
          <Tooltip
            formatter={(value, name) => [
              `${Number(value).toFixed(2)} kr`,
              CHAINS[String(name) as ChainId]?.displayName ?? String(name),
            ]}
            labelStyle={{ fontWeight: 'bold' }}
          />
          <Legend
            formatter={(value: string) =>
              CHAINS[value as ChainId]?.displayName ?? value
            }
          />
          {Array.from(activeChains).map((chainId) => (
            <Line
              key={chainId}
              type="stepAfter"
              dataKey={chainId}
              stroke={CHAINS[chainId as ChainId]?.color ?? '#6b7280'}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              name={chainId}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}
