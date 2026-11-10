import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import PlaceInput from '../components/PlaceInput'
import {
  API_URL,
  clearRecentSearches,
  getRecentSearches,
  saveRecentSearch,
  type Place,
  type RecentSearch,
} from '../shared'

function HomePage() {
  const navigate = useNavigate()
  const [fromVillage, setFromVillage] = useState('')
  const [toDestination, setToDestination] = useState('')
  const [message, setMessage] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [recent, setRecent] = useState<RecentSearch[]>(getRecentSearches)

  useEffect(() => {
    fetch(`${API_URL}/api/places`)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load places')
        return response.json()
      })
      .then((data: Place[]) => setPlaces(data))
      .catch(() => {})
  }, [])

  const swapLocations = () => {
    setFromVillage(toDestination)
    setToDestination(fromVillage)
    setMessage('')
  }

  const goToResults = (from: string, to: string) => {
    setRecent(saveRecentSearch(from, to))
    navigate(
      `/results?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    )
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (!fromVillage.trim() || !toDestination.trim()) {
      setMessage('Please enter both your village and your destination.')
      return
    }

    goToResults(fromVillage.trim(), toDestination.trim())
  }

  const handleClearRecent = () => {
    clearRecentSearches()
    setRecent([])
  }

  return (
    <section className="hero">
      <p className="eyebrow">HARYANA ROADWAYS · BUS TRACKING</p>
      <h1>Know before<br />you go.</h1>
      <p className="intro">
        Find buses between your village and destination.
        Check schedules and service updates before you travel.
      </p>

      <form className="search" onSubmit={handleSubmit}>
        <div className="search-row">
          <PlaceInput
            label="FROM"
            placeholder="Enter your village"
            value={fromVillage}
            onChange={setFromVillage}
            places={places}
          />
          <button
            type="button"
            className="swap-button"
            onClick={swapLocations}
            aria-label="Swap departure and destination"
          >
            ⇄
          </button>
          <PlaceInput
            label="TO"
            placeholder="Enter destination"
            value={toDestination}
            onChange={setToDestination}
            places={places}
          />

          <button type="submit">Find buses →</button>
        </div>
      </form>

      {message && <p className="error">{message}</p>}

      {recent.length > 0 && (
        <div className="recent-searches">
          <div className="recent-header">
            <span className="recent-title">RECENT SEARCHES</span>
            <button
              type="button"
              className="recent-clear"
              onClick={handleClearRecent}
            >
              Clear
            </button>
          </div>
          <div className="recent-list">
            {recent.map((item) => (
              <button
                key={`${item.from}|${item.to}`}
                type="button"
                className="recent-chip"
                onClick={() => goToResults(item.from, item.to)}
              >
                {item.from} <span>→</span> {item.to}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="notice">
        Service status will be shown only when verified information is available.
      </p>
    </section>
  )
}

export default HomePage