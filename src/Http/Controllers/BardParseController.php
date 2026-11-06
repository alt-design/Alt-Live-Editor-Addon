<?php

namespace AltDesign\AltLiveEditor\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Statamic\Fieldtypes\Bard;
use Statamic\Fieldtypes\Bard\Augmentor;

class BardParseController
{
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate(['html' => ['nullable', 'string', 'max:500000']]);

        $html = (string) ($validated['html'] ?? '');

        if ($html === '') {
            return response()->json(['nodes' => []]);
        }

        $fieldtype = new Bard;
        $document = (new Augmentor($fieldtype))->renderHtmlToProsemirror($html);

        // The editor returns a full doc; we only want its inner content (the nodes)
        $nodes = $document['content'] ?? [];

        return response()->json(['nodes' => $nodes]);
    }
}
