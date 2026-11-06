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

    #[Test]
    public function it_strips_every_editable_span_in_a_tag_with_several_of_them()
    {
        $this->withLivePreview();

        $out = $this->handle(
            '<body><h1 style="color: <span data-alt-editable-handle="colour" data-alt-editable-rowid="r1">#fff</span>; '
            .'max-width: <span data-alt-editable-handle="width" data-alt-editable-rowid="r1" data-alt-editable-empty="1"></span>px">'
            .'<span data-alt-editable-handle="text">Hi</span></h1></body>'
        );

        $this->assertStringContainsString('style="color: #fff; max-width: px"', $out);
        $this->assertStringContainsString('<span data-alt-editable-handle="text">Hi</span>', $out);
    }

    #[Test]
    public function it_ignores_a_live_preview_query_string_without_a_valid_token()
    {
        request()->query->set('live-preview', 'anything');
        request()->query->set('token', 'not-a-real-token');
        Token::shouldReceive('find')->with('not-a-real-token')->andReturnNull();

        $html = '<html><body><h1>Hi</h1></body></html>';

        $this->assertSame($html, $this->handle($html));
    }

    #[Test]
    public function it_ignores_a_forged_token_header()
    {
        request()->headers->set('X-Statamic-Token', 'forged');
        Token::shouldReceive('find')->with('forged')->andReturnNull();

        $html = '<html><body><h1>Hi</h1></body></html>';

        $this->assertSame($html, $this->handle($html));
    }

    #[Test]
    public function it_ignores_a_token_that_belongs_to_another_handler()
    {
        Token::shouldReceive('find')
            ->with('other-token')
            ->andReturn(new FileToken('other-token', 'Some\\Other\\Handler', []));
        request()->headers->set('X-Statamic-Token', 'other-token');

        $html = '<html><body><h1>Hi</h1></body></html>';

        $this->assertSame($html, $this->handle($html));
    }

    #[Test]
    public function it_does_not_touch_non_html_responses_in_live_preview()
    {
        $this->withLivePreview();

        $response = new Response('{"html":"</body>"}', 200, ['Content-Type' => 'application/json']);

        (new InjectIframeScript)->handle(new ResponseCreated($response, null));

        $this->assertSame('{"html":"</body>"}', $response->getContent());
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
