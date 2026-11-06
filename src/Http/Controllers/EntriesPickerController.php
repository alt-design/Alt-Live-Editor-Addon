<?php

namespace AltDesign\AltLiveEditor\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use AltDesign\AltLiveEditor\Support\Access;
use Statamic\Facades\Entry;

class EntriesPickerController
{
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'collections' => ['nullable', 'string', 'max:500'],
            'search' => ['nullable', 'string', 'max:200'],
        ]);

        $requested = array_filter(array_map('trim', explode(',', (string) ($validated['collections'] ?? ''))));
        $search = (string) ($validated['search'] ?? '');

        if (empty($requested)) {
            return response()->json(['entries' => [], 'error' => 'No collections specified']);
        }

        $collections = Access::viewableCollections($requested);

        if (empty($collections)) {
            return response()->json(['entries' => [], 'error' => 'You do not have permission to view these collections'], 403);
        }

        $query = Entry::query()
            ->whereIn('collection', $collections)
            ->whereStatus('published')
            ->orderBy('updated_at', 'desc');

        if ($search !== '') {
            $query->where('title', 'like', '%'.$search.'%');
        }

        $entries = $query->limit(50)->get()->filter(fn ($entry) => Access::can('view', $entry));

        $output = $entries->map(function ($entry) {
            return [
                'id' => $entry->id(),
                'title' => $entry->get('title') ?? $entry->slug() ?? $entry->id(),
                'slug' => $entry->slug(),
                'collection' => $entry->collection()->handle(),
                'collection_title' => $entry->collection()->title(),
                'url' => $entry->url(),
            ];
        })->all();

        return response()->json(['entries' => $output]);
    }
}
