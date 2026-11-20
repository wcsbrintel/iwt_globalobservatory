# TG-H: PT/EN/ES localization gate for future case publication

The canonical repository is `wcsbrintel/iwt_globalobservatory`, mirrored to `acarvalho-wcs/wildlife-trafficking-data`. **Only newly added case files must conform to this contract.** The 1,650 earlier cases will be audited separately, without rewriting them here.

After eligibility, source verification, OSINT [O]/[S]/[I]/[N]/[T], deduplication and route checks, assign `localization_schema_version: 1` and supply all three **nonblank** PT/EN/ES variants of every additional card field: `location_label_`, `fauna_label_`, `taxon_text_`, `modal_label_`, `quantity_label_`, `quantity_note_`, `geographic_note_` (suffixes `pt`, `en`, `es`). Existing `title_`, `card_text_` and `context_` fields remain required for each language.

Localize fauna groups, descriptive terms, numeric-unit labels, quantities, modal names and geographic caveats. Preserve proper geographic names, scientific names, evidence provenance, quantities, known/unknown distinctions and factual route uncertainty. Use explicitly localized “not reported” for unknown values, rather than guessing. Check the actual language of each field; passing a nonempty-value check does not replace human linguistic review. For example: `modal_label_pt: "Rodoviário"`, `modal_label_en: "Road"`, `modal_label_es: "Terrestre"`.

The frozen `scripts/legacy-card-localization-paths.json` is an immutable pre-existing-file allowance and MUST NOT be extended during future inclusion. `scripts/case_store.py validate` and `build` block any **new** case file lacking version 1 or the full localized field set; the web validator blocks malformed version 1 records, and `CaseDisplay` uses translated values throughout cards, mini cards and map details. Include localization regression tests in publication workflows. Do not backfill historical case fields as part of this change.

OSINT source categories stay unchanged: [O] facts from the event; [S] scientific repository papers; [I] WCS institutional reports; [N] reportage in the news repository; [T] technical work outside the repositories. No marker should be fabricated merely to satisfy formatting.
