<?php

namespace AltDesign\AltLiveEditor\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Statamic\Facades\Blueprint;
use Statamic\Fields\Field;
use Statamic\Fields\Fields;

class RowOptionsController
{
    /**
     * Fieldtype handles considered "option-like" — UI controls that aren't rich content.
     * Auto-derived from the set's blueprint and shown in the iframe's row settings panel.
     */
    private const OPTION_FIELDTYPES = [
        // Choice / boolean
        'toggle', 'select', 'radio', 'button_group', 'checkboxes',
        // Visual
        'color', 'icon',
        // Numeric
        'range', 'integer', 'float',
        // Temporal
        'date', 'time',
        // Layout / config
        'width', 'template', 'slug', 'link',
        // Misc text-config
        'code', 'video',
    ];

    /**
     * Fieldtypes that ARE rich content / already handled inline by alt-live-editor.
     * Excluded even if a custom handle slips through the fallback.
     */
    private const CONTENT_FIELDTYPES = [
        'text', 'textarea', 'markdown', 'bard',
        'assets', 'entries', 'taxonomy', 'users', 'terms', 'navs',
        'replicator', 'grid', 'group', 'sets',
        'array', 'yaml', 'table',
        // Pure layout helpers — nothing to edit
        'section', 'spacer', 'html', 'hidden', 'revealer',
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $blueprintHandle = (string) $request->input('blueprint', '');
        $fieldPath = (string) $request->input('field', '');
        $setType = (string) $request->input('set', '');
        $rowValues = (array) $request->input('values', []);

        if ($blueprintHandle === '' || $fieldPath === '' || $setType === '') {
            return response()->json(['fields' => [], 'error' => 'Missing blueprint, field, or set']);
        }

        $blueprint = Blueprint::find($blueprintHandle);

        if (! $blueprint) {
            return response()->json(['fields' => [], 'error' => "Blueprint not found: $blueprintHandle"]);
        }

        $field = $this->findFieldByPath($blueprint, $fieldPath);

        if (! $field) {
            return response()->json(['fields' => [], 'error' => "Field not found: $fieldPath"]);
        }

        $fieldtype = $field->fieldtype();

        if (! method_exists($fieldtype, 'flattenedSetsConfig')) {
            return response()->json(['fields' => [], 'error' => "Field $fieldPath is not a set-based fieldtype"]);
        }

        $sets = $fieldtype->flattenedSetsConfig();
        $setConfig = $sets[$setType] ?? null;

        if (! $setConfig) {
            return response()->json(['fields' => [], 'error' => "Set type $setType not found"]);
        }

        try {
            $fields = (new Fields(items: $setConfig['fields'] ?? []))->addValues($rowValues);
        } catch (\Throwable $e) {
            return response()->json(['fields' => [], 'error' => 'Failed to resolve fields: '.$e->getMessage()]);
        }

        $optionFields = $fields->all()
            ->reject(fn (Field $f) => $this->isContentField($f) || $this->isHidden($f, $rowValues))
            ->map(function (Field $f) use ($rowValues) {
                $config = $f->config();
                $handle = $f->handle();
                $type = $f->fieldtype()::handle();

                return [
                    'handle' => $handle,
                    'display' => $config['display'] ?? \Statamic\Support\Str::headline($handle),
                    'instructions' => $config['instructions'] ?? null,
                    'type' => $type,
                    // Tells the iframe whether to render an inline control or a "Open in sidebar" fallback
                    'inline_renderable' => in_array($type, self::OPTION_FIELDTYPES, true),
                    'value' => $rowValues[$handle] ?? ($config['default'] ?? null),
                    'options' => $this->normalizeOptions($config['options'] ?? null),
                    'inline_label' => $config['inline_label'] ?? null,
                    'min' => $config['min'] ?? null,
                    'max' => $config['max'] ?? null,
                    'step' => $config['step'] ?? null,
                    'required' => $this->isRequired($config),
                ];
            })
            ->values()
            ->all();

        return response()->json([
            'fields' => $optionFields,
        ]);
    }

    private function isContentField(Field $f): bool
    {
        return in_array($f->fieldtype()::handle(), self::CONTENT_FIELDTYPES, true);
    }

    /**
     * Statamic field conditions (`if`, `unless`, `show_when`, `hide_when`). If any unmet, hide the field.
     * Implements equality and presence checks — enough for the common "show colour picker only when
     * background_type is 'colour'" case.
     */
    private function isHidden(Field $f, array $rowValues): bool
    {
        $config = $f->config();
        $ifConditions = $config['if'] ?? $config['show_when'] ?? null;
        $unlessConditions = $config['unless'] ?? $config['hide_when'] ?? null;

        if (is_array($ifConditions) && ! $this->conditionsMatch($ifConditions, $rowValues)) {
            return true;
        }
        if (is_array($unlessConditions) && $this->conditionsMatch($unlessConditions, $rowValues)) {
            return true;
        }

        return false;
    }

    private function conditionsMatch(array $conditions, array $values): bool
    {
        foreach ($conditions as $key => $expected) {
            $actual = $values[$key] ?? null;
            // Statamic supports "equals:foo" / "not:bar" / "contains:x" expressions; for now do equality.
            if (is_string($expected) && str_contains($expected, ':')) {
                [$op, $arg] = explode(':', $expected, 2);
                $arg = trim($arg);
                $match = match ($op) {
                    'equals', 'is' => (string) $actual === $arg,
                    'not', 'isnt', 'notequals' => (string) $actual !== $arg,
                    'contains' => is_string($actual) && str_contains($actual, $arg),
                    'in' => in_array($actual, array_map('trim', explode(',', $arg)), true),
                    default => true,
                };
                if (! $match) return false;
            } elseif ((string) $actual !== (string) $expected) {
                return false;
            }
        }
        return true;
    }

    private function isRequired(array $config): bool
    {
        $rules = $config['validate'] ?? $config['validation'] ?? null;
        if (is_array($rules)) return in_array('required', $rules, true);
        if (is_string($rules)) return str_contains($rules, 'required');
        return false;
    }

    /**
     * Statamic options can be: ['a' => 'A', 'b' => 'B'] or [['key' => 'a', 'value' => 'A']].
     * Normalise to [{value, label}] for the iframe UI.
     */
    private function normalizeOptions($options): array
    {
        if (! $options) {
            return [];
        }

        $out = [];

        if (is_array($options)) {
            foreach ($options as $key => $val) {
                if (is_array($val) && isset($val['key'])) {
                    $out[] = ['value' => $val['key'], 'label' => $val['value'] ?? $val['key']];
                } else {
                    $out[] = ['value' => (string) $key, 'label' => (string) $val];
                }
            }
        }

        return $out;
    }

    private function findFieldByPath($blueprint, string $path): ?Field
    {
        return $blueprint->field($path);
    }
}
