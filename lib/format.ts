// Kleine formatteer-helpers voor de UI.

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const eenheden = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), eenheden.length - 1)
  const waarde = bytes / Math.pow(1024, i)
  return `${waarde.toFixed(i === 0 ? 0 : waarde >= 100 ? 0 : 1)} ${eenheden[i]}`
}

// 'YYYY-MM-DD HH:MM:SS' (SQLite datetime, UTC) → leesbaar NL.
export function formatDatum(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function formatDatumKort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Emoji-icoon op basis van MIME/bestandsnaam.
export function bestandIcoon(mime: string, naam: string): string {
  const m = (mime || '').toLowerCase()
  const ext = (naam.split('.').pop() || '').toLowerCase()
  if (m.startsWith('image/')) return '🖼️'
  if (m.startsWith('video/')) return '🎬'
  if (m.startsWith('audio/')) return '🎵'
  if (m === 'application/pdf' || ext === 'pdf') return '📕'
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return '🗜️'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return '📘'
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return '📗'
  if (['ppt', 'pptx', 'odp'].includes(ext)) return '📙'
  if (['txt', 'md'].includes(ext)) return '📄'
  return '📦'
}
