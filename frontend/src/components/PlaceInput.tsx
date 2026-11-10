import { useState, type KeyboardEvent } from 'react'
import { normalize, type Place } from '../shared'

// number of single-letter edits needed to turn a into b
function editDistance(a: string, b: string) {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return dp[a.length][b.length]
}

function findSuggestions(query: string, places: Place[]) {
  const q = normalize(query)
  if (q.length < 2) return []

  const scored: { place: Place; score: number }[] = []
  for (const place of places) {
    const n = normalize(place.name)
    let score = -1

    if (n.startsWith(q)) score = 0
    else if (n.includes(q)) score = 1
    else if (q.length >= 3) {
      // typo tolerance: compare with the start of the name
      const d = editDistance(q, n.slice(0, q.length))
      if (d <= (q.length >= 5 ? 2 : 1)) score = 2 + d
    }

    if (score >= 0) scored.push({ place, score })
  }

  scored.sort(
    (a, b) => a.score - b.score || a.place.name.localeCompare(b.place.name)
  )
  return scored.slice(0, 6).map((item) => item.place)
}

type Props = {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  places: Place[]
}

function PlaceInput({ label, placeholder, value, onChange, places }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const suggestions = open ? findSuggestions(value, places) : []

  const choose = (place: Place) => {
    onChange(place.name)
    setOpen(false)
    setActive(-1)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      choose(suggestions[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <label>
      <span>{label}</span>
      <div className="location-input">
        <input
          placeholder={placeholder}
          value={value}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
        />

        {suggestions.length > 0 && (
          <ul className="suggestions" role="listbox">
            {suggestions.map((place, index) => (
              <li
                key={`${place.name}-${place.district}`}
                role="option"
                aria-selected={index === active}
                className={`suggestion ${index === active ? 'active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault() // keeps the input from losing focus first
                  choose(place)
                }}
              >
                <span className="suggestion-name">{place.name}</span>
                {place.district && (
                  <span className="suggestion-district">{place.district}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </label>
  )
}

export default PlaceInput