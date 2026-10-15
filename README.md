# PulseCheck API Monitor & Integration Tester

A portfolio project for building HTTP requests, inspecting responses, validating JSON and testing webhooks.

- **Frontend:** Next.js (App Router), TypeScript, React, Tailwind CSS, Lucide
- **Backend:** Python, FastAPI, Pydantic, HTTPX (served as a Vercel Python function)
- **Tests:** Pytest with mocked outbound HTTP and mocked DNS (no internet needed)
- **Storage:** browser `localStorage` only. No database, Docker, paid API or AI API.

## Features

| Area | What it does |
|---|---|
| Request builder | GET/POST/PUT/PATCH/DELETE, query params, headers, JSON body, bearer or API-key auth, 1-25 s timeout, saved configurations |
| Response inspector | Status code and text, timing, size, content type, headers, formatted JSON or plain text, clear errors for timeouts, bad URLs, connection failures and blocked requests. 404/500 are shown as normal responses |
| JSON validator | Expected field paths and types (string, number, boolean, object, array, null); lists present, missing and wrong-type fields; revalidates without resending |
| History | Last 50 requests in this browser; reopen, rerun, delete, clear. Credentials are never stored |
| Webhook demo | `POST /api/webhook-test` acknowledges an event; session-only event viewer |
| Dashboard | Totals, HTTP successes, failures, average time, recent requests. HTTP success is shown separately from JSON validation |

> History is stored in your browser's localStorage. It is **not** synchronized across devices or browsers.

## Project layout

```
pulsecheck-api-monitor/
|- api/index.py            Vercel entrypoint (exports the FastAPI app)
|- pulsecheck/             Python backend: config, schemas, security (SSRF), executor,
|                          validators, webhook, ratelimit, redaction, main (routes)
|- tests/                  Pytest suite
|- app/ components/ lib/   Next.js frontend
|- examples/               Sample request and response JSON
|- requirements.txt        Python runtime deps (what Vercel installs)
|- requirements-dev.txt    Runtime + uvicorn + pytest (local)
|- vercel.json  next.config.mjs  package.json  .env.example
```

## Local setup (Windows, PowerShell, VS Code)

Requirements: Python **3.11 or newer** and Node.js **20.9 or newer** (check with `py --version` and `node --version`).

