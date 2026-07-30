import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite (:5173) is HMR-only with laravel-vite-plugin. Navigating there shows a
 * placeholder (Vite rewrites routes to /index.html). Redirect document requests
 * to Laravel (APP_URL) so /hr on :5173 lands on http://localhost:8000/hr.
 * Asset/HMR paths still hit Vite unchanged. Dev-only; unused in production build.
 */
function redirectHtmlToLaravel(appUrl) {
    const origin = appUrl.replace(/\/$/, '');

    return {
        name: 'redirect-html-to-laravel',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                    return next();
                }

                const url = req.url ?? '/';
                const pathname = decodeURIComponent(url.split('?')[0] ?? '/');

                // Vite internals, source, and static files stay on :5173.
                if (
                    pathname.startsWith('/@') ||
                    pathname.startsWith('/node_modules') ||
                    pathname.startsWith('/resources') ||
                    pathname.startsWith('/__vite') ||
                    pathname.startsWith('/.vite') ||
                    pathname === '/favicon.ico' ||
                    /\.\w+$/.test(pathname)
                ) {
                    return next();
                }

                res.statusCode = 302;
                res.setHeader('Location', `${origin}${url}`);
                res.end();
            });
        },
    };
}

export default defineConfig(({ mode }) => {
    const appUrl = (loadEnv(mode, process.cwd(), '').APP_URL || 'http://localhost:8000').replace(/\/$/, '');

    return {
        plugins: [
            // Before laravel-vite-plugin so navigations never hit the placeholder.
            redirectHtmlToLaravel(appUrl),
            laravel({
                input: ['resources/js/main.tsx'],
                refresh: true,
            }),
            react(),
            VitePWA({
                registerType: 'autoUpdate',
                injectRegister: 'auto',
                // Laravel Vite emits JS/CSS under /build/; keep SW registration paths aligned.
                buildBase: '/build/',
                scope: '/',
                includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
                workbox: {
                    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                    // SyncManager handles offline API; Workbox must not intercept POST/PATCH.
                    navigateFallback: null,
                },
                manifest: {
                    name: 'Apex Gym Management SaaS',
                    short_name: 'Apex Gym',
                    description: 'Multi-tenant offline-first Gym management portal',
                    theme_color: '#0f172a',
                    background_color: '#0f172a',
                    display: 'standalone',
                    start_url: '/',
                    scope: '/',
                    icons: [
                        {
                            src: '/pwa-192x192.png',
                            sizes: '192x192',
                            type: 'image/png',
                        },
                        {
                            src: '/pwa-512x512.png',
                            sizes: '512x512',
                            type: 'image/png',
                        },
                    ],
                },
            }),
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'resources/js'),
            },
        },
        server: {
            host: '127.0.0.1',
            port: 5173,
            strictPort: true,
            // Open Laravel (SPA), not the Vite HMR port.
            open: appUrl,
            watch: {
                ignored: ['**/storage/framework/views/**'],
            },
        },
    };
});
