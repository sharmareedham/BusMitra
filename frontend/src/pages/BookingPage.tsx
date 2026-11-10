import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../AuthContext'
import TicketCard from '../components/TicketCard'
import {
  API_URL,
  FARE_PER_STOP,
  type BusRoute,
  type Ticket,
} from '../shared'

type Stage = 'form' | 'pay' | 'processing' | 'done'

const PAY_METHODS = ['GPay', 'PhonePe', 'Paytm']

function BookingPage() {
  const { id } = useParams()
  const { token } = useAuth()

  const [route, setRoute] = useState<BusRoute | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [fromIndex, setFromIndex] = useState(0)
  const [toIndex, setToIndex] = useState(1)
  const [passengers, setPassengers] = useState(1)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  const [stage, setStage] = useState<Stage>('form')
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [method, setMethod] = useState('')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    fetch(`${API_URL}/api/routes`)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load routes')
        return response.json()
      })
      .then((data: BusRoute[]) => {
        const found = data.find((r) => String(r.id) === id) ?? null
        setRoute(found)
        if (found) setToIndex(found.stops.length - 1)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  // stop the fake "processing" timer if the person leaves the page
  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (loading) {
    return <section className="routes-section"><p>Loading…</p></section>
  }

  if (error || !route) {
    return (
      <section className="routes-section">
        <Link to="/" className="back-link">← New search</Link>
        <p className="error">Could not load this bus.</p>
      </section>
    )
  }

  const stops = route.stops
  const fare = Math.max(0, toIndex - fromIndex) * FARE_PER_STOP * passengers

  const handleFromChange = (value: number) => {
    setFromIndex(value)
    if (toIndex <= value) setToIndex(Math.min(value + 1, stops.length - 1))
  }

  // step 1: check the form, then go to the payment screen
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (!name.trim()) {
      setMessage('Please enter the passenger name.')
      return
    }
    if (!/^\d{10}$/.test(phone.trim())) {
      setMessage('Please enter a 10-digit phone number.')
      return
    }
    if (toIndex <= fromIndex) {
      setMessage('The destination must come after the boarding stop.')
      return
    }

    setMessage('')
    setStage('pay')
  }

  // step 2: fake payment, then the ticket is created on the server
  const pay = (chosen: string, succeed: boolean) => {
    setMethod(chosen)
    setMessage('')
    setStage('processing')

    timer.current = window.setTimeout(async () => {
      if (!succeed) {
        setMessage('Payment failed (demo). You have not been charged. Try again.')
        setStage('pay')
        return
      }

      try {
        const response = await fetch(`${API_URL}/api/tickets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            route_id: route.id,
            from_index: fromIndex,
            to_index: toIndex,
            passengers,
            passenger_name: name.trim(),
            phone: phone.trim(),
            payment_method: chosen,
          }),
        })
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          setMessage(
            response.status === 401
              ? 'Your login has expired. Please log in again.'
              : typeof data.detail === 'string'
                ? data.detail
                : 'Could not create your ticket. Please try again.'
          )
          setStage('pay')
          return
        }

        setTicket(data as Ticket)
        setStage('done')
      } catch {
        setMessage('Could not connect to the backend. Make sure it is running.')
        setStage('pay')
      }
    }, 2000)
  }

  // ---- ticket ----
  if (stage === 'done' && ticket) {
    return (
      <section className="routes-section">
        <Link to="/" className="back-link">← Back to search</Link>
        <TicketCard ticket={ticket} />
        <p className="notice">
          Your ticket is saved in your account.{' '}
          <Link to="/tickets">View all my tickets</Link>
        </p>
      </section>
    )
  }

  // ---- payment ----
  if (stage === 'pay' || stage === 'processing') {
    return (
      <section className="routes-section">
        <button
          type="button"
          className="back-link back-button"
          onClick={() => setStage('form')}
          disabled={stage === 'processing'}
        >
          ← Edit booking
        </button>

        <div className="pay-card">
          <h2>Pay ₹{fare}</h2>
          <p className="pay-summary">
            {stops[fromIndex].name} → {stops[toIndex].name} · {passengers} passenger(s)
          </p>

          {stage === 'processing' ? (
            <div className="pay-processing">
              <div className="spinner" />
              <p>Processing your {method} payment…</p>
            </div>
          ) : (
            <>
              <div className="pay-methods">
                {PAY_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="pay-method"
                    onClick={() => pay(m, true)}
                  >
                    Pay with {m}
                  </button>
                ))}
              </div>

              <p className="pay-or">OR SCAN</p>

              <div className="pay-qr">
                <QRCodeSVG
                  value={`BUSMITRA DEMO PAYMENT | INR ${fare} | NOT A REAL UPI LINK`}
                  size={170}
                />
              </div>
              <button
                type="button"
                className="pay-method"
                onClick={() => pay('UPI QR', true)}
              >
                I have scanned and paid
              </button>

              {message && <p className="error">{message}</p>}

              <button
                type="button"
                className="pay-fail"
                onClick={() => pay('UPI', false)}
              >
                Simulate a failed payment
              </button>
            </>
          )}
        </div>
      </section>
    )
  }

  // ---- booking form ----
  const cancelled = route.status === 'cancelled'

  return (
    <section className="routes-section">
      <Link to={`/route/${route.id}`} className="back-link">← Back to bus</Link>

      <div className="section-heading">
        <div>
          <p className="eyebrow">BOOK A TICKET</p>
          <h2>{route.origin} → {route.destination}</h2>
        </div>
        <span className="demo-label">DEMO BOOKING</span>
      </div>

      {cancelled ? (
        <p className="error">This bus is cancelled, so it can't be booked.</p>
      ) : !token ? (
        <p className="report-login">
          <Link to="/login">Log in</Link> to book a ticket. Your tickets are
          saved in your account.
        </p>
      ) : (
        <form className="booking-form" onSubmit={handleSubmit}>
          <label>
            Boarding stop
            <select
              value={fromIndex}
              onChange={(e) => handleFromChange(Number(e.target.value))}
            >
              {stops.slice(0, -1).map((stop, i) => (
                <option key={i} value={i}>
                  {stop.name} ({stop.time})
                </option>
              ))}
            </select>
          </label>

          <label>
            Destination stop
            <select
              value={toIndex}
              onChange={(e) => setToIndex(Number(e.target.value))}
            >
              {stops.map((stop, i) =>
                i > fromIndex ? (
                  <option key={i} value={i}>
                    {stop.name} ({stop.time})
                  </option>
                ) : null
              )}
            </select>
          </label>

          <label>
            Passengers
            <select
              value={passengers}
              onChange={(e) => setPassengers(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <label>
            Passenger name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label>
            Phone number
            <input
              value={phone}
              inputMode="numeric"
              maxLength={10}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </label>

          <p className="booking-fare">Fare: ₹{fare}</p>
          {message && <p className="error">{message}</p>}

          <button type="submit" className="pay-method">Proceed to payment</button>
          <p className="notice">
            Demo only: no real payment is taken and the ticket is not valid for travel.
          </p>
        </form>
      )}
    </section>
  )
}

export default BookingPage