import nodemailer from 'nodemailer'
import { leesInstelling } from '@/lib/instellingen'
import { getDb } from '@/lib/db'

// E-mailnotificaties via Gmail SMTP (app-wachtwoord), net als de zusje-apps.
// Credentials komen uit de instellingen (Beheer → E-mail) met terugval op de
// server-env (GMAIL_USER / GMAIL_APP_PASSWORD).
// App-wachtwoord aanmaken: https://support.google.com/accounts/answer/185833

// Een naar transport vertaalde mailconfig. `methode` kiest tussen een eigen
// SMTP-server en Gmail (app-wachtwoord); beide monden uit in host/port/secure/auth.
export type MailConfig = {
  enabled: boolean
  methode: 'smtp' | 'gmail'
  afzender: string   // weergavenaam voor het From-veld
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string       // From-adres
}
export type MailResultaat = { ok: boolean; overgeslagen?: string; error?: string; naar?: string }

export function haalMailConfig(): MailConfig {
  const afzender = leesInstelling('mail_afzender') || 'Deel'
  const enabled = leesInstelling('mail_enabled', '0') === '1'
  const methode = leesInstelling('mail_methode', 'smtp') === 'gmail' ? 'gmail' : 'smtp'

  if (methode === 'gmail') {
    const user = (leesInstelling('mail_gmail_user') || process.env.GMAIL_USER || '').trim()
    // Google toont het app-wachtwoord met spaties; die halen we eruit.
    const pass = (leesInstelling('mail_gmail_wachtwoord') || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')
    return { enabled, methode, afzender, host: 'smtp.gmail.com', port: 465, secure: true, user, pass, from: user }
  }

  // Eigen SMTP-server.
  const host = (leesInstelling('mail_smtp_host') || process.env.SMTP_HOST || '').trim()
  const port = Number(leesInstelling('mail_smtp_port') || process.env.SMTP_PORT) || 587
  const secureRaw = leesInstelling('mail_smtp_secure') || String(process.env.SMTP_SECURE || '')
  const secure = secureRaw === '1' || secureRaw.toLowerCase() === 'true' || port === 465
  const user = (leesInstelling('mail_smtp_user') || process.env.SMTP_USER || '').trim()
  const pass = leesInstelling('mail_smtp_wachtwoord') || process.env.SMTP_PASS || ''
  const from = (leesInstelling('mail_smtp_from') || user).trim()
  return { enabled, methode, afzender, host, port, secure, user, pass, from }
}

export function mailGeconfigureerd(c: MailConfig): boolean {
  return !!(c.host && c.from && c.pass)
}

// Basis-URL voor links in e-mails. Zet SHARE_PUBLIC_URL in de server-env
// (bijv. https://deel.all-friends.nl). Zonder env vallen we terug op een relatief pad.
export function appUrl(pad = ''): string {
  const basis = (process.env.SHARE_PUBLIC_URL || '').replace(/\/+$/, '')
  const p = pad.startsWith('/') ? pad : `/${pad}`
  return basis ? `${basis}${p}` : p
}

export async function verstuurMail(c: MailConfig, naar: string, onderwerp: string, html: string): Promise<void> {
  if (!c.host || !c.from) throw new Error('E-mail is niet ingesteld')
  const transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: (c.user || c.pass) ? { user: c.user, pass: c.pass } : undefined,
  })
  await transporter.sendMail({ from: `${c.afzender} <${c.from}>`, to: naar, subject: onderwerp, html })
}

