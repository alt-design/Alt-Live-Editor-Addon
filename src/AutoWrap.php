<?php

namespace AltDesign\AltLiveEditor;

use Statamic\Fields\Value;
use Statamic\Fields\Values;
use Statamic\Fieldtypes\Bard\Augmentor as BardAugmentor;

class AutoWrap
{
    private const SCALAR_FIELDTYPES = [
        'text',
        'textarea',
        'slug',
        'integer',
        'float',
        'select',
        'radio',
        'button_group',
        'color',
        'time',
        'date',
        'hidden',
        'link',
    ];

    private const NESTING_FIELDTYPES = [
        'replicator',
        'grid',
        'group',
        'sets',
    ];

    private const BARD_FIELDTYPES = [
        'bard',
    ];

    private const EXCLUDED_HANDLES_DEFAULT = ['slug', 'id', 'url', 'permalink'];

    public static function isActive(): bool
    {
        return request()->isLivePreview();
    }

    public static function shouldWrap(?Value $value): bool
    {
        if (! $value || ! $value->handle()) {
            return false;
        }

        $excluded = config('alt-live-editor.exclude_handles', self::EXCLUDED_HANDLES_DEFAULT);

        if (in_array($value->handle(), $excluded, true)) {
            return false;
        }

        // Only claim the fieldtypes wrap() actually knows how to handle. Anything else
        // is left to the template tags, which mark up their own content.
        return self::isScalar($value) || self::isBard($value) || self::isNesting($value);
    }

    public static function isNesting(Value $value): bool
    {
        return in_array(self::fieldtypeHandle($value), self::NESTING_FIELDTYPES, true);
    }

    public static function isBard(Value $value): bool
    {
        return in_array(self::fieldtypeHandle($value), self::BARD_FIELDTYPES, true);
    }

    public static function isScalar(Value $value): bool
    {
        return in_array(self::fieldtypeHandle($value), self::SCALAR_FIELDTYPES, true);
    }

    private static function fieldtypeHandle(?Value $value): ?string
    {
        if (! $value) {
            return null;
        }

        $fieldtype = $value->fieldtype();

        if (! $fieldtype) {
            return null;
        }

        return $fieldtype::handle();
    }

    public static function wrap(Value $value, ?string $rowId = null): Value
    {
        if (self::isScalar($value)) {
            return self::wrapScalar($value, $rowId);
        }

        if (self::isBard($value)) {
            return self::wrapBard($value, $rowId);
        }

        if (self::isNesting($value)) {
            return self::wrapNestedSets($value);
        }

        return $value;
    }

    public static function wrapScalar(Value $delegate, ?string $rowId = null): Value
    {
        return new Value(
            function () use ($delegate, $rowId) {
                $resolved = $delegate->value();

                if (! self::isActive()) {
                    return $resolved;
                }

                if ($resolved !== null && ! is_string($resolved) && ! is_numeric($resolved)) {
                    return $resolved;
                }

                $string = (string) ($resolved ?? '');
                $empty = $string === '';

                if ($empty && ! config('alt-live-editor.wrap_empty_fields', true)) {
                    return $resolved;
                }

                return self::wrapMarkup($delegate->handle(), $string, $rowId, $empty);
            },
            $delegate->handle(),
            null,
            $delegate->augmentable(),
            $delegate->shallow(),
        );
    }

    public static function wrapBard(Value $delegate, ?string $rowId = null): Value
    {
        return new Value(
            function () use ($delegate, $rowId) {
                if (! self::isActive()) {
                    return $delegate->value();
                }

                $raw = $delegate->raw();

                if (! is_array($raw)) {
                    return $delegate->value();
                }

                $fieldtype = $delegate->fieldtype();

                if (! $fieldtype) {
                    return $delegate->value();
                }

                if ($fieldtype->config('sets')) {
                    return self::wrapBardSets($delegate, $raw, $rowId, $fieldtype);
                }

                return self::renderBardWithIds($raw, $delegate->handle(), $rowId, $fieldtype);
            },
            $delegate->handle(),
            null,
            $delegate->augmentable(),
            $delegate->shallow(),
        );
    }

    /**
     * A Bard field with sets augments to a list the template loops over, so the
     * list shape has to survive. Only the text pieces between sets are swapped for
     * wrapped markup, in the order the augmentor produced them.
     *
     * @param  array<int, mixed>  $raw
     * @return mixed
     */
    private static function wrapBardSets(Value $delegate, array $raw, ?string $rowId, $fieldtype)
    {
        $items = $delegate->value();

        if (! is_array($items)) {
            return $items;
        }

        $groups = self::textGroups($raw, $delegate->handle(), $rowId, $fieldtype);

        return array_map(function ($item) use (&$groups) {
            if (! $item instanceof Values) {
                return $item;
            }

            $collection = $item->getProxiedInstance();

            if (self::plainValue($collection->get('type')) !== 'text' || $groups === []) {
                return $item;
            }

            $original = $collection->get('text');
            $html = array_shift($groups);

            $collection = $collection->put(
                'text',
                new Value($html, 'text', $original instanceof Value ? $original->fieldtype() : null),
            );

            return new Values($collection);
        }, $items);
    }

