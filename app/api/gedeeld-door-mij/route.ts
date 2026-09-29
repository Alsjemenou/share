import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Overzicht van alles wat de ingelogde gebruiker heeft gedeeld: publieke links,
// bestanden gedeeld met personen/groepen, en gedeelde mappen.
export async function GET() {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const db = getDb()

  const links = db.prepare(`
    SELECT dl.id, dl.token, dl.bestand_id, b.originele_naam AS bestand_naam, b.mime,
           dl.verloopt_op, dl.max_downloads, dl.download_count, dl.actief, dl.modus,
           (dl.wachtwoord_hash IS NOT NULL) AS heeft_wachtwoord
    FROM deel_link dl JOIN bestand b ON b.id = dl.bestand_id
    WHERE b.eigenaar_id = @u
    ORDER BY dl.created_at DESC
  `).all({ u: g.id })

  const accounts = db.prepare(`
    SELECT da.id, b.originele_naam AS bestand_naam, b.mime, u.weergavenaam AS ontvanger, u.status AS ontvanger_status, da.created_at
    FROM deel_account da JOIN bestand b ON b.id = da.bestand_id JOIN gebruiker u ON u.id = da.gebruiker_id
    WHERE da.gedeeld_door = @u
    ORDER BY da.created_at DESC
  `).all({ u: g.id })

  const groepen = db.prepare(`
    SELECT dg.id, b.originele_naam AS bestand_naam, b.mime, gr.naam AS groep_naam,
           (SELECT COUNT(*) FROM groep_lid gl WHERE gl.groep_id = gr.id) AS aantal_leden, dg.created_at
    FROM deel_groep dg JOIN bestand b ON b.id = dg.bestand_id JOIN groep gr ON gr.id = dg.groep_id
    WHERE dg.gedeeld_door = @u
    ORDER BY dg.created_at DESC
  `).all({ u: g.id })

  const mappen = db.prepare(`
    SELECT dm.id, dm.map_id, m.naam AS map_naam, dm.ontvanger_type, dm.mag_uploaden, dm.created_at,
           CASE WHEN dm.ontvanger_type = 'groep' THEN (SELECT naam FROM groep WHERE id = dm.ontvanger_id)
                ELSE (SELECT weergavenaam FROM gebruiker WHERE id = dm.ontvanger_id) END AS ontvanger,
           (SELECT COUNT(*) FROM bestand b WHERE b.map_id = dm.map_id) AS aantal_bestanden
    FROM deel_map dm JOIN map m ON m.id = dm.map_id
    WHERE dm.gedeeld_door = @u
    ORDER BY dm.created_at DESC
  `).all({ u: g.id })

  return NextResponse.json({ links, accounts, groepen, mappen })
}
