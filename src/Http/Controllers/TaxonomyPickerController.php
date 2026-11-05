<?php

namespace AltDesign\AltLiveEditor\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use AltDesign\AltLiveEditor\Support\Access;
use Statamic\Facades\Taxonomy;
use Statamic\Facades\Term;

class TaxonomyPickerController
{
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'taxonomies' => ['nullable', 'string', 'max:500'],
            'search' => ['nullable', 'string', 'max:200'],
        ]);

        $requested = array_filter(array_map('trim', explode(',', (string) ($validated['taxonomies'] ?? ''))));
        $search = (string) ($validated['search'] ?? '');

        if (empty($requested)) {
            return response()->json(['terms' => [], 'error' => 'No taxonomies specified']);
        }

        $existing = collect($requested)->filter(fn ($t) => Taxonomy::findByHandle($t) !== null)->values()->all();

        if (empty($existing)) {
            return response()->json(['terms' => [], 'error' => 'Taxonomy not found']);
        }

        $taxonomies = Access::viewableTaxonomies($existing);

        if (empty($taxonomies)) {
            return response()->json(['terms' => [], 'error' => 'You do not have permission to view these taxonomies'], 403);
        }

        $query = Term::query()->whereIn('taxonomy', $taxonomies);

        if ($search !== '') {
            $query->where('title', 'like', '%'.$search.'%');
        }

        $terms = $query->limit(100)->get()->filter(fn ($term) => Access::can('view', $term));

        $output = $terms->map(function ($term) {
            return [
                'id' => $term->taxonomy()->handle().'::'.$term->slug(),
                'slug' => $term->slug(),
                'title' => $term->get('title') ?? $term->slug(),
                'taxonomy' => $term->taxonomy()->handle(),
                'taxonomy_title' => $term->taxonomy()->title(),
            ];
        })->all();

        return response()->json(['terms' => $output]);
    }
}
