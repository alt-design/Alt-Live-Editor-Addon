<?php

namespace AltDesign\AltLiveEditor\Tests\Unit;

use AltDesign\AltLiveEditor\AutoWrap;
use AltDesign\AltLiveEditor\Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;
use Statamic\Fields\Field;
use Statamic\Fields\Value;
use Statamic\Fieldtypes\Assets\Assets;
use Statamic\Fieldtypes\Replicator;
use Statamic\Fieldtypes\Text;

class AutoWrapTest extends TestCase
{
    private function value(string $handle, $raw, $fieldtype): Value
    {
        $fieldtype->setField(new Field($handle, ['type' => $fieldtype::handle()]));

        return new Value($raw, $handle, $fieldtype);
    }

    #[Test]
    public function it_wraps_a_text_field()
    {
        $this->assertTrue(AutoWrap::shouldWrap($this->value('heading', 'Hello', new Text)));
    }

    #[Test]
    public function it_leaves_excluded_handles_alone()
    {
        // Making a slug editable inline is a foot-gun, so these are skipped by default.
        foreach (['slug', 'id', 'url', 'permalink'] as $handle) {
            $this->assertFalse(
                AutoWrap::shouldWrap($this->value($handle, 'whatever', new Text)),
                "Expected [{$handle}] to be excluded"
            );
        }
    }

    #[Test]
    public function excluded_handles_are_configurable()
    {
        config()->set('alt-live-editor.exclude_handles', ['heading']);

        $this->assertFalse(AutoWrap::shouldWrap($this->value('heading', 'Hello', new Text)));
        $this->assertTrue(AutoWrap::shouldWrap($this->value('slug', 'hello', new Text)));
    }

    #[Test]
    public function it_skips_values_with_no_fieldtype()
    {
        $this->assertFalse(AutoWrap::shouldWrap(new Value('orphan', 'handle')));
        $this->assertFalse(AutoWrap::shouldWrap(null));
    }

    #[Test]
    public function it_skips_fieldtypes_it_has_no_editor_for()
    {
        // Assets are handled by the image tag + picker, not by inline wrapping.
        $this->assertFalse(AutoWrap::shouldWrap($this->value('hero', [], new Assets)));
    }

    #[Test]
    public function it_classifies_nesting_fieldtypes()
    {
        $replicator = $this->value('page_builder', [], new Replicator);

        $this->assertTrue(AutoWrap::isNesting($replicator));
        $this->assertFalse(AutoWrap::isScalar($replicator));
        $this->assertFalse(AutoWrap::isBard($replicator));
    }

    #[Test]
    public function it_marks_up_a_value_with_the_attributes_the_iframe_looks_for()
    {
        $html = AutoWrap::wrapMarkup('heading', 'Hello');

        $this->assertSame('<span data-alt-editable-handle="heading">Hello</span>', $html);
    }

    #[Test]
    public function it_includes_the_row_id_for_nested_values()
    {
        $html = AutoWrap::wrapMarkup('heading', 'Hello', 'abc123');

        $this->assertStringContainsString('data-alt-editable-rowid="abc123"', $html);
    }

    #[Test]
    public function it_flags_empty_values_so_the_iframe_can_show_a_placeholder()
    {
        $html = AutoWrap::wrapMarkup('heading', '', null, true);

        $this->assertStringContainsString('data-alt-editable-empty="1"', $html);
    }

    #[Test]
    public function it_escapes_the_handle_and_row_id()
    {
        $html = AutoWrap::wrapMarkup('head"ing', 'Hello', 'a"b');

        $this->assertStringNotContainsString('head"ing', $html);
        $this->assertStringContainsString('head&quot;ing', $html);
        $this->assertStringContainsString('a&quot;b', $html);
    }

    #[Test]
    public function it_is_inactive_outside_live_preview()
    {
        // The whole point: the front end must be untouched on a normal request.
        $this->assertFalse(AutoWrap::isActive());
    }
}
