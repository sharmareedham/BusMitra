import { Link } from 'react-router-dom'
import { formatDuration, type Connection, type Leg } from '../connections'
import { TRANSFER_MODES, getOperator, getStatus } from '../shared'

function BusLine({ leg }: { leg: Leg }) {
  const operator = getOperator(leg.route.operator)
  const status = getStatus(leg.route.status)

  return (
    <>
      <span className={`operator-tag ${operator.className}`}>
        {operator.label}
      </span>
      <span className="bus-number">Bus {leg.route.bus_number}</span>
      {leg.board.platform && (
        <span className="platform-tag">Platform {leg.board.platform}</span>
      )}
      <span className={`status ${status.className}`}>{status.label}</span>
      <Link to={`/route/${leg.route.id}`} className="view-stops">
        View stops →
      </Link>
    </>
  )
}

function ConnectionCard({ connection }: { connection: Connection }) {
  const { first, second, link, waitMinutes, totalMinutes } = connection

  const platformHint = second.board.platform
    ? `The next bus leaves from Platform ${second.board.platform}.`
    : 'The platform is not known yet, please ask at the stand.'

  return (
    <div className="route-card connection-card">
      <p className="eyebrow">
        1 CHANGE · {formatDuration(totalMinutes)} IN TOTAL
      </p>
      <h3>
        {first.board.name} → {second.alight.name}
      </h3>

      <ol className="stops">
        <li className="stop stop-upcoming">
          <span className="stop-time">{first.board.time}</span>
          <span className="stop-marker" />
          <div className="stop-info">
            <span className="stop-name">Board at {first.board.name}</span>
            <BusLine leg={first} />
          </div>
        </li>

        <li className="stop stop-upcoming">
          <span className="stop-time">{first.alight.time}</span>
          <span className="stop-marker" />
          <div className="stop-info">
            <span className="stop-name">Get off at {first.alight.name}</span>
          </div>
        </li>

        <li className="stop stop-change">
          <span className="stop-time" />
          <span className="stop-marker" />
          <div className="stop-info">
            {link ? (
              <>
                <span className="stop-name">
                  Change: go to {second.board.name}
                </span>
                <p className="stop-sub">
                  {TRANSFER_MODES[link.mode] ?? link.mode}, about {link.minutes}{' '}
                  min{link.note ? ` (${link.note})` : ''}. Then wait about{' '}
                  {waitMinutes} min. {platformHint}
                </p>
              </>
            ) : (
              <>
                <span className="stop-name">
                  Change: wait at {first.alight.name}
                </span>
                <p className="stop-sub">
                  Wait about {waitMinutes} min for the next bus. {platformHint}
                </p>
              </>
            )}
          </div>
        </li>

        <li className="stop stop-upcoming">
          <span className="stop-time">{second.board.time}</span>
          <span className="stop-marker" />
          <div className="stop-info">
            <span className="stop-name">Board at {second.board.name}</span>
            <BusLine leg={second} />
          </div>
        </li>

        <li className="stop stop-upcoming">
          <span className="stop-time">{second.alight.time}</span>
          <span className="stop-marker" />
          <div className="stop-info">
            <span className="stop-name">Arrive at {second.alight.name}</span>
          </div>
        </li>
      </ol>

      <p className="notice">
        Times come from the timetable. Check the status of both buses before you
        travel.
      </p>
    </div>
  )
}

export default ConnectionCard