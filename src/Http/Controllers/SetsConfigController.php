<?php

namespace AltDesign\AltLiveEditor\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Statamic\Facades\Blueprint;
use Statamic\Fields\Field;
use Statamic\Fields\Fields;
use Statamic\Fieldtypes\RowId;

class SetsConfigController
{
    public function __invoke(Request $request): JsonResponse
    {
        $blueprintHandle = (string) $request->input('blueprint', '');
        $fieldPath = (string) $request->input('field', '');

        if ($blueprintHandle === '' || $fieldPath === '') {
            return response()->json(['sets' => [], 'error' => 'Missing blueprint or field']);
        }

        $blueprint = Blueprint::find($blueprintHandle);

        if (! $blueprint) {
            return response()->json(['sets' => [], 'error' => "Blueprint not found: $blueprintHandle"]);
        }

        $field = $this->findFieldByPath($blueprint, $fieldPath);

        if (! $field) {
            return response()->json(['sets' => [], 'error' => "Field not found: $fieldPath"]);
        }

        $fieldtype = $field->fieldtype();
        $handle = $fieldtype::handle();

        if (! in_array($handle, ['replicator', 'bard', 'grid', 'sets'], true)) {
            return response()->json(['sets' => [], 'error' => "Field $fieldPath is not a set-based fieldtype"]);
        }

        $flattened = method_exists($fieldtype, 'flattenedSetsConfig')
            ? $fieldtype->flattenedSetsConfig()
            : [];

        $output = collect($flattened)->map(function ($config, $setHandle) {
            [$defaults, $meta] = $this->computeDefaultsAndMeta($config);

            return [
                'handle' => $setHandle,
                'display' => $config['display'] ?? \Statamic\Support\Str::headline($setHandle),
                'instructions' => $config['instructions'] ?? null,
                'icon' => $config['icon'] ?? null,
                'defaults' => $defaults,
                'meta' => $meta,
            ];
        })->values()->all();

        return response()->json([
            'sets' => $output,
            'row_id_handle' => app(RowId::class)->handle(),
        ]);
    }

    private function findFieldByPath($blueprint, string $path): ?Field
    {
        return $blueprint->field($path);
    }

    /**
     * Compute defaults + meta for a set type. Mirrors the logic in
     * Statamic's ReplicatorSetController so newly added rows render
     * correctly in the publish form's Vue components.
     */
    private function computeDefaultsAndMeta(array $setConfig): array
    {
        try {
            $fields = new Fields(items: $setConfig['fields'] ?? []);

            $defaults = $fields->all()->mapWithKeys(function ($field) {
                return [$field->handle() => $field->fieldtype()->preProcess($field->defaultValue())];
            })->all();

            $meta = $fields->addValues($defaults)->meta()->put('_', '_')->toArray();

            return [$defaults, $meta];
        } catch (\Throwable $e) {
            return [[], []];
        }
    }
}
