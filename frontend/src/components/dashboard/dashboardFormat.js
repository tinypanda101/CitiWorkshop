// Formatting helpers for the dashboards (kept out of the component files so React's
// fast refresh keeps working).

const PRESET_NAMES = { 7: 'last 7 days', 30: 'last 30 days', 90: 'last 90 days' }

// "2026-10-21" in your own time zone (toISOString would use UTC and can be a day off).
function isoDate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// The dates a range button fills in, e.g. "last 7 days" = today and the 6 days before it.
export function presetRange(preset) {
  if (preset === 'all') return { preset, from: '', to: '' }
  const from = new Date()
  from.setDate(from.getDate() - (Number(preset) - 1))
  return { preset, from: isoDate(from), to: isoDate(new Date()) }
}

// For headings, e.g. "in the last 30 days".
export function describeRange({ preset, from, to }) {
  if (PRESET_NAMES[preset]) return `in the ${PRESET_NAMES[preset]}`
  if (from && to) return `from ${from} to ${to}`
  if (from) return `since ${from}`
  if (to) return `up to ${to}`
  return 'in total'
}

// Hours as "45m", "3h 20m" or "2d 4h"; a dash when there's nothing to average yet.
export function formatHours(hours) {
  if (hours === null || hours === undefined) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 24) return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`
  return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`
}

export function plural(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`
}
