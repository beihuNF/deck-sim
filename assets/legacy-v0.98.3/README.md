# Resources retained for existing browser saves

Frozen excerpts of the assets at commit `7ed6661`, which public-beta v0.111.0
removed or renamed. Keep the files and index immutable, like the legacy rule
definitions. These support retired model IDs and old decks/encounters.

`tools/legacy_assets.py` reapplies missing files, texture/spine/scene metadata
and localization/audio aliases after extraction. Font extraction includes the frozen
localization characters. Current game content always wins.
Legacy atlas pages live separately to avoid overwriting current atlas pages;
their filtered frames include only sprites absent from the beta atlas.
