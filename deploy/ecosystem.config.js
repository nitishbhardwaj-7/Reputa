// pm2 process definition for the Reputa API. Secrets live in backend/.env (loaded by
// the app itself); only non-secret runtime settings are set here.
module.exports = {
  apps: [
    {
      name: "reputa-api",
      cwd: "/opt/reputa/backend",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: 4100,
        PYTHON_EXECUTABLE: "/opt/pyenv/bin/python",
      },
    },
  ],
};