// ── HTML-sjablonen ──────────────────────────────────────────────────────────────
function omhulsel(afzender: string, inhoud: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <div style="background:#d97706;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:700;font-size:18px">📤 ${escapeHtml(afzender)}</div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:20px">${inhoud}</div>
    <p style="color:#999;font-size:12px;margin-top:16px;text-align:center">Automatisch verstuurd door Deel — bestanden delen.</p>
  </div>`
}

function knop(url: string, label: string): string {
  return `<p style="margin:22px 0"><a href="${escapeAttr(url)}" style="background:#d97706;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(label)}</a></p>
    <p style="color:#666;font-size:13px">Lukt de knop niet? Plak deze link in je browser:<br><span style="color:#2563eb;word-break:break-all">${escapeHtml(url)}</span></p>`
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]!))
}
function escapeAttr(s: string): string { return escapeHtml(s) }

// ── High-level verzenders (lezen zelf de config + enabled-vlag) ──────────────────

// Melding aan een bestaand account dat er iets met ze gedeeld is.
export async function mailDeelMelding(naar: string, delerNaam: string, wat: string): Promise<MailResultaat> {
  const c = haalMailConfig()
  if (!c.enabled) return { ok: false, overgeslagen: 'e-mail staat uit' }
  if (!naar) return { ok: false, overgeslagen: 'ontvanger heeft geen e-mailadres' }
  if (!mailGeconfigureerd(c)) return { ok: false, error: 'E-mail niet geconfigureerd' }
  const inhoud = `<p>Hoi,</p>
    <p><b>${escapeHtml(delerNaam)}</b> heeft <b>${escapeHtml(wat)}</b> met je gedeeld in Deel.</p>
    <p>Log in om het te bekijken onder <b>Gedeeld met mij</b>.</p>
    ${knop(appUrl('/gedeeld'), 'Open Deel')}`
  try {
    await verstuurMail(c, naar, `${delerNaam} heeft iets met je gedeeld`, omhulsel(c.afzender, inhoud))
    return { ok: true, naar }
  } catch (e) { return { ok: false, error: String(e) } }
}

// Uitnodiging voor een nieuw account (invite-link om een wachtwoord te kiezen).
export async function mailUitnodiging(naar: string, delerNaam: string, wat: string, inviteToken: string): Promise<MailResultaat> {
  const c = haalMailConfig()
  if (!c.enabled) return { ok: false, overgeslagen: 'e-mail staat uit' }
  if (!naar) return { ok: false, overgeslagen: 'ontvanger heeft geen e-mailadres' }
  if (!mailGeconfigureerd(c)) return { ok: false, error: 'E-mail niet geconfigureerd' }
  const inhoud = `<p>Hoi,</p>
    <p><b>${escapeHtml(delerNaam)}</b> heeft <b>${escapeHtml(wat)}</b> met je gedeeld via Deel en een account voor je aangemaakt.</p>
    <p>Kies een wachtwoord om het te bekijken:</p>
    ${knop(appUrl(`/uitnodiging/${inviteToken}`), 'Account activeren')}`
  try {
    await verstuurMail(c, naar, `${delerNaam} heeft bestanden met je gedeeld — activeer je account`, omhulsel(c.afzender, inhoud))
    return { ok: true, naar }
  } catch (e) { return { ok: false, error: String(e) } }
}

// Melding aan de eigenaar dat een van z'n gedeelde bestanden is gedownload.
// Gated op mail_enabled én mail_notify_download; eigenaar moet een e-mailadres hebben.
export async function mailDownloadMelding(bestandId: number, downloader: string): Promise<MailResultaat> {
  const c = haalMailConfig()
  if (!c.enabled) return { ok: false, overgeslagen: 'e-mail staat uit' }
  if (leesInstelling('mail_notify_download', '1') !== '1') return { ok: false, overgeslagen: 'downloadmeldingen uit' }
  if (!mailGeconfigureerd(c)) return { ok: false, error: 'E-mail niet geconfigureerd' }
  const db = getDb()
  const b = db.prepare(`
    SELECT b.originele_naam, u.email AS eig_email, u.weergavenaam AS eig_naam
    FROM bestand b JOIN gebruiker u ON u.id = b.eigenaar_id WHERE b.id = ?
  `).get(bestandId) as { originele_naam: string; eig_email: string | null; eig_naam: string } | undefined
  if (!b) return { ok: false, overgeslagen: 'bestand niet gevonden' }
  if (!b.eig_email) return { ok: false, overgeslagen: 'eigenaar heeft geen e-mailadres' }
  const totaal = (db.prepare('SELECT COUNT(*) n FROM download_log WHERE bestand_id = ?').get(bestandId) as { n: number }).n
  const wanneer = new Date().toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short' })
  const inhoud = `<p>Hoi ${escapeHtml(b.eig_naam)},</p>
    <p>Je gedeelde bestand <b>${escapeHtml(b.originele_naam)}</b> is zojuist gedownload.</p>
    <p style="color:#444">Door: <b>${escapeHtml(downloader)}</b><br>Wanneer: ${escapeHtml(wanneer)}<br>Totaal aantal downloads: <b>${totaal}</b></p>
    ${knop(appUrl('/'), 'Bekijk in Deel')}`
  try {
    await verstuurMail(c, b.eig_email, `Gedownload: ${b.originele_naam}`, omhulsel(c.afzender, inhoud))
    return { ok: true, naar: b.eig_email }
  } catch (e) { return { ok: false, error: String(e) } }
}

// Publieke link naar één of meer adressen sturen (vanuit de deel-dialoog).
export async function mailPubliekeLink(
  naar: string[], afzenderNaam: string, bestandNaam: string, url: string,
  opties: { wachtwoord?: boolean; preview?: boolean; bericht?: string },
): Promise<MailResultaat> {
  const c = haalMailConfig()
  if (!c.enabled) return { ok: false, overgeslagen: 'e-mail staat uit' }
  const ontvangers = naar.map(s => s.trim()).filter(Boolean)
  if (ontvangers.length === 0) return { ok: false, overgeslagen: 'geen ontvangers' }
  if (!mailGeconfigureerd(c)) return { ok: false, error: 'E-mail niet geconfigureerd' }
  const extra: string[] = []
  if (opties.preview) extra.push('Dit is een <b>alleen-beluisteren</b>-link (geen download).')
  if (opties.wachtwoord) extra.push('De link is beveiligd met een <b>wachtwoord</b> — dat stuurt de afzender je apart toe.')
  const bericht = opties.bericht ? `<p style="white-space:pre-wrap;border-left:3px solid #eee;padding-left:12px;color:#444">${escapeHtml(opties.bericht)}</p>` : ''
  const inhoud = `<p>Hoi,</p>
    <p><b>${escapeHtml(afzenderNaam)}</b> deelt een bestand met je via Deel: <b>${escapeHtml(bestandNaam)}</b>.</p>
    ${bericht}
    ${knop(url, opties.preview ? 'Beluisteren' : 'Bekijken / downloaden')}
    ${extra.length ? `<p style="color:#666;font-size:13px">${extra.join('<br>')}</p>` : ''}`
  try {
    await verstuurMail(c, ontvangers.join(', '), `${afzenderNaam} deelt "${bestandNaam}" met je`, omhulsel(c.afzender, inhoud))
    return { ok: true, naar: ontvangers.join(', ') }
  } catch (e) { return { ok: false, error: String(e) } }
}
