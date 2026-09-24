// PM2 process definition for the backend. Bounds the Node heap so the process
// stops growing toward the 2 GB box's ceiling: without an explicit cap, V8
// sizes old-space to ~half of physical RAM (~1 GB), which leaves the EC2 host
// at 90%+ memory and lets the OS OOM-killer restart the app (historically 850+
// restarts).
module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: __dirname,
      script: 'src/index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // PM2 restarts us before the OS OOM-killer can take the box down.
      max_memory_restart: '1100M',
      // Keep the V8 heap small: old-space 640MB forces GC earlier so RSS
      // plateaus ~700-800MB instead of ~1GB+. Semi-space kept modest too.
      node_args: [
        '--max-old-space-size=640',
        '--max-semi-space-size=16',
        '--max-http-header-size=16384',
      ],
      restart_delay: 3000,
      exp_backoff_restart_delay: 10000,
      kill_timeout: 8000,
      min_uptime: 20000,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};