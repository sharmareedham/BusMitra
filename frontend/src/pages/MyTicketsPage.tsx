import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import TicketCard from '../components/TicketCard'
import { API_URL, type Ticket } from '../shared'

function MyTicketsPage() {
  const { token } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(`${API_URL}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (response.status === 401) {
          throw new Error('Your login has expired. Please log in again.')
        }
        if (!response.ok) throw new Error('Could not load your tickets.')
        return response.json()
      })
      .then((data: Ticket[]) => setTickets(data))
      .catch((err: Error) =>
        setMessage(err.message || 'Could not connect to the backend.')
      )
      .finally(() => setLoading(false))
  }, [token])

  const cancelTicket = async (ticketId: string) => {
    setBusyId(ticketId)
    setMessage('')
    try {
      const response = await fetch(`${API_URL}/api/tickets/${ticketId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(
          typeof data.detail === 'string' ? data.detail : 'Could not cancel the ticket.'
        )
        return
      }
      setTickets((list) =>
        list.map((t) => (t.id === ticketId ? (data as Ticket) : t))
      )
    } catch {
      setMessage('Could not connect to the backend. Make sure it is running.')
    } finally {
      setBusyId(null)
    }
  }

  if (!token) {
    return (
      <section className="routes-section">
        <div className="auth-card">
          <h2>My tickets</h2>
          <p>
            <Link to="/login">Log in</Link> to see your tickets.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="routes-section">
      <Link to="/" className="back-link">← New search</Link>

      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR BOOKINGS</p>
          <h2>My tickets</h2>
        </div>
        <span className="demo-label">DEMO TICKETS</span>
      </div>

      {loading && <p>Loading your tickets…</p>}
      {message && <p className="error">{message}</p>}

      {!loading && tickets.length === 0 && !message && (
        <p className="no-results">
          You have no tickets yet. Search for a bus and book one.
        </p>
      )}

      <div className="tickets-list">
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            busy={busyId === ticket.id}
            onCancel={() => cancelTicket(ticket.id)}
          />
        ))}
      </div>
    </section>
  )
}

export default MyTicketsPage