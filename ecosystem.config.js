module.exports = {
  apps: [
    {
      name: 'bot-vasnet360',
      script: 'serve.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      time: true
    }
  ]
};
