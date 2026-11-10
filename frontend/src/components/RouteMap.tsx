import { useEffect, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Stop } from '../shared'

type Props = {
  stops: Stop[]
  currentStop: number | null
}

const PAUSE_MS = 1200 // how long the bus waits at each stop
const END_PAUSE_MS = 1500 // extra wait at the last stop before it restarts
const MIN_LEG_MS = 2500 // fastest time between two stops
const MAX_LEG_MS = 6000 // slowest time between two stops
const MS_PER_METER = 1.5 // longer legs take longer, within the limits above

const busIcon = L.divIcon({
  html: '<div class="bus-marker">🚌</div>',
  className: 'bus-marker-wrapper',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

const easeInOut = (p: number) =>
  p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function RouteMap({ stops, currentStop }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  // people who ask their phone for less motion start paused
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const [liveCaption, setLiveCaption] = useState('')

  // 1) draw the map, the route line and the stop dots
  useEffect(() => {
    if (!containerRef.current || stops.length === 0) return

    const map = L.map(containerRef.current)
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    const points = stops.map((stop): L.LatLngTuple => [stop.lat, stop.lng])

    L.polyline(points, { color: '#1d604b', weight: 4 }).addTo(map)

    stops.forEach((stop, index) => {
      const isCurrent = index === currentStop
      const isPassed = currentStop !== null && index < currentStop

      const marker = L.circleMarker([stop.lat, stop.lng], {
        radius: isCurrent ? 11 : 7,
        color: isCurrent ? '#15803d' : '#1d604b',
        weight: 3,
        fillColor: isCurrent ? '#22c55e' : isPassed ? '#1d604b' : '#ffffff',
        fillOpacity: 1,
      }).addTo(map)

      marker.bindTooltip(
        `${stop.name} · ${stop.time}${isCurrent ? ' (bus is here now)' : ''}`
      )
    })

    map.fitBounds(L.latLngBounds(points), { padding: [30, 30] })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [stops, currentStop])

  // 2) the bus: starts at the reported stop and drives to the last stop
  useEffect(() => {
    const map = mapRef.current
    if (!map || currentStop === null || !stops[currentStop]) return

    const remaining = stops.slice(currentStop)
    const path = remaining.map((stop) => L.latLng(stop.lat, stop.lng))
    const names = remaining.map((stop) => stop.name)

    const bus = L.marker(path[0], {
      icon: busIcon,
      interactive: false, // so it never blocks the stop tooltips
      keyboard: false,
      zIndexOffset: 1000,
    }).addTo(map)

    // nothing to animate if paused, or the bus is already at the last stop
    if (!playing || path.length < 2) {
      return () => {
        bus.remove()
      }
    }

    const legs = path.slice(1).map((to, i) => {
      const from = path[i]
      const ms = Math.min(
        MAX_LEG_MS,
        Math.max(MIN_LEG_MS, from.distanceTo(to) * MS_PER_METER)
      )
      return { from, to, ms, toName: names[i + 1] }
    })

    // one full trip: wait, then (drive + wait) for every leg, then a longer end wait
    const cycle =
      PAUSE_MS +
      legs.reduce((sum, leg) => sum + leg.ms + PAUSE_MS, 0) +
      END_PAUSE_MS

    const startedAt = performance.now()
    let frame = 0
    let lastCaption = ''

    const tick = (now: number) => {
      let t = Math.max(0, now - startedAt) % cycle
      let position = path[path.length - 1]
      let caption = `Stopped at ${names[names.length - 1]}`

      if (t < PAUSE_MS) {
        position = path[0]
        caption = `Stopped at ${names[0]}`
      } else {
        t -= PAUSE_MS
        for (const leg of legs) {
          if (t < leg.ms) {
            const p = easeInOut(t / leg.ms)
            position = L.latLng(
              leg.from.lat + (leg.to.lat - leg.from.lat) * p,
              leg.from.lng + (leg.to.lng - leg.from.lng) * p
            )
            caption = `Heading to ${leg.toName}`
            break
          }
          t -= leg.ms
          if (t < PAUSE_MS) {
            position = leg.to
            caption = `Stopped at ${leg.toName}`
            break
          }
          t -= PAUSE_MS
        }
      }

      bus.setLatLng(position)

      // only update the text when it actually changes, not on every frame
      if (caption !== lastCaption) {
        lastCaption = caption
        setLiveCaption(caption)
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      bus.remove()
    }
  }, [stops, currentStop, playing])

  const reported = currentStop !== null ? stops[currentStop] : undefined
  const canAnimate =
    !!reported && currentStop !== null && currentStop < stops.length - 1

  const caption = !reported
    ? ''
    : playing && canAnimate && liveCaption
      ? liveCaption
      : `At ${reported.name} (reported position)`

  return (
    <>
      <div className="route-map-wrap">
        <div ref={containerRef} className="route-map" />
        {canAnimate && playing && (
          <span className="map-badge">SIMULATED</span>
        )}
      </div>

      {reported && (
        <div className="map-controls">
          {canAnimate && (
            <button
              type="button"
              className="map-play"
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? 'Pause' : 'Play'} simulation
            </button>
          )}
          <span className="map-caption">{caption}</span>
        </div>
      )}
    </>
  )
}

export default RouteMap