1. **Extract** the ZIP (right-click, Extract All). You get one folder, `pulsecheck-api-monitor`.
2. **Open in VS Code:** File > Open Folder and pick that folder. Open a terminal with Ctrl+` (PowerShell).
3. **Create and activate a Python virtual environment:**
   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```
   If PowerShell blocks the script, run once `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then activate again. Your prompt should start with `(.venv)`.
4. **Install Python dependencies:**
   ```powershell
   python -m pip install --upgrade pip
   pip install -r requirements-dev.txt
   ```
5. **Install Node dependencies:**
   ```powershell
   npm install
   ```
6. **Start the Python backend** (terminal 1, venv active):
   ```powershell
   npm run api
   ```
   It listens on http://127.0.0.1:8000. Check http://127.0.0.1:8000/api/health.
7. **Start the frontend** (terminal 2, use the + button in the terminal panel):
   ```powershell
   npm run dev
   ```
   Open http://localhost:3000. In development, Next.js forwards `/api/*` to port 8000.
8. **Try it:** Request builder, send `GET https://jsonplaceholder.typicode.com/todos/1`. In the inspector add `id` (number) and `title` (string), then Validate. Then try the Webhook tester, History and Overview. To see the SSRF protection, send `http://169.254.169.254/` and note the blocked error.

No environment variables are required locally. To try the allowlist, set it in the **backend terminal** before `npm run api`, for example `$env:PULSECHECK_ALLOWED_HOSTS="jsonplaceholder.typicode.com"`.

### Run the tests and checks

```powershell
pytest                    # Python tests (venv active)
npm run typecheck         # TypeScript
npm run build             # Production build of the frontend
```

The Python tests mock both HTTP and DNS, so they run offline.

## Deploy to Vercel (Hobby plan, free)

1. **Push to GitHub:**
   ```powershell
   git init
   git add .
   git commit -m "Initial commit: PulseCheck API Monitor"
   git branch -M main
   git remote add origin https://github.com/<your-username>/pulsecheck-api-monitor.git
   git push -u origin main
   ```
   Create the empty repository on github.com first (no README, no .gitignore). `.env` is git-ignored.
2. **Import:** on vercel.com choose Add New > Project and select the repository. Vercel detects Next.js; leave build settings as they are.
3. **Environment variables (recommended):** add `PULSECHECK_ALLOWED_HOSTS` (see `.env.example`) so your public demo can only call hosts you list. Then deploy.
4. **Verify:** open `https://<your-app>.vercel.app/api/health`, then use the app.

How it works on Vercel: `api/index.py` exports a FastAPI `app`, which Vercel's Python runtime serves as a function; `requirements.txt` is installed automatically; `.python-version` selects Python 3.12; `vercel.json` routes every `/api/*` path to that one function. The Next.js app serves everything else. Docs: https://vercel.com/docs/functions/runtimes/python and https://vercel.com/docs/frameworks/backend/fastapi

Optional: `npm i -g vercel` then `vercel dev` runs both apps on one port. It needs a Vercel login and is not required.

### Vercel Hobby plan limits that affect this project

- Functions run on short-lived, separate instances. There is no shared memory, background work or scheduling, so this app only does user-triggered requests.
- Function duration and request/response body sizes are capped by Vercel (current numbers: https://vercel.com/docs/limits). The app keeps its own limits well inside them: 25 s max timeout, `maxDuration` 30 s, 1 MB responses, 100 KB request bodies.
- Hobby is for personal, non-commercial use and has monthly usage allotments.
- Vercel's Python runtime has been described as Beta in its docs; check them if a deploy behaves differently from this README.

## Security design

Implemented and covered by tests (`tests/test_security.py`, `tests/test_executor.py`):

- Only `http`/`https`; no embedded credentials; ports limited to 80, 443, 8080, 8443.
- Localhost-style names, `.local`/`.internal` suffixes and known metadata host names are rejected.
- Host names are resolved and **every** returned address must be globally routable. Loopback, private, link-local, multicast, reserved, unspecified, carrier-grade NAT, IPv4-mapped/6to4/Teredo IPv6 forms and cloud-metadata IPs are blocked. A mixed answer (one public + one private) is rejected.
- The connection is **pinned to the validated IP** (Host header and TLS server name keep the original host), closing the gap DNS rebinding relies on.
- Redirects are followed manually, at most 3, and **each hop is re-validated**. Credentials are dropped when a redirect changes origin.
- No proxy support (`trust_env=False`); forbidden headers (Host, Content-Length, X-Forwarded-*, proxy headers); header-injection rejected.
- Timeouts bounded; response streamed and cut at 1 MB (after decompression); request bodies capped.
- Credentials are redacted from response bodies, headers, final URLs, error messages and logs, and never put in localStorage.
- Per-instance rate limit and optional host allowlist (`PULSECHECK_ALLOWED_HOSTS`).

Known limits:

- The rate limit is per serverless instance: a speed bump, not a quota. For real protection add Vercel's firewall/rate limiting or require login.
- With no allowlist, a public deployment can make outbound requests to any public host. For a public portfolio, **set the allowlist**.
- Redaction matches known secret strings; a server that transforms a secret (for example base64-encodes it) cannot be detected.
- Pinned-IP TLS relies on HTTPX/httpcore honouring the `sni_hostname` extension; it is covered by mocks but was not exercised against a real HTTPS server here.
- This is a demo and has not had an independent security audit.

To change the allowlist: edit `PULSECHECK_ALLOWED_HOSTS` (comma-separated; subdomains match) in Vercel > Settings > Environment Variables, then redeploy.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness |
| `POST /api/request` | Run a validated outbound request; returns status, timing, headers, body |
| `POST /api/validate-json` | Check JSON against expected paths and types |
| `POST /api/webhook-test` | Acknowledge a sample event |

Errors always look like `{"error": {"code": "...", "message": "..."}}` with status 400 (blocked), 413 (too large), 422 (invalid input), 429 (rate limited), 502 (connection failed or too many redirects), 504 (timeout). Examples are in `examples/`. Interactive docs run locally at http://127.0.0.1:8000/api/docs.

## Troubleshooting

- **`Activate.ps1 cannot be loaded`**: run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **`py` not found or too old**: install Python 3.11+ from python.org (tick "Install the py launcher"), reopen the terminal, and use `py -3.12 -m venv .venv` to pick a specific version. Once the venv is active, plain `python` and `pip` point at it.
- **`pytest` or `uvicorn` not recognised**: the venv is not active. Run `.\.venv\Scripts\Activate.ps1`.
- **"Could not reach the PulseCheck API" locally**: start `npm run api` in a second terminal.
- **Port 3000 or 8000 in use**: `npm run dev -- -p 3001`. For the API, change `--port` in `package.json` and set `$env:PULSECHECK_API_URL="http://127.0.0.1:<port>"` before `npm run dev`.
- **"Could not resolve host"**: check the URL spelling and your internet connection.
- **"not on the server's allowlist"**: add the host to `PULSECHECK_ALLOWED_HOSTS`.
- **Vercel `/api/health` is 404 or 500**: check Build and Function logs; confirm `api/index.py`, `requirements.txt` and `vercel.json` are committed at the repository root and the Root Directory is the project root.
- **Vercel build fails on Node version**: set Node 20+ in Project Settings > General.
- **History vanished**: it lives in one browser profile; clearing site data or using another browser hides it.

## License

MIT, see `LICENSE`.
