<?php

namespace AltDesign\AltLiveEditor\Tests\Unit;

use AltDesign\AltLiveEditor\Listeners\InjectIframeScript;
use AltDesign\AltLiveEditor\Tests\TestCase;
use Illuminate\Http\Response;
use PHPUnit\Framework\Attributes\Test;
use Statamic\Tokens\Handlers\LivePreview;
use Statamic\Events\ResponseCreated;
use Statamic\Facades\Token;
use Statamic\Tokens\FileToken;

class InjectIframeScriptTest extends TestCase
{
    private function handle(string $html): string
    {
        $response = new Response($html);

        (new InjectIframeScript)->handle(new ResponseCreated($response, null));

        return $response->getContent();
    }

    #[Test]
    public function it_leaves_normal_responses_completely_alone()
    {
        $html = '<html><body><h1>Hi</h1></body></html>';

        $this->assertSame($html, $this->handle($html));
    }

    #[Test]
    public function it_injects_the_editor_script_in_live_preview()
    {
        $this->withLivePreview();

        $out = $this->handle('<html><body><h1>Hi</h1></body></html>');

        $this->assertStringContainsString('id="alt-live-editor-iframe"', $out);
        $this->assertStringContainsString('window.__ALT_LIVE_EDITOR__=', $out);
        $this->assertStringContainsString('"tags":"builtin"', $out);
    }

    #[Test]
    public function it_injects_before_the_closing_body_tag()
    {
        $this->withLivePreview();

        $out = $this->handle('<html><body><h1>Hi</h1></body></html>');

        $this->assertStringEndsWith('</body></html>', $out);
        $this->assertLessThan(strpos($out, '</body>'), strpos($out, 'alt-live-editor-iframe'));
    }

    #[Test]
    public function it_strips_editable_spans_that_landed_inside_an_attribute()
    {
        $this->withLivePreview();

        // A wrapped value used in an attribute would otherwise emit broken markup.
        $out = $this->handle(
            '<body><img alt="<span data-alt-editable-handle="alt_text">A cat</span>"></body>'
        );

        $this->assertStringContainsString('alt="A cat"', $out);
        $this->assertStringNotContainsString('alt="<span', $out);
    }

    #[Test]
    public function it_keeps_editable_spans_that_are_real_content()
    {
        $this->withLivePreview();

        $out = $this->handle('<body><h1><span data-alt-editable-handle="heading">Hi</span></h1></body>');

        $this->assertStringContainsString('<span data-alt-editable-handle="heading">Hi</span>', $out);
    }

    /**
     * Statamic decides isLivePreview() by looking up the request's Statamic token and
     * checking its handler, so hand it a token pointing at the LivePreview handler.
     */
    private function withLivePreview(): void
    {
        Token::shouldReceive('find')
            ->with('live-preview-token')
            ->andReturn(new FileToken('live-preview-token', LivePreview::class, []));

        request()->headers->set('X-Statamic-Token', 'live-preview-token');
    }
}
