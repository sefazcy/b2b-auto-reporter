// pm2 process file — alternative to Docker.
// Usage: pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'b2b-auto-reporter',
      script: 'src/index.js',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      // Back off between restarts so a crash loop doesn't hammer the DB/Telegram
      exp_backoff_restart_delay: 1000,
      max_memory_restart: '200M',
      time: true,
    },
  ],
};
