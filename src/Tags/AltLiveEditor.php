<?php

namespace AltDesign\AltLiveEditor\Tags;

use Statamic\Tags\Tags;

class AltLiveEditor extends Tags
{
    protected static $handle = 'alt_live_editor';

    public function index(): string
    {
        $inner = (string) $this->parse();

        if (! request()->isLivePreview()) {
            return $inner;
        }

        $handle = $this->params->get('handle');

        if (! $handle) {
            return $inner;
        }

        $tag = $this->params->get('as', 'span');
        $type = $this->params->get('type', 'text');

        $attrs = sprintf(
            'data-alt-editable-handle="%s" data-alt-editable-type="%s"',
            e($handle),
            e($type),
        );

        return "<{$tag} {$attrs}>{$inner}</{$tag}>";
    }

    public function row(): string
    {
        $inner = (string) $this->parse();

        if (! request()->isLivePreview()) {
            return $inner;
        }

        $field = $this->context->get('_alt_field_handle') ?? $this->params->get('field');
        $rowId = $this->context->get('_alt_set_id') ?? $this->context->get('id');
        $index = $this->context->get('index');
        $type = $this->context->get('type');
        $last = $this->context->get('last');
        $blueprint = $this->context->get('_alt_blueprint');

        if (! $field) {
            return $inner;
        }

        $attrs = sprintf(
            'data-alt-row="1" data-alt-row-field="%s" data-alt-row-index="%s" data-alt-row-type="%s"',
            e($field),
            e((string) $index),
            e((string) $type),
        );

        if (is_string($rowId)) {
            $attrs .= sprintf(' data-alt-row-id="%s"', e($rowId));
        }
        if ($blueprint) {
            $attrs .= sprintf(' data-alt-row-blueprint="%s"', e($blueprint));
        }
        if ($last) {
            $attrs .= ' data-alt-row-last="1"';
        }

        return sprintf('<div %s>%s</div>', $attrs, $inner);
    }

    public function taxonomy(): string
    {
        $inner = (string) $this->parse();

        if (! request()->isLivePreview()) {
            return $inner;
        }

        $handle = $this->params->get('handle');

        if (! $handle) {
            return $inner;
        }

        $rowId = $this->params->get('rowid')
            ?? $this->context->get('_alt_set_id')
            ?? null;

        $taxonomies = $this->params->get('taxonomies') ?? $this->params->get('taxonomy');
        $max = $this->params->get('max');

        $attrs = sprintf('data-alt-editable-taxonomy-handle="%s"', e($handle));

        if (is_string($rowId)) {
            $attrs .= sprintf(' data-alt-editable-rowid="%s"', e($rowId));
        }
        if ($taxonomies) {
            $attrs .= sprintf(' data-alt-editable-taxonomies="%s"', e($taxonomies));
        }
        if ($max) {
            $attrs .= sprintf(' data-alt-editable-max="%s"', e((string) $max));
        }

        return sprintf(
            '<span %s style="display:inline-block;position:relative;cursor:pointer">%s</span>',
            $attrs,
            $inner,
        );
    }

    public function entries(): string
    {
        $inner = (string) $this->parse();

        if (! request()->isLivePreview()) {
            return $inner;
        }

        $handle = $this->params->get('handle');

        if (! $handle) {
            return $inner;
        }

        $rowId = $this->params->get('rowid')
            ?? $this->context->get('_alt_set_id')
            ?? null;

        $collections = $this->params->get('collections');
        $max = $this->params->get('max');

        $attrs = sprintf('data-alt-editable-entries-handle="%s"', e($handle));

        if (is_string($rowId)) {
            $attrs .= sprintf(' data-alt-editable-rowid="%s"', e($rowId));
        }
        if ($collections) {
            $attrs .= sprintf(' data-alt-editable-collections="%s"', e($collections));
        }
        if ($max) {
            $attrs .= sprintf(' data-alt-editable-max="%s"', e((string) $max));
        }

        return sprintf(
            '<span %s style="display:inline-block;position:relative;cursor:pointer">%s</span>',
            $attrs,
            $inner,
        );
    }

    public function tags(): string
    {
        $inner = (string) $this->parse();

        if (! request()->isLivePreview()) {
            return $inner;
        }

        $handle = $this->params->get('handle');

        if (! $handle) {
            return $inner;
        }

        $rowId = $this->params->get('rowid')
            ?? $this->context->get('_alt_set_id')
            ?? null;

        $attrs = sprintf('data-alt-editable-tags-handle="%s"', e($handle));

        if (is_string($rowId)) {
            $attrs .= sprintf(' data-alt-editable-rowid="%s"', e($rowId));
        }

        return sprintf(
            '<span %s style="display:inline-block;position:relative;cursor:pointer">%s</span>',
            $attrs,
            $inner,
        );
    }

    public function image(): string
    {
        $inner = (string) $this->parse();

        if (! request()->isLivePreview()) {
            return $inner;
        }

        $handle = $this->params->get('handle');

        if (! $handle) {
            return $inner;
        }

        // Prefer the explicitly-injected parent set id; fall back to the row's own id
        $rowId = $this->params->get('rowid')
            ?? $this->context->get('_alt_set_id')
            ?? $this->context->get('_id')
            ?? null;

        // For iterated assets (e.g. inside a gallery loop), the index identifies the slide
        $index = $this->params->get('index') ?? $this->context->get('index');

        $container = $this->params->get('container', 'assets');

        $attrs = sprintf(
            'data-alt-editable-image-handle="%s" data-alt-editable-container="%s"',
            e($handle),
            e($container),
        );

        if (is_string($rowId)) {
            $attrs .= sprintf(' data-alt-editable-rowid="%s"', e($rowId));
        }

        if ($index !== null && is_numeric($index)) {
            $attrs .= sprintf(' data-alt-editable-index="%d"', (int) $index);
        }

        // Use display:contents so the wrapper is transparent to layout (parent's flex/grid/sizing still applies).
        // Overlay positioning is achieved via the inner element being position:relative — handled by enhanceImage in JS.
        return sprintf(
            '<span %s style="display:block;position:relative;width:100%%;height:100%%;line-height:inherit">%s</span>',
            $attrs,
            $inner,
        );
    }
}
