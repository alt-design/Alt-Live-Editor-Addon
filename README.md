# Alt Live Editor

> Click content in Live Preview to edit it, and the change goes straight into the publish form.

Alt Live Editor lets editors change an entry by clicking it in Statamic's Live Preview, instead of hunting for the matching field in the publish form.

## Features

- Text and Bard fields edit in place in the preview
- Images, entries, taxonomy terms and tags open a picker
- Page builder rows can be added, moved, configured and deleted from the preview
- The entry's own top-level text fields work with no template changes
- Every change goes into the publish form, so saving, validation, revisions and permissions work as normal
- Outside Live Preview the tags output their content unchanged, and the addon makes no external requests

## Requirements

- Statamic 6.40 or later (tested on 6.40.0)
- PHP 8.2 or later
- Live Preview served by the same Statamic site. An external preview URL does not receive the editing script.

## How to Install

Run the following command from your project root:

``` bash
composer require alt-design/alt-live-editor
```

Statamic publishes the control panel script itself after every `composer install` and `composer update`, through the `statamic:install` step that a standard Statamic site runs after Composer. If your site's `composer.json` does not run that step, publish it yourself after installing or upgrading:

``` bash
php artisan vendor:publish --tag=alt-live-editor --force
```

## Basic usage

Open any entry, click **Live Preview**, and click a heading or paragraph in the preview. The entry's own top-level text fields are picked up automatically.

For page builder rows, images and relationship fields, wrap the markup in the addon's tags so it knows what each part of the page is:

``` antlers
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

In Live Preview, each row now shows a toolbar on hover or keyboard focus (move up, move down, settings, delete) and an **Add section** button above it. There are also `alt_live_editor:entries`, `alt_live_editor:taxonomy` and `alt_live_editor:tags` for relationship fields.

The preview never saves anything itself. To save, the editor presses **Save** in the publish form, or **Save changes** in the preview, which presses the same button for them.

## Configuration

Publish the config file to change the defaults:

``` bash
php artisan vendor:publish --tag=alt-live-editor-config
```

| Key | Default | Description |
| --- | --- | --- |
| `exclude_handles` | `slug`, `id`, `url`, `permalink` | Fields that are never made editable |
| `picker` | see the documentation | Whether images, entries, taxonomy and tags fields open Statamic's own picker or the addon's built-in one |
| `wrap_empty_fields` | `true` | Makes empty text fields clickable in the preview. A template block wrapped in `{{ if field }}` then shows in the preview even when the field is empty, which the live site would not. Set to `false` to match the live site |
| `debug` | `false` | Logs to the browser console. Set with `ALT_LIVE_EDITOR_DEBUG` |

## Permissions and security

The addon adds no permissions of its own. Editors use it with the permissions they already have: the pickers only list entries and terms the user can view, the row endpoints refuse blueprints the user cannot view, and saving still needs the user's normal edit permission on the entry. The editing script is only added to pages Statamic recognises as Live Preview, so normal front-end pages are never changed.

## Known limitations

- Plain field values are wrapped in a `<span>` in Live Preview. If a field renders block-level HTML, that span wraps block content. Browsers render it correctly, and the wrapper is removed where it would land inside an HTML attribute.
- A row cannot be dragged from one field into another. Reordering works within one field.
- Bard sets are edited through their own fields, not as part of the Bard text.

## Documentation

[DOCUMENTATION.md](DOCUMENTATION.md) covers every template tag and parameter, the picker styles, how the addon works and its security model. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Testing

``` bash
composer install
./vendor/bin/phpunit
```

## Questions etc

Drop us a big shout-out if you have any questions, comments, or concerns. We're always looking to improve our addons, so if you have any feature requests, we'd love to hear them.

Bug reports and support requests go to [GitHub issues](https://github.com/alt-design/Alt-Live-Editor-Addon/issues).

### Starter Kits
- [Alt Starter Kit](https://statamic.com/starter-kits/alt-design/alt-starter-kit)

### Addons
- [Alt Admin Bar Addon](https://github.com/alt-design/Alt-Admin-Bar-Addon)
- [Alt AI Addon](https://github.com/alt-design/Alt-AI-Addon)
- [Alt Akismet Addon](https://github.com/alt-design/Alt-Akismet-Addon)
- [Alt Cookies Addon](https://github.com/alt-design/Alt-Cookies-Addon)
- [Alt Google 2FA Addon](https://github.com/alt-design/Alt-Google-2fa-Addon)
- [Alt Google Maps Addon](https://github.com/alt-design/Alt-google-maps-addon)
- [Alt Inbound Addon](https://github.com/alt-design/Alt-Inbound-Addon)
- [Alt Live Editor Addon](https://github.com/alt-design/Alt-Live-Editor-Addon)
- [Alt Password Protect Addon](https://github.com/alt-design/Alt-Password-Protect-Addon)
- [Alt Redirect Addon](https://github.com/alt-design/Alt-Redirect-Addon)
- [Alt SEO Addon](https://github.com/alt-design/Alt-SEO-Addon)
- [Alt Sitemap Addon](https://github.com/alt-design/Alt-Sitemap-Addon)
- [Alt Tabs Addon](https://github.com/alt-design/Alt-Tabs-Addon)
- [RiffRaff Addon](https://github.com/alt-design/Alt-RiffRaff-Addon)

## Licence

MIT, copyright Alt Design Ltd. See [LICENSE](LICENSE).

## Postcardware

Send us a postcard from your hometown if you like this addon. We love getting mail from other cool peeps!

Alt Design  
St Helens House  
Derby  
DE1 3EE  
UK
