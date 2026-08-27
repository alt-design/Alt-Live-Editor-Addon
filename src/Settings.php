<?php

namespace AltDesign\AltLiveEditor;

class Settings
{
    /**
     * Field types that can be edited through a picker.
     */
    public const PICKER_TYPES = ['image', 'entries', 'taxonomy', 'tags'];

    private const DEFAULT_PICKER = 'native';

    /**
     * `picker` may be a single string applied to every field type, or an array
     * keyed by type. Normalise to a full array the JS can look up directly, so
     * neither side has to deal with partial config.
     */
    public static function pickers(): array
    {
        $configured = config('alt-live-editor.picker', self::DEFAULT_PICKER);

        if (is_string($configured)) {
            return array_fill_keys(self::PICKER_TYPES, self::normalise($configured));
        }

        $pickers = [];

        foreach (self::PICKER_TYPES as $type) {
            $pickers[$type] = self::normalise(
                is_array($configured) ? ($configured[$type] ?? self::DEFAULT_PICKER) : self::DEFAULT_PICKER
            );
        }

        return $pickers;
    }

    public static function debug(): bool
    {
        return (bool) config('alt-live-editor.debug', false);
    }

    /**
     * Anything we don't recognise falls back to the native picker rather than
     * silently disabling editing for that field type.
     */
    private static function normalise(mixed $value): string
    {
        return $value === 'builtin' ? 'builtin' : self::DEFAULT_PICKER;
    }
}
