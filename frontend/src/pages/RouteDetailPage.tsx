import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import RouteMap from '../components/RouteMap'
import {
  API_URL,
  REPORT_LABELS,
  getOperator,
  getStatus,
  type BusRoute,
  type ReportSummary,
  type ReportType,
} from '../shared'

const authHeader = (token: string | null): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {}

function RouteDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()

  const [route, setRoute] = useState<BusRoute | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [sending, setSending] = useState(false)
  const [reportMessage, setReportMessage] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/api/routes/${id}`)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load route')
        return response.json()
      })
      .then((data: BusRoute) => setRoute(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  // reload the reports when the page opens, or when someone logs in or out
  useEffect(() => {
    fetch(`${API_URL}/api/routes/${id}/reports`, {
      headers: authHeader(token),
    })
      .then((response) => response.json())
      .then((data: ReportSummary) => setSummary(data))
      .catch(() => {})
    setReportMessage('')
  }, [id, token])

  const submitReport = async (type: ReportType) => {
    if (!token) {
      setReportMessage('Please log in to send a report.')
      return
    }

    setSending(true)
    setReportMessage('')
    try {
      const response = await fetch(`${API_URL}/api/routes/${id}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(token),
        },
        body: JSON.stringify({ type }),
      })
      const data = await response.json().catch(() => ({}))

      if (response.status === 401) {
        setReportMessage('Your login has expired. Please log in again.')
        return
      }

      if (response.status === 409) {
        setReportMessage(
          typeof data.detail === 'string'
            ? data.detail
            : 'You have already reported this bus today.'
        )
        // refresh so the buttons show the right state
        fetch(`${API_URL}/api/routes/${id}/reports`, {
          headers: authHeader(token),
        })
          .then((r) => r.json())
          .then((s: ReportSummary) => setSummary(s))
          .catch(() => {})
        return
      }

      if (!response.ok) throw new Error('Report failed')

      setSummary(data as ReportSummary)
      setReportMessage('Thanks! Your report was added. It is unverified.')
    } catch {
      setReportMessage('Could not send your report. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const disrupted =
    (summary ? summary.disrupted : route?.reports_disrupted) ?? false

  const locationMessage = (() => {
    if (!route) return ''
    if (route.status === 'cancelled') {
      return 'This bus is cancelled today, so there is no live location.'
    }
    if (route.current_stop === null) {
      return 'Live location is not available for this bus.'
    }
    return ''
  })()

  return (
    <section className="routes-section">
      <button className="back-link" onClick={() => navigate(-1)}>
        ← Back to results
      </button>

      {loading && <p>Loading route…</p>}
      {error && <p className="error">Could not load this route.</p>}

      {route && (
        <div className="route-card detail-card">
          <div className="detail-top">
            <div>
              <p className="eyebrow">DEPARTS {route.departure}</p>
              <h2>{route.origin} → {route.destination}</h2>
              <div className="bus-tags">
                <span
                  className={`operator-tag ${getOperator(route.operator).className}`}
                >
                  {getOperator(route.operator).label}
                </span>
                <span className="bus-number">Bus {route.bus_number}</span>
              </div>
              {route.status !== 'cancelled' && (
                <Link to={`/book/${route.id}`} className="book-button">
                  Book ticket
                </Link>
              )}
              <p className="status-note">{route.status_note}</p>
            </div>
            <span className={`status ${getStatus(route.status).className}`}>
              {getStatus(route.status).label}
            </span>
          </div>

          {disrupted && route.status !== 'cancelled' && (
            <p className="disrupted-banner">
              ⚠ Many passengers reported in the last 30 minutes that this bus didn't
              come. These reports are unverified, so please confirm at the bus
              stand before you travel.
            </p>
          )}

          {locationMessage && (
            <p className="location-message">{locationMessage}</p>
          )}

          <RouteMap stops={route.stops} currentStop={route.current_stop} />

          <ol className="stops">
            {route.stops.map((stop, index) => {
              let state = 'upcoming'
              if (route.current_stop !== null) {
                if (index < route.current_stop) state = 'passed'
                else if (index === route.current_stop) state = 'current'
              }

              return (
                <li key={index} className={`stop stop-${state}`}>
                  <span className="stop-time">{stop.time}</span>
                  <span className="stop-marker" />
                  <div className="stop-info">
                    <span className="stop-name">{stop.name}</span>
                    {stop.platform && (
                      <span className="platform-tag">
                        Platform {stop.platform}
                      </span>
                    )}
                    {state === 'current' && (
                      <span className="here-now">Bus is here now</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>

          <p className="notice">
            Demo data: the bus position shown here is simulated.
          </p>

          <div className="reports">
            <h3>Passenger reports today</h3>
            <p className="reports-hint">
              Reports come from passengers and are <strong>unverified</strong>.
              Each person can report a bus once a day.
            </p>

            {!token ? (
              <p className="report-login">
                <Link to="/login">Log in</Link> to report this bus.
              </p>
            ) : (
              <>
                <div className="report-buttons">
                  {(Object.keys(REPORT_LABELS) as ReportType[]).map((type) => (
                    <button
                      key={type}
                      className={`report-btn report-${type}`}
                      disabled={sending || !!summary?.my_report}
                      onClick={() => submitReport(type)}
                    >
                      {REPORT_LABELS[type]}
                    </button>
                  ))}
                </div>

                {summary?.my_report && (
                  <p className="report-message">
                    You reported "{REPORT_LABELS[summary.my_report]}" for this
                    bus today.
                  </p>
                )}
              </>
            )}

            {reportMessage && <p className="report-message">{reportMessage}</p>}

            {summary && summary.reports.length === 0 && (
              <p className="reports-empty">No reports yet today.</p>
            )}

            {summary && summary.reports.length > 0 && (
              <>
                <p className="report-counts">
                  {summary.counts.not_came} didn't come ·{' '}
                  {summary.counts.delayed} late ·{' '}
                  {summary.counts.running} running
                </p>
                <ul className="report-list">
                  {summary.reports.slice(0, 5).map((report) => (
                    <li key={report.id}>
                      <span className="report-time">{report.time}</span>
                      <span>{REPORT_LABELS[report.type]}</span>
                      <span className="report-tag">Unverified</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default RouteDetailPage