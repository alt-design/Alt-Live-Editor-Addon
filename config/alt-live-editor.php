<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Excluded field handles
    |--------------------------------------------------------------------------
    |
    | Fields with these handles are never made editable in the preview iframe.
    | Editing a slug or an id inline is almost always a mistake, so they're
    | excluded by default. Handles are matched exactly.
    |
    */

    'exclude_handles' => ['slug', 'id', 'url', 'permalink'],

    /*
    |--------------------------------------------------------------------------
    | Picker style
    |--------------------------------------------------------------------------
    |
    | Which UI opens when an editor clicks an image, entries, taxonomy or tags
    | field in the preview.
    |
    | "native"  - reveals and opens Statamic's own field in the publish sidebar.
    |             Familiar, and supports every option the fieldtype does, but it
    |             relies on the control panel's internal Vue components and can
    |             break between Statamic releases.
    |
    | "builtin" - opens this addon's self-contained picker inside the preview.
    |             Works with the sidebar hidden and doesn't touch Statamic
    |             internals, but supports a narrower set of field options.
    |
    | Set a string to apply one style everywhere, or an array to choose per
    | field type. Recognised keys: image, entries, taxonomy, tags.
    |
    */

    'picker' => [
        'image' => 'native',
        'entries' => 'native',
        'taxonomy' => 'native',

        // Statamic's tags fieldtype has no "open picker" action to trigger — the
        // native path can only focus the input — so the built-in editor is the
        // sensible default here.
        'tags' => 'builtin',
    ],

    /*
    |--------------------------------------------------------------------------
    | Empty fields
    |--------------------------------------------------------------------------
    |
    | Empty text fields are marked up too, so an editor can click the gap and
    | type. In Live Preview that makes the field count as filled, so a template
    | block wrapped in {{ if field }} appears in the preview but not on the live
    | site. Set this to false to leave empty fields alone: the preview then
    | matches the live site, but empty fields cannot be clicked into.
    |
    */

    'wrap_empty_fields' => true,

    /*
    |--------------------------------------------------------------------------
    | Debug logging
    |--------------------------------------------------------------------------
    |
    | When true, the addon logs what it's doing to the browser console. Handy
    | when a field won't bind to the publish form, noisy otherwise.
    |
    */

    'debug' => env('ALT_LIVE_EDITOR_DEBUG', false),

];
