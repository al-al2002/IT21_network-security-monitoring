# NetGuard

NetGuard is a dark-themed network security monitoring dashboard built as a full-stack capstone project. It combines a React + Vite client with an Express + MongoDB backend, live Socket.io event streams, and security analytics for threats, incidents, and detection rules.

## Features

- Real-time event monitoring with live Socket.io updates
- Security dashboard with summary metrics and charts
- Threat severity tracking and incident management
- Admin-only rule management and incident assignment
- PDF incident report export
- Dark navy/slate interface with red, amber, and green severity indicators

## Data sources

Threats are detections, not stored data: the analysis engine
(`server/services/analyzer.js`) creates a threat when a detection rule matches
incoming events. The events and the threat intelligence come from real sources:

| Source | What it provides | Code |
|---|---|---|
| **CIC-IDS2017 dataset** (Canadian Institute for Cybersecurity, UNB) | Real network flows captured on a testbed while SSH/FTP brute force, port scans and Ares botnet traffic were run against it, each labelled with its attack type | `server/services/datasetReplay.js` |
| **NetGuard's own login endpoint** | Every real sign-in attempt, successful or failed, recorded as a `login_attempt` event | `server/controllers/authController.js` |
| **abuse.ch Feodo Tracker** | Live blocklist of botnet command-and-control server IPs, used by the *Blacklisted IP* rule and refreshed every 6 hours | `server/services/threatIntel.js` |

How the dataset is replayed:

- `server/data/cicids2017-sample.csv` is a sample of unmodified flows from the
  original `GeneratedLabelledFlows` CSVs (Tuesday: FTP/SSH-Patator; Friday:
  PortScan, Bot; plus BENIGN traffic). `server/scripts/buildReplaySample.js`
  rebuilds it from the original files.
- Attack and benign flows are arranged in alternating runs so detections
  appear every couple of minutes instead of being bunched into the hours
  the original attacks ran.
- Each flow's timestamp is set to the replay time so the rolling-window rules
  work; the original capture time is kept in `rawData.capturedAt`, along with
  the dataset label and flow ID.

Label mapping: `SSH-Patator` / `FTP-Patator` → failed `login_attempt`,
`PortScan` → `port_scan`, `Bot` → `malware_signature`, `BENIGN` → `traffic`.
The dataset has no firewall logs, so the *Firewall Block Flood* rule only fires
in simulator mode.

Set `EVENT_SOURCE` in `server/.env` to `replay` (default), `simulator` (the
old synthetic generator) or `none` (real login attempts only).

## Tech Stack

- Frontend: React, Vite, Recharts
- Backend: Node.js, Express
- Database: MongoDB
- Real-time updates: Socket.io

## Run locally

NetGuard is two programs: the React client (http://localhost:5173) and the
Express API (http://localhost:5000). **Both must be running** — the client
proxies `/api` to the API, so starting only the client makes every request,
including login, fail with `ECONNREFUSED`.

From the `netguard/` folder:

```bash
npm run install:all   # first time only
npm run dev           # starts the API and the client together
```

Then open http://localhost:5173.

<details>
<summary>Running the two halves in separate terminals instead</summary>

```bash
cd server && npm install && npm run dev    # terminal 1
cd client && npm install && npm run dev    # terminal 2
```

</details>

## Default admin account

A seed admin can be created with:

```bash
npm run seed
```

Default credentials:

- Email: admin@netguard.ph
- Password: admin123

> If MongoDB Atlas is used, allow your current IP in Atlas Network Access before running the seed script. Otherwise the database connection will fail and the admin cannot be created.

## Troubleshooting

### Login fails with `[vite] http proxy error: ECONNREFUSED`

The client is running but the API on port 5000 is not, so there is nothing to
proxy `/api/auth/login` to. There are two causes, and both look identical from
the browser:

1. **The API was never started.** Use `npm run dev` from `netguard/` rather
   than from `client/` — the root script starts both halves.
2. **The API started, then exited because MongoDB refused the connection.**
   Look for `[db] connection error` in the `[server]` output.

### `[db] connection error: ... IP that isn't whitelisted`

MongoDB Atlas only accepts connections from IP addresses on its access list,
and your IP changes whenever you reconnect to the internet or switch networks.
This is why the project can work one day and fail the next with no code change.

Fix it at [cloud.mongodb.com](https://cloud.mongodb.com): open your project,
go to **Network Access**, click **Add IP Address**, then
**Add Current IP Address**, and confirm. Wait for the entry to show *Active*,
then start the app again.

> To stop having to do this on every network change, you can add `0.0.0.0/0`
> (allow from anywhere) instead. That leaves the database reachable from the
> whole internet and protected only by the password in `server/.env`, so it is
> reasonable for a throwaway class database and a bad idea for anything real.

### Adding your IP automatically

`npm run dev` can add your current IP to the Atlas access list on every start,
so you never have to open the Atlas website when your network changes.

1. In Atlas, go to **Access Manager -> API Keys -> Create API Key**
2. Give it the **Project IP Access List Admin** role
3. Copy the public and private keys, and your **Project ID** from
   *Project Settings*
4. Add all three to `server/.env`:

```bash
ATLAS_PUBLIC_KEY=your-public-key
ATLAS_PRIVATE_KEY=your-private-key
ATLAS_PROJECT_ID=your-project-id
```

Run it on its own with `npm run allow-ip`, or just start the app — `npm run dev`
does it first, then launches the API and the client.

If those variables are blank the step is skipped and nothing else changes. It
also never aborts startup on failure: a database connection error is a clearer
signal than a halted run, so you still get a useful message either way.

## Deploy to Render (free)

NetGuard deploys as **one** Render web service: the Express server runs the
API and Socket.io and also serves the built React app, so everything is on one
URL. The database stays on MongoDB Atlas (free M0 cluster). Vercel/Netlify
won't work for the backend — it needs a long-running process for Socket.io and
the event replay.

1. **Atlas → Network Access → Add IP Address → `0.0.0.0/0`.** Render's free
   instances have no fixed IP, so Atlas must accept connections from anywhere.
   The database is then protected only by its password — use a strong one.
2. **Render → New → Blueprint →** connect this GitHub repo. Render reads
   `render.yaml`.
3. When asked, paste your Atlas connection string as **`MONGO_URI`**.
   `JWT_SECRET` is generated automatically.
4. Wait for the build to finish, then open the `https://<name>.onrender.com` URL.

Free-tier notes:

- The service **sleeps after 15 minutes without visitors** and takes about a
  minute to wake up; the replay stops while it sleeps. Before a demo, open the
  site a few minutes early.
- If the deployed app and your local `npm run dev` use the same Atlas database,
  both replay into it at once. Stop the local server, or set `EVENT_SOURCE=none`
  in `server/.env`, while the deployed one is running.
- `render.yaml` sets `EVENT_RETENTION_DAYS=7`: MongoDB deletes events older
  than 7 days so the database stays under the free 512 MB. Threats and
  incidents are kept.
- `server/scripts/cleanupSimulatedData.js` removes data left by the old
  simulator (dry run by default; `--yes` to delete).

## Project structure

- client/: React dashboard frontend
- server/: Express API, MongoDB models, event sources (dataset replay, login events, simulator)
- server/data/: CIC-IDS2017 replay sample

## Security note

This project is intended for demonstration and learning purposes. For production use, add hardened auth, environment secrets, input validation, rate limiting, and deployment-level monitoring.
