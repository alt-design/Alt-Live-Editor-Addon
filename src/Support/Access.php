<?php

namespace AltDesign\AltLiveEditor\Support;

use Statamic\Contracts\Entries\Collection as CollectionContract;
use Statamic\Contracts\Taxonomies\Taxonomy as TaxonomyContract;
use Statamic\Facades\Collection;
use Statamic\Facades\Taxonomy;
use Statamic\Facades\User;
use Statamic\Fields\Blueprint;

/**
 * Server-side authorisation for the addon's control panel endpoints.
 *
 * Control panel authentication only proves the user can reach the control panel,
 * so every endpoint also checks the user's own permission on whatever it reads.
 */
class Access
{
    /**
     * Collection handles from the request that exist and that the current user can view.
     *
     * @param  array<int, string>  $handles
     * @return array<int, string>
     */
    public static function viewableCollections(array $handles): array
    {
        return array_values(array_filter($handles, function (string $handle): bool {
            $collection = Collection::findByHandle($handle);

            return $collection instanceof CollectionContract && self::can('view', $collection);
        }));
    }

    /**
     * Taxonomy handles from the request that exist and that the current user can view.
     *
     * @param  array<int, string>  $handles
     * @return array<int, string>
     */
    public static function viewableTaxonomies(array $handles): array
    {
        return array_values(array_filter($handles, function (string $handle): bool {
            $taxonomy = Taxonomy::findByHandle($handle);

            return $taxonomy instanceof TaxonomyContract && self::can('view', $taxonomy);
        }));
    }

    /**
     * Whether the current user may read the field configuration of a blueprint.
     * Only entry and term blueprints are in scope, because those are what Live Preview edits.
     */
    public static function canReadBlueprint(Blueprint $blueprint): bool
    {
        $namespace = (string) $blueprint->namespace();

        if (str_starts_with($namespace, 'collections.')) {
            $collection = Collection::findByHandle(substr($namespace, strlen('collections.')));

            return $collection instanceof CollectionContract && self::can('view', $collection);
        }

        if (str_starts_with($namespace, 'taxonomies.')) {
            $taxonomy = Taxonomy::findByHandle(substr($namespace, strlen('taxonomies.')));

            return $taxonomy instanceof TaxonomyContract && self::can('view', $taxonomy);
        }

        return false;
    }

    public static function can(string $ability, mixed $subject): bool
    {
        $user = User::current();

        return $user !== null && $user->can($ability, $subject);
    }
}
