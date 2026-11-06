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

        if (! $this->isHtml($response)) {
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

    private function isHtml(Response $response): bool
    {
        $type = $response->headers->get('Content-Type');

        return $type === null || str_contains(strtolower($type), 'html');
    }

    private function stripAttributeSpans(string $html): string
    {
        $pattern = '/<span\s+data-alt-editable-handle="[^"]*"(?:\s+data-alt-editable-rowid="[^"]*")?(?:\s+data-alt-editable-empty="[^"]*")?>([\s\S]*?)<\/span>/i';

        $offset = 0;

        while (preg_match($pattern, $html, $match, PREG_OFFSET_CAPTURE, $offset)) {
            [$fullMatch, $position] = $match[0];
            [$inner] = $match[1];

            if ($this->isInsideTag(substr($html, 0, $position))) {
                $html = substr_replace($html, $inner, $position, strlen($fullMatch));
                $offset = $position;

                continue;
            }

            $offset = $position + 1;
        }

        return $html;
    }

    private function isInsideTag(string $before): bool
    {
        $lastOpen = strrpos($before, '<');
        $lastClose = strrpos($before, '>');

        return $lastOpen !== false && ($lastClose === false || $lastOpen > $lastClose);
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
