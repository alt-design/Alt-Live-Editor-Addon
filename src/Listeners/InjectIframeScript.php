<?php

namespace AltDesign\AltLiveEditor\Listeners;

use AltDesign\AltLiveEditor\Settings;
use Statamic\Events\ResponseCreated;
use Symfony\Component\HttpFoundation\Response;

class InjectIframeScript
{
    public function handle(ResponseCreated $event): void
    {
        if (! request()->isLivePreview()) {
            return;
        }

        $response = $event->response;

        if (! $response instanceof Response) {
            return;
        }

        $content = $response->getContent();

        if (! is_string($content)) {
            return;
        }

        $content = $this->stripAttributeSpans($content);

        if (stripos($content, '</body>') !== false) {
            $content = str_ireplace('</body>', $this->scriptTag().'</body>', $content);
        }

        $response->setContent($content);
    }

    private function stripAttributeSpans(string $html): string
    {
        $pattern = '/<span\s+data-alt-editable-handle="[^"]*"(?:\s+data-alt-editable-rowid="[^"]*")?(?:\s+data-alt-editable-empty="[^"]*")?>([\s\S]*?)<\/span>/i';

        if (! preg_match_all($pattern, $html, $matches, PREG_OFFSET_CAPTURE)) {
            return $html;
        }

        $count = count($matches[0]);

        for ($i = $count - 1; $i >= 0; $i--) {
            [$fullMatch, $offset] = $matches[0][$i];
            [$inner] = $matches[1][$i];

            $before = substr($html, 0, $offset);
            $lastOpen = strrpos($before, '<');
            $lastClose = strrpos($before, '>');
            $inTag = $lastOpen !== false && ($lastClose === false || $lastOpen > $lastClose);

            if ($inTag) {
                $html = substr_replace($html, $inner, $offset, strlen($fullMatch));
            }
        }

        return $html;
    }

    private function scriptTag(): string
    {
        $js = file_get_contents(__DIR__.'/../../resources/js/iframe.js');

        $settings = json_encode(
            ['pickers' => Settings::pickers()],
            JSON_THROW_ON_ERROR | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT,
        );

        return '<script id="alt-live-editor-iframe">'
            .'window.__ALT_LIVE_EDITOR__='.$settings.';'
            .$js
            .'</script>';
    }
}
