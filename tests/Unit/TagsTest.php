<?php

namespace AltDesign\AltLiveEditor\Tests\Unit;

use AltDesign\AltLiveEditor\Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;
use AltDesign\AltLiveEditor\Tags\AltLiveEditor;
use Statamic\Facades\Antlers;
use Statamic\Facades\Token;
use Statamic\Tokens\FileToken;
use Statamic\Tokens\Handlers\LivePreview;

class TagsTest extends TestCase
{
    private function withLivePreview(): void
    {
        Token::shouldReceive('find')
            ->with('live-preview-token')
            ->andReturn(new FileToken('live-preview-token', LivePreview::class, []));

        request()->headers->set('X-Statamic-Token', 'live-preview-token');
    }

    private function render(array $params, string $content = 'Hello'): string
    {
        $tag = new AltLiveEditor;
        $tag->setProperties([
            'parser' => Antlers::parser(),
            'content' => $content,
            'context' => [],
            'params' => $params,
            'tag' => 'alt_live_editor',
            'tag_method' => 'index',
        ]);

        return $tag->index();
    }

    #[Test]
    public function the_tags_render_only_their_content_on_the_public_site()
    {
        $html = $this->render(['handle' => 'title']);

        $this->assertSame('Hello', trim($html));
    }

    #[Test]
    public function the_wrapper_element_is_limited_to_a_plain_tag_name()
    {
        $this->withLivePreview();

        $html = $this->render(['handle' => 'title', 'as' => 'img onerror=alert(1)']);

        $this->assertStringStartsWith('<span ', trim($html));
        $this->assertStringNotContainsString('onerror', $html);
    }

    #[Test]
    public function a_plain_tag_name_is_honoured()
    {
        $this->withLivePreview();

        $html = $this->render(['handle' => 'title', 'as' => 'h1']);

        $this->assertStringStartsWith('<h1 data-alt-editable-handle="title"', trim($html));
    }

    #[Test]
    public function parameters_are_escaped_in_the_markup()
    {
        $this->withLivePreview();

        $html = $this->render(['handle' => 'x" onmouseover="alert(1)']);

        $this->assertStringNotContainsString('" onmouseover="', $html);
        $this->assertStringContainsString('&quot;', $html);
    }
}
