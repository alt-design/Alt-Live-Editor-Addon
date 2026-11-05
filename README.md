# Alt Live Editor

Edit an entry's content by clicking it directly in the Statamic Live Preview iframe,
rather than hunting for the matching field in the publish sidebar.

Text and Bard fields become editable in place. Images, entry pickers, taxonomy fields
and tags get a click-to-edit overlay. Page builder rows can be added, reordered,
configured and deleted from the preview itself.

## Requirements

- Statamic **6.40** or later (tested on 6.40.0)
- PHP 8.2+

## Installation

```bash
composer require alt-design/alt-live-editor
```

Statamic publishes the control panel script into `public/vendor/alt-live-editor` itself,
after every `composer install` and `composer update`, through the `statamic:install` step
that a standard Statamic site runs after Composer. If your site's `composer.json` does not
run that step, publish it yourself after installing or upgrading:

```bash
php artisan vendor:publish --tag=alt-live-editor --force
```

To publish the config file:

```bash
php artisan vendor:publish --tag=alt-live-editor-config
```

## How it works

There are two halves.

**In the control panel** (`resources/js/cp.js`) the addon listens for Statamic's
`publish-container-created` event and keeps a reference to the live publish form. When
the preview sends an edit, it resolves the field's dot-path within the form's values and
calls `setFieldValue`, then nudges Live Preview to re-render.

**In the preview iframe** (`resources/js/iframe.js`, injected into the response on
Live Preview requests only) the addon finds elements the templates marked as editable,
makes them `contenteditable`, and posts changes back to the parent window.

The marking happens in PHP. `AutoWrap` hooks the Antlers cascade and, **only when
`request()->isLivePreview()` is true**, replaces each of the entry's values with one
that renders itself wrapped in a `data-alt-editable-*` span. Your front end is
completely untouched outside Live Preview: no markup changes, no extra requests.

Nothing is written to disk from the preview. Edits are pushed into the publish form
exactly as if they'd been typed in the sidebar; the editor still has to press **Save**.
That's why the confirmation pill says *Updated* rather than *Saved*.

## Template tags

Scalar fields on the entry are wrapped automatically. For anything nested (a page
builder row, an image, a relationship), wrap it explicitly so the addon knows what it's
looking at.

### `{{ alt_live_editor }}`

Marks arbitrary content as an editable field.

```antlers
{{ alt_live_editor handle="heading" as="h1" }}{{ heading }}{{ /alt_live_editor }}
```

| Parameter | Default | Description |
| --- | --- | --- |
| `handle` | *required* | The field handle to bind to |
| `as` | `span` | Element to wrap with |
| `type` | `text` | `text` or `html`: whether to send `innerText` or `innerHTML` |

### `{{ alt_live_editor:row }}`

Wraps one page builder row so it gets the hover toolbar (move, settings, delete) and
the "add section" buttons. Use it inside your set loop. It reads `index`, `type` and
`last` from the loop context automatically.

```antlers
{{ page_builder }}
    {{ alt_live_editor:row }}
        {{ partial src="_page_builder/{type}" }}
    {{ /alt_live_editor:row }}
{{ /page_builder }}
```

### `{{ alt_live_editor:image }}`

```antlers
{{ alt_live_editor:image handle="hero_image" container="assets" }}
    <img src="{{ hero_image:url }}" alt="{{ hero_image:alt }}">
{{ /alt_live_editor:image }}
```

| Parameter | Description |
| --- | --- |
| `handle` | *required*, the assets field handle |
| `container` | Asset container, defaults to `assets` |
| `index` | For a gallery loop, which item this is, so each slide can be replaced |
| `rowid` | Override the auto-detected parent set id |

### `{{ alt_live_editor:entries }}` / `{{ alt_live_editor:taxonomy }}` / `{{ alt_live_editor:tags }}`

```antlers
{{ alt_live_editor:entries handle="featured" collections="blog" max="3" }}
    {{ featured }}<a href="{{ url }}">{{ title }}</a>{{ /featured }}
{{ /alt_live_editor:entries }}
```

`entries` takes `collections` and `max`; `taxonomy` takes `taxonomies` and `max`;
`tags` takes just `handle`. All three accept `rowid`.

## Configuration

`config/alt-live-editor.php`:

| Key | Default | Description |
| --- | --- | --- |
| `exclude_handles` | `slug`, `id`, `url`, `permalink` | Never made editable |
| `picker` | see below | Which picker UI opens for relationship-ish fields |
| `wrap_empty_fields` | `true` | Makes empty text fields clickable in the preview. A template block wrapped in `{{ if field }}` then shows in the preview even when the field is empty, which the live site would not. Set to `false` to match the live site |
| `debug` | `false` | Log to the browser console (`ALT_LIVE_EDITOR_DEBUG`) |

### Picker styles

Two implementations ship, chosen per field type:

- **`native`** reveals Statamic's own field in the publish sidebar and opens its
  picker. Familiar, and supports every option the fieldtype does. It drives Statamic's
  internal Vue components, so it's the half most likely to need attention after a
  Statamic upgrade.
- **`builtin`** opens this addon's own picker inside the preview. Works with the
  sidebar hidden and doesn't touch Statamic internals, but supports a narrower set of
  options (no folder-level permissions, no custom fieldtype config).

```php
'picker' => [
    'image' => 'native',
    'entries' => 'native',
    'taxonomy' => 'native',
    'tags' => 'builtin',
],
```

Set `'picker' => 'builtin'` as a plain string to use the built-in pickers everywhere.

`tags` defaults to `builtin` because Statamic's tags fieldtype has no picker to open:
the native path can only focus the input, which isn't much of an editing experience.

## Security

The two halves talk over `postMessage`. Messages are only accepted from a window this
document actually hosts (an identity check on `event.source`, not a comparable origin
string), and replies are addressed to that frame's real origin rather than broadcast
with `*`. The CP endpoints live in `routes/cp.php`, so they inherit Statamic's control
panel middleware, authentication and CSRF included. Each endpoint also checks the
signed-in user's own permissions: the entries and taxonomy pickers only return entries and
terms from collections and taxonomies the user can view, and the row and set endpoints
refuse blueprints the user cannot view.

The editing script is only added to responses Statamic recognises as Live Preview, which
needs a valid Live Preview token. Normal front-end responses are never changed.

## Known limitations

- Scalar values are wrapped in a `<span>`. If a field renders block-level HTML, that
  span ends up wrapping block content, which is technically invalid nesting. It renders
  fine everywhere in practice, but it's why the wrapper is stripped back out when it
  lands inside an HTML attribute.
- Dragging a row from one field into a different field isn't supported. Reordering
  works within a single replicator/set field only.
- Bard set nodes are skipped when marking editable content; their fields are wrapped
  via the normal nested-set path instead.
- Requires the preview iframe to be same-app. A wholly external preview URL won't
  receive the injected script.

## Licence

MIT, © Alt Design Ltd
