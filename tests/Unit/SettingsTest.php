<?php

namespace AltDesign\AltLiveEditor\Tests\Unit;

use AltDesign\AltLiveEditor\Settings;
use AltDesign\AltLiveEditor\Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;

class SettingsTest extends TestCase
{
    #[Test]
    public function it_ships_a_default_for_every_picker_type()
    {
        $pickers = Settings::pickers();

        $this->assertSame(Settings::PICKER_TYPES, array_keys($pickers));
    }

    #[Test]
    public function a_plain_string_applies_to_every_type()
    {
        config()->set('alt-live-editor.picker', 'builtin');

        $this->assertSame([
            'image' => 'builtin',
            'entries' => 'builtin',
            'taxonomy' => 'builtin',
            'tags' => 'builtin',
        ], Settings::pickers());
    }

    #[Test]
    public function partial_config_is_filled_in_rather_than_leaving_holes()
    {
        // The JS looks types up directly, so a missing key would read as undefined.
        config()->set('alt-live-editor.picker', ['tags' => 'builtin']);

        $this->assertSame([
            'image' => 'native',
            'entries' => 'native',
            'taxonomy' => 'native',
            'tags' => 'builtin',
        ], Settings::pickers());
    }

    #[Test]
    public function an_unrecognised_value_falls_back_to_native_not_to_nothing()
    {
        config()->set('alt-live-editor.picker', ['image' => 'nonsense', 'entries' => null]);

        $pickers = Settings::pickers();

        $this->assertSame('native', $pickers['image']);
        $this->assertSame('native', $pickers['entries']);
    }

    #[Test]
    public function debug_is_off_unless_switched_on()
    {
        $this->assertFalse(Settings::debug());

        config()->set('alt-live-editor.debug', true);

        $this->assertTrue(Settings::debug());
    }
}
