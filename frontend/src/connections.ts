import { normalize, type BusRoute, type Stop, type Transfer } from './shared'

export type Leg = {
  route: BusRoute
  board: Stop
  alight: Stop
}

export type Connection = {
  first: Leg
  second: Leg
  link: Transfer | null
  waitMinutes: number
  totalMinutes: number
  arrival: number
}

const MIN_BUFFER = 5 // minutes needed to change buses
const MAX_WAIT = 180 // ignore waits longer than 3 hours
const MAX_RESULTS = 5

export function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

// identifies a place: same name + same district = same place
const clean = (text: string) => normalize(text) || text.trim().toLowerCase()
const keyOf = (name: string, district?: string) =>
  `${clean(name)}|${clean(district ?? '')}`

export function findConnections(
  routes: BusRoute[],
  from: string,
  to: string,
  transfers: Transfer[]
): Connection[] {
  const fromKey = normalize(from)
  const toKey = normalize(to)
  if (!fromKey || !toKey) return []

  // a cancelled bus can't be part of a plan
  const usable = routes.filter((route) => route.status !== 'cancelled')

  const links = new Map<string, Transfer[]>()
  for (const transfer of transfers) {
    const key = keyOf(transfer.from_name, transfer.from_district)
    links.set(key, [...(links.get(key) ?? []), transfer])
  }

  // keep only the best option for each pair of buses
  const best = new Map<string, Connection>()

  for (const a of usable) {
    const i = a.stops.findIndex((stop) => normalize(stop.name).includes(fromKey))
    if (i === -1) continue

    for (let j = i + 1; j < a.stops.length; j++) {
      const alight = a.stops[j]
      const arriveAt = toMinutes(alight.time)
      const alightKey = keyOf(alight.name, alight.district)

      // Either wait at this same place, or travel to another stand first
      const options: { key: string; minutes: number; link: Transfer | null }[] = [
        { key: alightKey, minutes: 0, link: null },
      ]
      for (const link of links.get(alightKey) ?? []) {
        options.push({
          key: keyOf(link.to_name, link.to_district),
          minutes: link.minutes,
          link,
        })
      }

      for (const b of usable) {
        if (b.id === a.id) continue

        for (const option of options) {
          const k = b.stops.findIndex(
            (stop) => keyOf(stop.name, stop.district) === option.key
          )
          if (k === -1) continue

          // the destination must come AFTER where we board the second bus
          const m = b.stops.findIndex(
            (stop, index) => index > k && normalize(stop.name).includes(toKey)
          )
          if (m === -1) continue

          const board = b.stops[k]
          const wait = toMinutes(board.time) - (arriveAt + option.minutes)
          if (wait < MIN_BUFFER || wait > MAX_WAIT) continue

          const arrival = toMinutes(b.stops[m].time)
          const totalMinutes = arrival - toMinutes(a.stops[i].time)
          if (totalMinutes <= 0) continue // overnight trips are not handled yet

          const connection: Connection = {
            first: { route: a, board: a.stops[i], alight },
            second: { route: b, board, alight: b.stops[m] },
            link: option.link,
            waitMinutes: wait,
            totalMinutes,
            arrival,
          }

          const id = `${a.id}-${b.id}`
          const existing = best.get(id)
          if (!existing || connection.arrival < existing.arrival) {
            best.set(id, connection)
          }
        }
      }
    }
  }

  return [...best.values()]
    .sort((x, y) => x.arrival - y.arrival || x.waitMinutes - y.waitMinutes)
    .slice(0, MAX_RESULTS)
}