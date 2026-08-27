<?php

namespace AltDesign\AltLiveEditor\Tests;

use AltDesign\AltLiveEditor\ServiceProvider;
use Statamic\Testing\AddonTestCase;

abstract class TestCase extends AddonTestCase
{
    protected string $addonServiceProvider = ServiceProvider::class;
}
