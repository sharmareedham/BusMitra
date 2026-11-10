import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ConnectionCard from '../components/ConnectionCard'
import { findConnections } from '../connections'
import {
  API_URL,
  getOperator,
  getStatus,
  normalize,
  type BusRoute,
  type Stop,
  type Transfer,
} from '../shared'

type Match = {
  route: BusRoute
  fromStop: Stop
  toStop: Stop
}

function ResultsPage() {
  const [searchParams] = useSearchParams()
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''

  const [allRoutes, setAllRoutes] = useState<BusRoute[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const loadRoutes = fetch(`${API_URL}/api/routes`).then((response) => {
      if (!response.ok) throw new Error('Could not load routes')
      return response.json() as Promise<BusRoute[]>
    })

    // transfers are optional: if they fail to load, direct search still works
    const loadTransfers = fetch(`${API_URL}/api/transfers`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Transfer[]) => data)
      .catch((): Transfer[] => [])

    Promise.all([loadRoutes, loadTransfers])
      .then(([routes, links]) => {
        setAllRoutes(routes)
        setTransfers(links)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const fromKey = normalize(from)
  const toKey = normalize(to)

  const matches: Match[] = []
  for (const route of allRoutes) {
    const fromIndex = route.stops.findIndex((stop) =>
      normalize(stop.name).includes(fromKey)
    )
    if (fromIndex === -1) continue

    // the destination must come AFTER the starting stop
    const toIndex = route.stops.findIndex(
      (stop, index) => index > fromIndex && normalize(stop.name).includes(toKey)
    )
    if (toIndex === -1) continue

    matches.push({
      route,
      fromStop: route.stops[fromIndex],
      toStop: route.stops[toIndex],
    })
  }

  // only look for connections when there is no direct bus
  const connections =
    !loading && !error && matches.length === 0
      ? findConnections(allRoutes, from, to, transfers)
      : []

  return (
    <section className="routes-section">
      <Link to="/" className="back-link">← New search</Link>

      <div className="section-heading">
        <div>
          <p className="eyebrow">SEARCH RESULTS</p>
          <h2>{from} → {to}</h2>
        </div>
        <span className="demo-label">DEMO DATA</span>
      </div>

      {loading && <p>Loading routes…</p>}
      {error && (
        <p className="error">
          Could not connect to the backend. Make sure it is running.
        </p>
      )}

      {!loading && !error && matches.map(({ route, fromStop, toStop }) => (
        <Link
          to={`/route/${route.id}`}
          className="route-card route-card-link"
          key={route.id}
        >
          <div className="route-time">{fromStop.time}</div>
          <div className="route-info">
            <h3>{fromStop.name} <span>→</span> {toStop.name}</h3>
            <div className="bus-tags">
              <span
                className={`operator-tag ${getOperator(route.operator).className}`}
              >
                {getOperator(route.operator).label}
              </span>
              <span className="bus-number">Bus {route.bus_number}</span>
              {fromStop.platform && (
                <span className="platform-tag">
                  Platform {fromStop.platform}
                </span>
              )}
            </div>
            <p>
              Reaches {toStop.name} at {toStop.time} · Full route:{' '}
              {route.origin} → {route.destination}
            </p>
          </div>
          <div className="status-box">
            <span className={`status ${getStatus(route.status).className}`}>
              {getStatus(route.status).label}
            </span>
            <p className="status-note">{route.status_note}</p>
            {route.reports_disrupted && route.status !== 'cancelled' && (
              <span className="disrupted-chip">
                ⚠ Many report: bus didn't come
              </span>
            )}
            <span className="view-stops">View stops →</span>
          </div>
        </Link>
      ))}

      {connections.length > 0 && (
        <>
          <p className="connection-intro">
            <strong>No direct bus found.</strong>{' '}
            {connections.length === 1
              ? 'Here is a way to get there with one change:'
              : 'Here are ways to get there with one change:'}
          </p>
          {connections.map((connection) => (
            <ConnectionCard
              key={`${connection.first.route.id}-${connection.second.route.id}`}
              connection={connection}
            />
          ))}
        </>
      )}

      {!loading && !error && matches.length === 0 && connections.length === 0 && (
        <p className="no-results">
          No buses found for this route. Try different village or destination names.
        </p>
      )}
    </section>
  )
}

export default ResultsPage