    /**
     * Rendered, id-marked HTML for each run of text nodes between sets, keyed by the
     * node's position in the stored value so edits can be sent back to the right node.
     * Disabled sets are dropped first, matching what the augmentor does.
     *
     * @param  array<int, mixed>  $raw
     * @return array<int, string>
     */
    private static function textGroups(array $raw, string $fieldHandle, ?string $rowId, $fieldtype): array
    {
        $groups = [];
        $current = [];

        foreach ($raw as $index => $node) {
            if (! is_array($node) || ! isset($node['type'])) {
                continue;
            }

            if ($node['type'] === 'set') {
                if (($node['attrs']['enabled'] ?? true) === false) {
                    continue;
                }

                $groups[] = $current;
                $current = [];

                continue;
            }

            $current[$index] = $node;
        }

        $groups[] = $current;

        return array_values(array_filter(array_map(
            fn (array $nodes) => $nodes === [] ? '' : self::renderBardWithIds($nodes, $fieldHandle, $rowId, $fieldtype),
            $groups,
        ), fn (string $html) => $html !== ''));
    }

    private static function plainValue(mixed $value): mixed
    {
        return $value instanceof Value ? $value->value() : $value;
    }

    public static function wrapNestedSets(Value $delegate): Value
    {
        $fieldHandle = $delegate->handle();

        return new Value(
            function () use ($delegate, $fieldHandle) {
                $result = $delegate->value();

                if (! self::isActive() || ! is_array($result)) {
                    return $result;
                }

                return array_map(
                    fn ($set) => $set instanceof Values ? self::wrapSet($set, $fieldHandle) : $set,
                    $result,
                );
            },
            $delegate->handle(),
            null,
            $delegate->augmentable(),
            $delegate->shallow(),
        );
    }

    private static function wrapSet(Values $set, string $fieldHandle): Values
    {
        $collection = $set->getProxiedInstance();
        $rowIdKey = config('statamic.system.row_id_handle', 'id');
        $rowId = $collection->get($rowIdKey);
        $rowIdString = is_string($rowId) ? $rowId : null;

        $wrapped = $collection->map(function ($val) use ($rowIdString) {
            if ($val instanceof Value && self::shouldWrap($val)) {
                return self::wrap($val, $rowIdString);
            }

            return $val;
        });

        // Expose the set's rowId + parent field handle so descendant tags can locate themselves
        if ($rowIdString) {
            $wrapped = $wrapped->put('_alt_set_id', $rowIdString);
        }
        $wrapped = $wrapped->put('_alt_field_handle', $fieldHandle);

        return new Values($wrapped);
    }

    public static function wrapMarkup(string $handle, string $rendered, ?string $rowId = null, bool $empty = false): string
    {
        $attrs = sprintf('data-alt-editable-handle="%s"', e($handle));

        if ($rowId !== null) {
            $attrs .= sprintf(' data-alt-editable-rowid="%s"', e($rowId));
        }

        if ($empty) {
            $attrs .= ' data-alt-editable-empty="1"';
        }

        return sprintf('<span %s>%s</span>', $attrs, $rendered);
    }

    private static function renderBardWithIds(array $nodes, string $fieldHandle, ?string $rowId, $fieldtype): string
    {
        $augmentor = new BardAugmentor($fieldtype);

        // Run any registered Bard augment hooks before rendering (preserves addon extensions)
        $nodes = $fieldtype->runAugmentHooks($nodes);

        $html = '';

        foreach ($nodes as $index => $node) {
            if (! is_array($node) || ! isset($node['type'])) {
                continue;
            }

            if ($node['type'] === 'set') {
                // Render set markers — Statamic's normal flow turns these into a partial call
                // We skip wrapping them since their fields are wrapped via the standard nested-set path
                continue;
            }

            $nodeHtml = $augmentor->renderProsemirrorToHtml(['type' => 'doc', 'content' => [$node]]);

            $nodeId = self::makeBardNodeId($fieldHandle, $index, $rowId);

            $attrs = sprintf(
                'data-alt-editable-bard="%s" data-alt-editable-handle="%s" data-alt-editable-node-index="%d"',
                e($nodeId),
                e($fieldHandle),
                $index,
            );

            if ($rowId !== null) {
                $attrs .= sprintf(' data-alt-editable-rowid="%s"', e($rowId));
            }

            $nodeHtml = preg_replace(
                '/<(\w+)([\s>])/',
                '<$1 '.$attrs.'$2',
                $nodeHtml,
                1,
            );

            $html .= $nodeHtml;
        }

        return $html;
    }

    private static function makeBardNodeId(string $fieldHandle, int $index, ?string $rowId): string
    {
        return sprintf('%s%s:%d', $rowId ? $rowId.':' : '', $fieldHandle, $index);
    }
}
