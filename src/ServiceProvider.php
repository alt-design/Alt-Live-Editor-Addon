<?php

namespace AltDesign\AltLiveEditor;

use AltDesign\AltLiveEditor\Listeners\InjectIframeScript;
use AltDesign\AltLiveEditor\Tags\AltLiveEditor;
use Statamic\Events\ResponseCreated;
use Statamic\Fields\Value;
use Statamic\Providers\AddonServiceProvider;
use Statamic\Statamic;
use Statamic\View\Cascade;

class ServiceProvider extends AddonServiceProvider
{
    protected $tags = [
        AltLiveEditor::class,
    ];

    protected $scripts = [
        __DIR__.'/../resources/js/cp.js',
    ];

    protected $listen = [
        ResponseCreated::class => [
            InjectIframeScript::class,
        ],
    ];

    public function bootAddon()
    {
        $this->provideConfigToScript();
        $this->wrapPreviewValues();
    }

    /**
     * Hand the control panel JS the settings it needs. Doing it here rather than
     * hardcoding in cp.js keeps the CP route prefix, picker choice and debug flag
     * in one place.
     */
    private function provideConfigToScript(): void
    {
        Statamic::provideToScript([
            'altLiveEditor' => [
                'debug' => Settings::debug(),
                'pickers' => Settings::pickers(),
            ],
        ]);
    }

    /**
     * In Live Preview, swap each of the entry's values for one that renders itself
     * wrapped in an editable marker. Outside Live Preview this never runs, so the
     * front end is untouched.
     */
    private function wrapPreviewValues(): void
    {
        app(Cascade::class)->hydrated(function (Cascade $cascade) {
            if (! AutoWrap::isActive()) {
                return;
            }

            $content = $cascade->content();
            if ($content && method_exists($content, 'blueprint')) {
                $bp = $content->blueprint();
                if ($bp) {
                    $cascade->set('_alt_blueprint', $bp->namespace().'.'.$bp->handle());
                    $cascade->set('_alt_entry_id', method_exists($content, 'id') ? $content->id() : null);
                }
            }

            foreach ($cascade->toArray() as $key => $value) {
                if ($value instanceof Value && AutoWrap::shouldWrap($value)) {
                    $cascade->set($key, AutoWrap::wrap($value));
                }
            }
        });
    }
}
