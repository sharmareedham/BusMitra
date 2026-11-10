import { formatDateTime, getOperator, type Ticket } from './shared'

export function downloadTicketImage(ticket: Ticket) {
  const scale = 2 // sharper image
  const width = 600
  const height = ticket.status === 'cancelled' ? 700 : 620

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(scale, scale)
  ctx.textAlign = 'center'

  const font = (size: number, weight = '400') =>
    `${weight} ${size}px system-ui, Arial, sans-serif`

  // shortens long text so it fits inside the ticket
  const fit = (text: string, maxWidth: number) => {
    if (ctx.measureText(text).width <= maxWidth) return text
    let short = text
    while (short.length > 1 && ctx.measureText(short + '…').width > maxWidth) {
      short = short.slice(0, -1)
    }
    return short + '…'
  }

  const line = (
    text: string,
    y: number,
    size: number,
    color: string,
    weight = '400'
  ) => {
    ctx.font = font(size, weight)
    ctx.fillStyle = color
    ctx.fillText(fit(text, width - 70), width / 2, y)
  }

  // background and dashed border
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = ticket.status === 'cancelled' ? '#b91c1c' : '#1d604b'
  ctx.lineWidth = 3
  ctx.setLineDash([10, 6])
  ctx.strokeRect(14, 14, width - 28, height - 28)
  ctx.setLineDash([])

  // header band
  ctx.fillStyle = '#1d604b'
  ctx.fillRect(14, 14, width - 28, 74)
  line('BusMitra', 64, 30, '#ffffff', '700')

  let y = 128
  line('DEMO TICKET · NOT VALID FOR TRAVEL', y, 13, '#8c7135', '700')
  y += 50
  line(ticket.id, y, 36, '#1d604b', '700')
  y += 48
  line(`${ticket.from_stop} → ${ticket.to_stop}`, y, 26, '#18332b', '700')
  y += 38
  line(
    `${getOperator(ticket.operator).label} · Bus ${ticket.bus_number}`,
    y,
    18,
    '#39735b',
    '600'
  )
  y += 56
  line(`Departs ${ticket.departure}`, y, 20, '#18332b')
  y += 36
  line(`Passengers: ${ticket.passengers}`, y, 20, '#18332b')
  y += 36
  line(`Name: ${ticket.passenger_name}`, y, 20, '#18332b')
  y += 36
  line(`Booked on ${formatDateTime(ticket.booked_at)}`, y, 18, '#687b6e')
  y += 34
  line(
    `Paid via ${ticket.payment_method} (demo) · ${ticket.txn_id}`,
    y,
    16,
    '#687b6e'
  )
  y += 60
  line(`Total paid: ₹${ticket.fare}`, y, 30, '#18332b', '700')

  if (ticket.status === 'cancelled') {
    y += 64
    line('CANCELLED', y, 34, '#b91c1c', '700')
    y += 34
    if (ticket.cancelled_at) {
      line(`Cancelled on ${formatDateTime(ticket.cancelled_at)}`, y, 16, '#b91c1c')
      y += 26
    }
    line(`Demo refund: ₹${ticket.fare}`, y, 16, '#b91c1c')
  }

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `busmitra-ticket-${ticket.id}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}