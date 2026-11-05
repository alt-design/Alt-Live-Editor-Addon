# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - Unreleased

### Added

- Inline editing of text and Bard fields in Live Preview, pushed into the publish form.
- Click-to-edit overlays for images, entries, taxonomy and tags fields, with native or built-in pickers.
- Add, move, configure and delete page builder rows from the preview.
- `alt_live_editor` tags for page builder rows, images and relationship fields.
- The row toolbar appears on keyboard focus as well as hover, its buttons have accessible names and a visible focus ring, and the add-section buttons highlight on focus.
- `wrap_empty_fields` option, to make Live Preview match the live site for empty fields.

### Security

- The entries and taxonomy pickers only return entries and terms from collections and taxonomies the signed-in user can view.
- The row and set endpoints refuse blueprints the user cannot view, and their errors no longer echo request input.
- Request input to the pickers and the Bard parser is validated, and entry data is escaped before it is put into picker markup.

### Fixed

- The native pickers for images, entries and taxonomy fields open on Statamic 6, which prefixes field ids with the publish container name.
- Bard fields that have sets configured still loop in Live Preview, and their text between sets stays editable.
- Every editable span is removed from an HTML attribute that holds several of them, instead of only the first.
- Clicking a link inside an entries, taxonomy, tags or image wrapper opens the picker.
- A page builder row that renders nothing shows a placeholder, so it can still be configured or deleted.
- The editing script is only added to HTML responses, and the `as` parameter of `alt_live_editor` accepts a plain element name only.
