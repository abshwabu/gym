<?php

use Illuminate\Support\Facades\Route;

/*
| SPA catch-all — React Router handles client routes.
| API routes live under /api and are registered separately.
*/
Route::view('/{any?}', 'spa')->where('any', '.*');
