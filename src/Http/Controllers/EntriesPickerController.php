<?php

namespace AltDesign\AltLiveEditor\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Statamic\Facades\Entry;

class EntriesPickerController
{
    public function __invoke(Request $request): JsonResponse
    {
        $collections = array_filter(array_map('trim', explode(',', (string) $request->input('collections', ''))));
        $search = (string) $request->input('search', '');

        if (empty($collections)) {
            return response()->json(['entries' => [], 'error' => 'No collections specified']);
        }

        $query = Entry::query()
            ->whereIn('collection', $collections)
            ->whereStatus('published')
            ->orderBy('updated_at', 'desc');

        if ($search !== '') {
            $query->where('title', 'like', '%'.$search.'%');
        }

        $entries = $query->limit(50)->get();

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
