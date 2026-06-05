const CSV_COLUMNS = [
  {
    label: 'timestamp',
    value: (item) => {
      const date = toDate(item.timestamp ?? item.clientTimestamp)
      return date ? date.toISOString() : ''
    },
  },
  { label: 'clientTimestamp', value: (item) => item.clientTimestamp ?? '' },
  { label: 'eventType', value: (item) => item.eventType ?? '' },
  { label: 'userId', value: (item) => item.userId ?? '' },
  { label: 'sessionId', value: (item) => item.sessionId ?? '' },
  { label: 'route', value: (item) => item.route ?? '' },
  { label: 'docId', value: (item) => item.docId ?? '' },
  { label: 'viewportWidth', value: (item) => item.viewport?.width ?? '' },
  { label: 'viewportHeight', value: (item) => item.viewport?.height ?? '' },
  { label: 'metadata', value: (item) => item.metadata ?? {} },
]

function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function csvEscape(value) {
  if (value == null) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const normalized = text.replace(/\r?\n/g, ' ')
  if (!/[",\n\r]/.test(normalized)) return normalized
  return `"${normalized.replace(/"/g, '""')}"`
}

export function buildInteractionLogCsv(logItems) {
  const header = CSV_COLUMNS.map((column) => csvEscape(column.label)).join(',')
  const rows = logItems.map((item) => (
    CSV_COLUMNS.map((column) => csvEscape(column.value(item))).join(',')
  ))
  return `\uFEFF${[header, ...rows].join('\r\n')}`
}

export const INTERACTION_LOG_CSV_HEADER = CSV_COLUMNS.map((column) => column.label).join(',')
