<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#0f172a">
        <meta name="description" content="Multi-tenant offline-first Gym management portal">

        <title>{{ config('app.name', 'Apex Gym') }}</title>

        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <link rel="apple-touch-icon" href="/pwa-192x192.png">

        @viteReactRefresh
        @vite(['resources/js/main.tsx'])
    </head>
    <body>
        <div id="root"></div>
    </body>
</html>
