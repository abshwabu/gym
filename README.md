# Apex Gym

Deployable app root: **`backend/`** (Laravel + React via Vite).

## Local development

```bash
cd backend
composer install && npm install
composer run dev
```

Open **http://localhost:8000** (e.g. `/hr`). Do not use Vite’s `:5173` URL — that is HMR only.

See [backend/README.md](backend/README.md) for full setup and shared-hosting deploy steps.

The standalone `frontend/` folder is obsolete after the Vite integration — remove it with `rm -rf frontend` if it is still present.
