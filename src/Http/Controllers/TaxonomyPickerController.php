<?php

namespace AltDesign\AltLiveEditor\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Statamic\Facades\Taxonomy;
use Statamic\Facades\Term;

class TaxonomyPickerController
{
    public function __invoke(Request $request): JsonResponse
    {
        $requested = array_filter(array_map('trim', explode(',', (string) $request->input('taxonomies', ''))));
        $search = (string) $request->input('search', '');

        if (empty($requested)) {
            return response()->json(['terms' => [], 'error' => 'No taxonomies specified']);
        }

        // Only include taxonomies that actually exist (avoid null pointer in Stache)
        $taxonomies = collect($requested)->filter(fn ($t) => Taxonomy::findByHandle($t) !== null)->values()->all();

        if (empty($taxonomies)) {
            return response()->json(['terms' => [], 'error' => 'Taxonomy not found: '.implode(', ', $requested)]);
        }

        $query = Term::query()->whereIn('taxonomy', $taxonomies);

        if ($search !== '') {
            $query->where('title', 'like', '%'.$search.'%');
        }

        $terms = $query->limit(100)->get();

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
