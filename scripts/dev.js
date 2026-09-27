// scripts/dev.js
// Starts BOTH halves of NetGuard with one command: `npm run dev` from the
// project root.
//
// Why this exists: the client (Vite, :5173) proxies /api to the server
// (Express, :5000). Running only the client makes every request fail with
// "http proxy error: ECONNREFUSED", because nothing is listening on :5000.
// Starting them together removes that whole class of mistake.
//
// No dependencies on purpose — it spawns the locally installed nodemon and
// vite entry scripts with the current Node binary, so there is nothing extra
// to `npm install` at the root and no shell quoting to get wrong on Windows.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// ANSI colors. Kept minimal so the two log streams stay tellable apart.
const color = {
  server: '\x1b[36m',
  client: '\x1b[35m',
  atlas: '\x1b[33m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
};

const targets = [
  {
    name: 'server',
    cwd: path.join(root, 'server'),
    // nodemon restarts the API on file changes, matching `npm run dev` in server/
    script: path.join(root, 'server', 'node_modules', 'nodemon', 'bin', 'nodemon.js'),
    args: ['server.js'],
    install: 'cd server && npm install',
  },
  {
    name: 'client',
    cwd: path.join(root, 'client'),
    script: path.join(root, 'client', 'node_modules', 'vite', 'bin', 'vite.js'),
    args: [],
    install: 'cd client && npm install',
  },
];

// Fail early with a readable message rather than a spawn ENOENT stack trace.
for (const t of targets) {
  if (!fs.existsSync(t.script)) {
    console.error(
      `\n[dev] Cannot start the ${t.name}: dependencies are not installed.\n` +
        `[dev] Run:  ${t.install}\n`
    );
    process.exit(1);
  }
}

const children = [];
let shuttingDown = false;

// nodemon keeps running after the app crashes (it waits for a file change),
// so the crash never reaches our 'exit' handler. Watch the stream instead and
// spell out what a dead API means for the client.
const explainServerCrash = () => {
  console.error(
    `\n${color.dim}[dev] The API is NOT running, so signing in will fail with\n` +
      `[dev] "http proxy error: ECONNREFUSED". Fix the [server] error above,\n` +
      `[dev] then save any file in server/ — nodemon will restart it.${color.reset}\n`
  );
};

// Prefix every line so interleaved output stays readable.
const pipe = (stream, name, isError) => {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep the trailing partial line for the next chunk
    for (const line of lines) {
      const out = `${color[name]}[${name}]${color.reset} ${line}`;
      if (isError) console.error(out);
      else console.log(out);
      if (name === 'server' && line.includes('app crashed')) explainServerCrash();
    }
  });
};

const start = (target) => {
  const child = spawn(process.execPath, [target.script, ...target.args], {
    cwd: target.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  pipe(child.stdout, target.name, false);
  pipe(child.stderr, target.name, true);

  child.on('exit', (code, signal) => {
    // A signal here means someone stopped us (Ctrl+C, a killed terminal) —
    // that is a normal shutdown, not a failure worth reporting.
    if (shuttingDown || signal) return shutdown(0);
    console.error(
      `\n${color[target.name]}[${target.name}]${color.reset} exited (code ${code}).`
    );
    // One half is useless without the other, so stop both.
    shutdown(code ?? 1);
  });

  children.push(child);
};

const shutdown = (code) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// Atlas only accepts database connections from IPs on its access list, and a
// home or campus IP changes on every reconnect. Try to add the current one
// before the API starts. The script no-ops unless Atlas API keys are set in
// server/.env, and never fails the run — a database error is a clearer signal
// than an aborted startup.
const preflight = () =>
  new Promise((resolve) => {
    const script = path.join(root, 'server', 'scripts', 'allowMyIp.js');
    if (!fs.existsSync(script)) return resolve();

    const child = spawn(process.execPath, [script], {
      cwd: path.join(root, 'server'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    pipe(child.stdout, 'atlas', false);
    pipe(child.stderr, 'atlas', true);
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });

console.log(
  `${color.dim}[dev] Starting NetGuard — API on http://localhost:5000, app on http://localhost:5173${color.reset}`
);
preflight().then(() => {
  if (!shuttingDown) targets.forEach(start);
});
