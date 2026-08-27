<?php

namespace AltDesign\AltLiveEditor\Tests\Feature;

use AltDesign\AltLiveEditor\Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;
use Statamic\Facades\Blueprint;
use Statamic\Facades\User;

class RowOptionsControllerTest extends TestCase
{
    private function makeBlueprint(): void
    {
        $blueprint = Blueprint::make('page')->setNamespace('collections.pages')->setContents([
            'fields' => [
                [
                    'handle' => 'page_builder',
                    'field' => [
                        'type' => 'replicator',
                        'sets' => [
                            'main' => [
                                'sets' => [
                                    'hero' => [
                                        'display' => 'Hero',
                                        'fields' => [
                                            ['handle' => 'heading', 'field' => ['type' => 'text']],
                                            ['handle' => 'full_width', 'field' => ['type' => 'toggle', 'display' => 'Full width']],
                                            ['handle' => 'alignment', 'field' => [
                                                'type' => 'select',
                                                'options' => ['left' => 'Left', 'right' => 'Right'],
                                            ]],
                                            ['handle' => 'image', 'field' => ['type' => 'assets']],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ]);

        Blueprint::shouldReceive('find')->with('collections.pages.page')->andReturn($blueprint);
        Blueprint::makePartial();
    }

    private function requestOptions(array $payload)
    {
        return $this
            ->actingAs(User::make()->makeSuper())
            ->postJson(cp_route('alt-live-editor.row-options'), $payload);
    }

    #[Test]
    public function it_requires_authentication()
    {
        // CP middleware guards the endpoint — it never reaches the controller.
        $this->postJson(cp_route('alt-live-editor.row-options'), [])
            ->assertUnauthorized();
    }

    #[Test]
    public function it_reports_missing_parameters_rather_than_erroring()
    {
        $this->requestOptions([])
            ->assertOk()
            ->assertJson(['fields' => [], 'error' => 'Missing blueprint, field, or set']);
    }

    #[Test]
    public function it_reports_an_unknown_blueprint()
    {
        $this->requestOptions(['blueprint' => 'nope.nope', 'field' => 'page_builder', 'set' => 'hero'])
            ->assertOk()
            ->assertJsonPath('error', 'Blueprint not found: nope.nope');
    }

    #[Test]
    public function it_returns_only_the_option_like_fields_of_a_set()
    {
        $this->makeBlueprint();

        $response = $this->requestOptions([
            'blueprint' => 'collections.pages.page',
            'field' => 'page_builder',
            'set' => 'hero',
            'values' => ['full_width' => true, 'alignment' => 'right'],
        ])->assertOk();

        $handles = collect($response->json('fields'))->pluck('handle')->all();

        // Toggle and select are options; text and assets are content, handled inline.
        $this->assertContains('full_width', $handles);
        $this->assertContains('alignment', $handles);
        $this->assertNotContains('heading', $handles);
        $this->assertNotContains('image', $handles);
    }

    #[Test]
    public function it_returns_the_current_value_of_each_option()
    {
        $this->makeBlueprint();

        $fields = collect($this->requestOptions([
            'blueprint' => 'collections.pages.page',
            'field' => 'page_builder',
            'set' => 'hero',
            'values' => ['alignment' => 'right'],
        ])->json('fields'))->keyBy('handle');

        $this->assertSame('right', $fields['alignment']['value']);
        $this->assertSame(
            [['value' => 'left', 'label' => 'Left'], ['value' => 'right', 'label' => 'Right']],
            $fields['alignment']['options']
        );
    }
}
