export const API_URL = 'http://127.0.0.1:8000'

export type Stop = {
  name: string
  district?: string
  time: string
  platform?: string
  lat: number
  lng: number
}

export type BusRoute = {
  id: number
  origin: string
  destination: string
  departure: string
  status: string
  operator: string
  bus_number: string
  status_note: string
  current_stop: number | null
  stops: Stop[]
  not_came_recent: number
  reports_disrupted: boolean
}

const STATUS_INFO: Record<string, { label: string; className: string }> = {
  running: { label: 'Running', className: 'status-running' },
  delayed: { label: 'Delayed', className: 'status-delayed' },
  cancelled: { label: 'Cancelled', className: 'status-cancelled' },
  unknown: { label: 'Unknown', className: 'status-unknown' },
}

export const getStatus = (status: string) =>
  STATUS_INFO[status] ?? STATUS_INFO.unknown

// "Village A", "village a", "VILLAGE-A" and "villagea" all match each other
export const normalize = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]/g, '')
export type ReportType = 'running' | 'delayed' | 'not_came'

export type Report = {
  id: number
  type: ReportType
  time: string
}

export type ReportSummary = {
  reports: Report[]
  counts: Record<ReportType, number>
  disrupted: boolean
  my_report?: ReportType | null
}

export const REPORT_LABELS: Record<ReportType, string> = {
  running: 'Bus is running',
  delayed: 'Bus is late',
  not_came: "Bus didn't come",
}
export type Place = {
  name: string
  district: string
}
export type RecentSearch = {
  from: string
  to: string
}

const RECENT_KEY = 'busmitra_recent_searches'
const MAX_RECENT = 5

export function getRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .filter(
        (item) =>
          item && typeof item.from === 'string' && typeof item.to === 'string'
      )
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function saveRecentSearch(from: string, to: string): RecentSearch[] {
  const key = normalize(from) + '|' + normalize(to)
  const others = getRecentSearches().filter(
    (item) => normalize(item.from) + '|' + normalize(item.to) !== key
  )
  const list = [{ from, to }, ...others].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // storage blocked: searching still works, it just isn't remembered
  }
  return list
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_KEY)
  } catch {
    // ignore
  }
}
const OPERATOR_INFO: Record<string, { label: string; className: string }> = {
  government: { label: 'Government', className: 'operator-government' },
  private: { label: 'Private', className: 'operator-private' },
}

export const getOperator = (operator: string) =>
  OPERATOR_INFO[operator] ?? {
    label: 'Operator unknown',
    className: 'operator-unknown',
  }
  export type Transfer = {
  from_name: string
  from_district: string
  to_name: string
  to_district: string
  mode: string
  minutes: number
  note: string
}

export const TRANSFER_MODES: Record<string, string> = {
  walk: 'Walk',
  city_bus: 'City bus',
  auto: 'Auto',
  e_rickshaw: 'E-rickshaw',
}
export const FARE_PER_STOP = 10 // demo fare in rupees, per stop, per person. Keep the same as in main.py

export type Ticket = {
  id: string
  route_id: number
  bus_number: string
  operator: string
  from_stop: string
  to_stop: string
  departure: string
  passengers: number
  passenger_name: string
  phone: string
  fare: number
  payment_method: string
  txn_id: string
  status: 'confirmed' | 'cancelled'
  booked_at: string
  cancelled_at: string | null
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}