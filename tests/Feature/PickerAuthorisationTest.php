<?php

namespace AltDesign\AltLiveEditor\Tests\Feature;

use AltDesign\AltLiveEditor\Support\Access;
use AltDesign\AltLiveEditor\Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;
use Statamic\Testing\Concerns\PreventsSavingStacheItemsToDisk;
use Statamic\Facades\Blueprint;
use Statamic\Facades\Collection;
use Statamic\Facades\Entry;
use Statamic\Facades\Role;
use Statamic\Facades\Taxonomy;
use Statamic\Facades\Term;
use Statamic\Facades\User;

class PickerAuthorisationTest extends TestCase
{
    use PreventsSavingStacheItemsToDisk;

    protected function resolveApplicationConfiguration($app)
    {
        parent::resolveApplicationConfiguration($app);

        $app['config']->set('statamic.editions.pro', true);
    }

    private function seedContent(): void
    {
        Collection::make('blog')->save();
        Collection::make('secret')->save();

        Entry::make()->collection('blog')->slug('hello')->data(['title' => 'Hello blog'])->published(true)->save();
        Entry::make()->collection('secret')->slug('plans')->data(['title' => 'Secret plans'])->published(true)->save();

        Taxonomy::make('topics')->save();
        Taxonomy::make('internal')->save();

        Term::make()->taxonomy('topics')->slug('news')->data(['title' => 'News'])->save();
        Term::make()->taxonomy('internal')->slug('redundancies')->data(['title' => 'Redundancies'])->save();
    }

    private function secretBlueprint(): void
    {
        $blueprint = Blueprint::make('secret')->setNamespace('collections.secret')->setContents([
            'fields' => [
                ['handle' => 'page_builder', 'field' => ['type' => 'replicator', 'sets' => ['main' => ['sets' => [
                    'hero' => ['display' => 'Hero', 'fields' => [['handle' => 'full_width', 'field' => ['type' => 'toggle']]]],
                ]]]]],
            ],
        ]);

        Blueprint::shouldReceive('find')->with('collections.secret.secret')->andReturn($blueprint);
        Blueprint::makePartial();
    }

    private function editor(array $permissions)
    {
        Role::make('limited')->addPermission(array_merge(['access cp'], $permissions))->save();

        $user = User::make()->email('limited@example.test')->assignRole('limited');
        $user->save();

        return $user;
    }

    #[Test]
    public function the_entries_picker_only_lists_collections_the_user_can_view()
    {
        $this->seedContent();
        $user = $this->editor(['view blog entries']);

        $response = $this->actingAs($user)
            ->postJson(cp_route('alt-live-editor.entries'), ['collections' => 'blog,secret'])
            ->assertOk();

        $titles = collect($response->json('entries'))->pluck('title')->all();

        $this->assertSame(['Hello blog'], $titles);
    }

    #[Test]
    public function the_entries_picker_refuses_a_collection_the_user_cannot_view()
    {
        $this->seedContent();
        $user = $this->editor(['view blog entries']);

        $this->actingAs($user)
            ->postJson(cp_route('alt-live-editor.entries'), ['collections' => 'secret'])
            ->assertForbidden()
            ->assertJsonPath('entries', []);
    }

    #[Test]
    public function the_entries_picker_lists_everything_to_a_super_user()
    {
        $this->seedContent();

        $response = $this->actingAs(User::make()->makeSuper())
            ->postJson(cp_route('alt-live-editor.entries'), ['collections' => 'blog,secret'])
            ->assertOk();

        $this->assertCount(2, $response->json('entries'));
    }

    #[Test]
    public function the_entries_picker_rejects_an_oversized_search()
    {
        $this->actingAs(User::make()->makeSuper())
            ->postJson(cp_route('alt-live-editor.entries'), ['collections' => 'blog', 'search' => str_repeat('a', 500)])
            ->assertUnprocessable();
    }

    #[Test]
    public function the_taxonomy_picker_only_lists_taxonomies_the_user_can_view()
    {
        $this->seedContent();
        $user = $this->editor(['view topics terms']);

        $response = $this->actingAs($user)
            ->postJson(cp_route('alt-live-editor.taxonomy'), ['taxonomies' => 'topics,internal'])
            ->assertOk();

        $titles = collect($response->json('terms'))->pluck('title')->all();

        $this->assertSame(['News'], $titles);
    }

    #[Test]
    public function the_taxonomy_picker_refuses_a_taxonomy_the_user_cannot_view()
    {
        $this->seedContent();
        $user = $this->editor(['view topics terms']);

        $this->actingAs($user)
            ->postJson(cp_route('alt-live-editor.taxonomy'), ['taxonomies' => 'internal'])
            ->assertForbidden()
            ->assertJsonPath('terms', []);
    }

    #[Test]
    public function the_sets_config_refuses_a_blueprint_from_a_collection_the_user_cannot_view()
    {
        $this->seedContent();
        $this->secretBlueprint();
        $user = $this->editor(['view blog entries']);

        $this->actingAs($user)
            ->postJson(cp_route('alt-live-editor.sets-config'), ['blueprint' => 'collections.secret.secret', 'field' => 'page_builder'])
            ->assertForbidden();
    }

    #[Test]
    public function blueprints_outside_entries_and_terms_are_never_readable()
    {
        $this->actingAs(User::make()->makeSuper());

        $globals = Blueprint::make('settings')->setNamespace('globals');
        $forms = Blueprint::make('contact')->setNamespace('forms');

        $this->assertFalse(Access::canReadBlueprint($globals));
        $this->assertFalse(Access::canReadBlueprint($forms));
    }

    #[Test]
    public function the_row_options_refuse_a_blueprint_from_a_collection_the_user_cannot_view()
    {
        $this->seedContent();
        $this->secretBlueprint();
        $user = $this->editor(['view blog entries']);

        $this->actingAs($user)
            ->postJson(cp_route('alt-live-editor.row-options'), [
                'blueprint' => 'collections.secret.secret',
                'field' => 'page_builder',
                'set' => 'hero',
            ])
            ->assertForbidden();
    }

    #[Test]
    public function the_bard_parser_needs_the_control_panel()
    {
        $this->postJson(cp_route('alt-live-editor.parse-bard'), ['html' => '<p>Hi</p>'])
            ->assertUnauthorized();
    }
}
