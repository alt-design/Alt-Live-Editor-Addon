<?php

namespace AltDesign\AltLiveEditor\Tests\Unit;

use AltDesign\AltLiveEditor\AutoWrap;
use AltDesign\AltLiveEditor\Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;
use Statamic\Facades\Antlers;
use Statamic\Facades\Token;
use Statamic\Fields\Field;
use Statamic\Fields\Value;
use Statamic\Fieldtypes\Bard;
use Statamic\Tokens\FileToken;
use Statamic\Tokens\Handlers\LivePreview;

class AutoWrapBardTest extends TestCase
{
    private function bard(array $config, array $raw): Value
    {
        $fieldtype = new Bard;
        $fieldtype->setField(new Field('body', array_merge(['type' => 'bard'], $config)));

        return new Value($raw, 'body', $fieldtype);
    }

    private function paragraph(string $text): array
    {
        return ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]];
    }

    private function quoteSet(bool $enabled = true): array
    {
        return ['type' => 'set', 'attrs' => ['id' => 'set-1', 'enabled' => $enabled, 'values' => ['type' => 'quote', 'cite' => 'Ada']]];
    }

    private function setsConfig(): array
    {
        return ['sets' => ['main' => ['sets' => ['quote' => ['fields' => [['handle' => 'cite', 'field' => ['type' => 'text']]]]]]]];
    }

    private function withLivePreview(): void
    {
        Token::shouldReceive('find')
            ->with('live-preview-token')
            ->andReturn(new FileToken('live-preview-token', LivePreview::class, []));

        request()->headers->set('X-Statamic-Token', 'live-preview-token');
    }

    #[Test]
    public function a_bard_field_with_sets_still_loops_in_live_preview()
    {
        $this->withLivePreview();

        $value = $this->bard($this->setsConfig(), [
            $this->paragraph('Before'),
            $this->quoteSet(),
            $this->paragraph('After'),
        ]);

        $html = Antlers::parse('{{ body }}[{{ type }}:{{ if type == "text" }}{{ text }}{{ else }}{{ cite }}{{ /if }}]{{ /body }}', [
            'body' => AutoWrap::wrapBard($value),
        ]);

        $this->assertStringContainsString('[text:', $html);
        $this->assertStringContainsString('[quote:Ada]', $html);
        $this->assertSame(2, substr_count($html, '[text:'));
    }

    #[Test]
    public function text_between_sets_carries_the_index_of_its_stored_node()
    {
        $this->withLivePreview();

        $value = $this->bard($this->setsConfig(), [
            $this->paragraph('Before'),
            $this->quoteSet(),
            $this->paragraph('After'),
        ]);

        $items = AutoWrap::wrapBard($value)->value();

        $this->assertCount(3, $items);
        $this->assertStringContainsString('data-alt-editable-node-index="0"', (string) $items[0]['text']);
        $this->assertStringContainsString('Before', (string) $items[0]['text']);
        $this->assertStringContainsString('data-alt-editable-node-index="2"', (string) $items[2]['text']);
        $this->assertStringContainsString('After', (string) $items[2]['text']);
    }

    #[Test]
    public function a_disabled_set_does_not_shift_which_text_is_wrapped()
    {
        $this->withLivePreview();

        $value = $this->bard($this->setsConfig(), [
            $this->paragraph('One'),
            $this->quoteSet(false),
            $this->paragraph('Two'),
        ]);

        $items = AutoWrap::wrapBard($value)->value();

        $this->assertCount(1, $items);
        $this->assertStringContainsString('data-alt-editable-node-index="0"', (string) $items[0]['text']);
        $this->assertStringContainsString('data-alt-editable-node-index="2"', (string) $items[0]['text']);
    }

    #[Test]
    public function a_bard_field_without_sets_renders_wrapped_html()
    {
        $this->withLivePreview();

        $value = $this->bard([], [$this->paragraph('Hello')]);

        $html = (string) AutoWrap::wrapBard($value)->value();

        $this->assertStringContainsString('data-alt-editable-bard="body:0"', $html);
        $this->assertStringContainsString('Hello', $html);
    }

    #[Test]
    public function outside_live_preview_a_bard_field_is_untouched()
    {
        $value = $this->bard($this->setsConfig(), [$this->paragraph('Before'), $this->quoteSet()]);

        $items = AutoWrap::wrapBard($value)->value();

        $this->assertStringNotContainsString('data-alt-editable', (string) $items[0]['text']);
    }
}
