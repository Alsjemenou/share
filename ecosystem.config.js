// PM2 configuratie voor de Deel-app (bestanden delen).
// Start met:  pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'share',
      script: 'npm',
      args: 'start',
      cwd: __dirname,
      env: {
        PORT: '3003',
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
    },
  ],
}
