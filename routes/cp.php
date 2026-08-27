<?php

use AltDesign\AltLiveEditor\Http\Controllers\BardParseController;
use AltDesign\AltLiveEditor\Http\Controllers\EntriesPickerController;
use AltDesign\AltLiveEditor\Http\Controllers\RowOptionsController;
use AltDesign\AltLiveEditor\Http\Controllers\SetsConfigController;
use AltDesign\AltLiveEditor\Http\Controllers\TaxonomyPickerController;
use Illuminate\Support\Facades\Route;

Route::post('alt-live-editor/parse-bard', BardParseController::class)
    ->name('alt-live-editor.parse-bard');

Route::post('alt-live-editor/sets-config', SetsConfigController::class)
    ->name('alt-live-editor.sets-config');

Route::post('alt-live-editor/entries', EntriesPickerController::class)
    ->name('alt-live-editor.entries');

Route::post('alt-live-editor/taxonomy', TaxonomyPickerController::class)
    ->name('alt-live-editor.taxonomy');

Route::post('alt-live-editor/row-options', RowOptionsController::class)
    ->name('alt-live-editor.row-options');
