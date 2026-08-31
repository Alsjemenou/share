// PM2 configuratie voor de Deel-app (bestanden delen).
// Start met:  pm2 start ecosystem.config.js
const fs = require('fs')
const path = require('path')

// Optioneel: server-specifieke opslagpaden (bijv. een SMB/CIFS-mount) uit
// data/storage.env — NIET in git (data/ is genegeerd). Formaat: KEY=waarde per regel.
// Zo houd je de lokale schijf klein zonder de repo of dit bestand aan te passen.
const extra = {}
try {
  const p = path.join(__dirname, 'data', 'storage.env')
  if (fs.existsSync(p)) {
    for (const regel of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = regel.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m && !regel.trim().startsWith('#')) extra[m[1]] = m[2]
    }
  }
} catch { /* geen storage.env — gebruik standaardpaden onder data/ */ }

module.exports = {
  apps: [
    {
      name: 'share',
      script: 'npm',
      args: 'start',
      cwd: __dirname,
      env: {
        PORT: '3005',
        NODE_ENV: 'production',
        ...extra,
      },
      max_memory_restart: '500M',
    },
  ],
}
