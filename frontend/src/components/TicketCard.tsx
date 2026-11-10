import { downloadTicketImage } from '../ticketImage'
import { formatDateTime, getOperator, type Ticket } from '../shared'

type Props = {
  ticket: Ticket
  onCancel?: () => void
  busy?: boolean
}

function TicketCard({ ticket, onCancel, busy }: Props) {
  const cancelled = ticket.status === 'cancelled'

  const handleCancel = () => {
    if (
      onCancel &&
      window.confirm(
        `Cancel ticket ${ticket.id}? You will get a demo refund of ₹${ticket.fare}.`
      )
    ) {
      onCancel()
    }
  }

  return (
    <div className={cancelled ? 'ticket ticket-cancelled' : 'ticket'}>
      <h2>{cancelled ? 'Ticket cancelled' : 'Booking confirmed'}</h2>
      <p className="ticket-id">{ticket.id}</p>
      <p className="ticket-route">
        {ticket.from_stop} → {ticket.to_stop}
      </p>

      <div className="bus-tags">
        <span className={`operator-tag ${getOperator(ticket.operator).className}`}>
          {getOperator(ticket.operator).label}
        </span>
        <span className="bus-number">Bus {ticket.bus_number}</span>
      </div>

      <p>
        Departs {ticket.departure} · {ticket.passengers} passenger(s)
      </p>
      <p>Name: {ticket.passenger_name}</p>
      <p className="ticket-booked">Booked on {formatDateTime(ticket.booked_at)}</p>
      <p className="ticket-fare">Total paid: ₹{ticket.fare}</p>
      <p className="ticket-pay">
        Paid via {ticket.payment_method} (demo) · {ticket.txn_id}
      </p>

      {cancelled && (
        <p className="ticket-cancel-note">
          Cancelled
          {ticket.cancelled_at ? ` on ${formatDateTime(ticket.cancelled_at)}` : ''}
          {' · '}Demo refund: ₹{ticket.fare}
        </p>
      )}

      <div className="ticket-actions">
        <button
          type="button"
          className="ticket-btn"
          onClick={() => downloadTicketImage(ticket)}
        >
          Download ticket
        </button>
        {!cancelled && onCancel && (
          <button
            type="button"
            className="ticket-btn ticket-btn-danger"
            disabled={busy}
            onClick={handleCancel}
          >
            {busy ? 'Cancelling…' : 'Cancel ticket'}
          </button>
        )}
        <p className="demo-note">Demo ticket · Not valid for travel</p>
      </div>
    </div>
  )
}

export default TicketCard