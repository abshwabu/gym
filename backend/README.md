# Apex Gym — Laravel + React (Vite)

Single deployable Laravel app for shared hosting. The React SPA lives under `resources/js` and is built by Vite into `public/build`.

## Local development

From this `backend/` directory:

```bash
composer install
cp .env.example .env   # if needed — APP_URL should be http://localhost:8000
php artisan key:generate
php artisan migrate
npm install

composer run dev
```

`composer run dev` starts **artisan serve** (port 8000), the queue worker, log tail, and Vite HMR together. Vite also opens the app in your browser at **APP_URL** (`http://localhost:8000`).

**Use the app at:** [http://localhost:8000](http://localhost:8000)  
Example: [http://localhost:8000/hr](http://localhost:8000/hr)

Port **5173** is Vite’s HMR server only. If you open e.g. `http://localhost:5173/hr`, it **302-redirects** to `http://localhost:8000/hr` (path preserved). Laravel serves the SPA via `spa.blade.php` + `@vite`; Vite hot-reloads assets.

API calls use relative `/api` paths (same origin).

### Manual two-terminal alternative

```bash
# Terminal 1
php artisan serve --host=127.0.0.1 --port=8000

# Terminal 2
npm run dev
```

Prefer **http://localhost:8000**. Visiting `:5173` redirects there automatically.

## Production / shared hosting build

On a machine with Node.js (build locally or in CI — shared hosting does **not** need Node at runtime):

```bash
composer install --no-dev --optimize-autoloader
npm install
npm run build
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Upload the Laravel app contents (this `backend/` directory) so the web root points at `public/`.

**Important:** `public/build/` is gitignored — always upload the folder produced by `npm run build` (or build on a CI step that includes it in the artifact).

Ensure these exist on the server:

- `public/build/` (from `npm run build`) — Vite hashed assets + manifest
- `.env` with production `APP_URL`, DB credentials, `APP_KEY`
- Writable `storage/` and `bootstrap/cache/`

No separate frontend server is required.

## Project layout

| Path | Role |
|------|------|
| `resources/js/` | React SPA (entry: `main.tsx`) |
| `resources/views/spa.blade.php` | HTML shell with `@vite` |
| `routes/web.php` | SPA catch-all |
| `routes/api.php` | JSON API |
| `public/build/` | Production assets (generated) |

The old standalone `frontend/` package is obsolete (SPA is in `resources/js`). Delete the repo-root `frontend/` folder if it still exists:

```bash
rm -rf ../frontend
```

## PWA note

Service worker files are emitted under `public/build/` (`sw.js`). For full-site PWA scope on shared hosting, configure the web server to send `Service-Worker-Allowed: /` for `/build/sw.js`, or install the app over HTTPS with that header via `.htaccess` if supported.
