# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - Unreleased

### Added

- Inline editing of text and Bard fields in Live Preview, pushed into the publish form.
- Click-to-edit overlays for images, entries, taxonomy and tags fields, with native or built-in pickers.
- Add, move, configure and delete page builder rows from the preview.
- `alt_live_editor` tags for page builder rows, images and relationship fields.
- The row toolbar appears on keyboard focus as well as hover, its buttons have accessible names and a visible focus ring, and the add-section buttons highlight on focus.

### Security

- The entries and taxonomy pickers only return entries and terms from collections and taxonomies the signed-in user can view.
- The row and set endpoints refuse blueprints the user cannot view, and their errors no longer echo request input.
- Request input to the pickers and the Bard parser is validated, and entry data is escaped before it is put into picker markup.
