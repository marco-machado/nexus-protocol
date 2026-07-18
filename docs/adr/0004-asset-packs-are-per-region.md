# Asset packs are per-region, not per-district

The streaming manifest (`scripts/encode-assets.mjs`, `src/render/assets.ts`) knows two pack kinds, `core` and `region`, and mission launch awaits residency of the mission territory's region pack (`src/app/streaming.ts`). This narrows the GDD v3.0 draft 7 wording of "per-district and per-region asset packs": districts are procedurally generated from the mission seed and own no authored assets today, so a district pack would always be empty and the district's transfer cost is fully covered by its region's pack plus the core pack.

## Considered Options

Adding an empty `district` pack kind now was rejected: it would put schema surface in the manifest with no producer, no consumer, and no measurable budget, and the audit would report permanently zero-byte packs.

## Consequences

Region packs are the streaming granularity until district-specific authored assets exist. Introducing them requires a manifest `version` bump that adds a district pack kind, a residency await keyed on the mission district in `ensureRegionResident`, and a per-district budget row in `scripts/delivery-budgets.json`; the audit and `tests/delivery.test.ts` extend at the same time.
