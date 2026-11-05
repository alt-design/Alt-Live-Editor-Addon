# Alt Live Editor

Alt Live Editor lets editors change an entry's content by clicking it in Statamic's Live Preview, instead of finding the matching field in the publish form.

- Text and Bard fields become editable in place.
- Images, entries, taxonomy and tags fields get a click-to-edit overlay.
- Page builder rows (Replicator sets) can be added, moved, configured and deleted from the preview.

Nothing is saved from the preview. Every change is pushed into the publish form exactly as if it had been typed there, so the editor still presses **Save**, and validation, revisions and permissions work as normal. The confirmation in the preview says *Updated*, not *Saved*, for that reason.

## Requirements

- Statamic 6.40 or later (tested on 6.40.0)
- PHP 8.2 or later
- Live Preview served by the same Statamic site. An external preview URL does not receive the editing script.

## Installation

```bash
composer require alt-design/alt-live-editor
```

Statamic publishes the control panel script itself after every `composer install` and `composer update`, through the `statamic:install` step that a standard Statamic site runs after Composer. If your site's `composer.json` does not run that step, publish it yourself after installing or upgrading:

```bash
php artisan vendor:publish --tag=alt-live-editor --force
```

To change the defaults, publish the config file to `config/alt-live-editor.php`:

```bash
php artisan vendor:publish --tag=alt-live-editor-config
```

## Quick start

Open any entry, click **Live Preview**, and click a heading or paragraph in the preview. The entry's own top-level text fields are picked up automatically, with no template changes.

For page builder rows, images and relationship fields, wrap the markup in the addon's tags so it knows what each part of the page is. A typical page builder template:

```antlers
{{ alt_live_editor handle="title" as="h1" }}{{ title }}{{ /alt_live_editor }}

{{ alt_live_editor:image handle="hero_image" }}
    <img src="{{ hero_image:url }}" alt="{{ hero_image:alt }}">
{{ /alt_live_editor:image }}

{{ page_builder }}
    {{ alt_live_editor:row }}
        {{ partial src="page_builder/{type}" }}
    {{ /alt_live_editor:row }}
{{ /page_builder }}
```

In Live Preview, each row now shows a toolbar on hover or keyboard focus (move up, move down, settings, delete) and an **Add section** button above it. Outside Live Preview the tags output their contents unchanged.

## Template tags

### `{{ alt_live_editor }}`

Marks content as an editable field.

| Parameter | Default | Description |
| --- | --- | --- |
| `handle` | required | The field handle to bind to |
| `as` | `span` | The element to wrap with |
| `type` | `text` | `text` or `html`: whether the preview sends back plain text or HTML |

### `{{ alt_live_editor:row }}`

Wraps one page builder row so it gets the row toolbar and the **Add section** buttons. Use it inside the set loop; it reads `index`, `type` and `last` from the loop.

### `{{ alt_live_editor:image }}`

| Parameter | Description |
| --- | --- |
| `handle` | Required. The assets field handle |
| `container` | The asset container. Defaults to `assets` |
| `index` | In a gallery loop, which item this is, so each image can be replaced on its own |
| `rowid` | Overrides the detected parent set id |

### `{{ alt_live_editor:entries }}`, `{{ alt_live_editor:taxonomy }}` and `{{ alt_live_editor:tags }}`

```antlers
{{ alt_live_editor:entries handle="featured" collections="blog" max="3" }}
    {{ featured }}<a href="{{ url }}">{{ title }}</a>{{ /featured }}
{{ /alt_live_editor:entries }}
```

`entries` takes `collections` and `max`. `taxonomy` takes `taxonomies` and `max`. `tags` takes only `handle`. All three accept `rowid`.

## Configuration

`config/alt-live-editor.php`:

| Key | Default | Description |
| --- | --- | --- |
| `exclude_handles` | `slug`, `id`, `url`, `permalink` | Fields that are never made editable |
| `picker` | see below | Which picker opens for images, entries, taxonomy and tags fields |
| `wrap_empty_fields` | `true` | Makes empty text fields clickable in the preview. A template block wrapped in `{{ if field }}` then shows in the preview even when the field is empty, which the live site would not. Set to `false` to match the live site |
| `debug` | `false` | Logs to the browser console. Set with `ALT_LIVE_EDITOR_DEBUG` |

Two picker styles ship, chosen per field type:

- **`native`** opens Statamic's own field in the publish form. It supports every option the fieldtype has, and is the default for images, entries and taxonomy fields. It relies on the control panel's own components, so it is the part most likely to need an update after a Statamic release.
- **`builtin`** opens the addon's own picker inside the preview. It works with the publish sidebar hidden but supports fewer field options. It is the default for tags, because Statamic's tags field has no picker to open.

```php
'picker' => [
    'image' => 'native',
    'entries' => 'native',
    'taxonomy' => 'native',
    'tags' => 'builtin',
],
```

Set `'picker' => 'builtin'` to use the built-in pickers everywhere.

## Permissions and security

The addon adds no permissions of its own. Editors use it with the permissions they already have:

- The control panel endpoints sit behind Statamic's control panel authentication and CSRF protection.
- The entries and taxonomy pickers only return entries and terms from collections and taxonomies the signed-in user can view.
- The row and set endpoints refuse blueprints the user cannot view.
- Changes only reach the publish form, so saving still needs the user's normal edit permission on the entry.

The editing script is only added to pages Statamic recognises as Live Preview, which needs a valid Live Preview token. Normal front-end pages are never changed, and the addon makes no requests to any outside service.

## Known limitations

- Plain field values are wrapped in a `<span>` in Live Preview. If a field renders block-level HTML, that span wraps block content. Browsers render it correctly, and the wrapper is removed where it would land inside an HTML attribute.
- A row cannot be dragged from one field into another. Reordering works within one field.
- Bard sets are edited through their own fields, not as part of the Bard text.

## Support

Support is through GitHub issues: [github.com/alt-design/Alt-Live-Editor-Addon/issues](https://github.com/alt-design/Alt-Live-Editor-Addon/issues).
