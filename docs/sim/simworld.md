# SimWorld is the fictitious runtime world

Everything used by the running TrainSim simulation comes from
`data/simworld/simworld.sqlite`. The map, timetable, train profiles, Docs catalogue,
technical contract browser, component instances and scenario values use this
database. Runtime endpoints cannot select an official-source or corpus database.

SimWorld is a fictitious model. It may use geometry, schedules and definitions
derived from real sources, but it does not describe validated deployed assets or
real-time railway operation. Source quotations retain their source identity when
included as reference snapshots; their presence does not make a simulated instance
official or engineering-grade.

## Separate stores

Geography and timetable staging values are **corpus input**, so their database is
`data/corpus/geography.sqlite`. A schema `.sql` file is system code rather than a
data store; its domain-specific definition lives at `db/corpus/geography-schema.sql`.
System bookkeeping, such as the query log in `data/local/console.sqlite`, remains
separate from corpus inputs and fictitious runtime values.

| Store | Role | Runtime access |
| --- | --- | --- |
| `data/esig/esig.sqlite` | Official PDF evidence, hashes, pages and extracted candidates | Ingestion input; read-only inspection |
| `data/corpus/corpus.sqlite` | Isolated corpus: pinned evidence snapshots, local contracts, dataset references and source seeds | Explicit publication input; read-only inspection |
| `data/corpus/geography.sqlite` | Ingested geography and timetable staging data | Input to initial SimWorld construction; read-only inspection |
| `data/simworld/simworld.sqlite` | Fictitious instances, runtime values and selected reference snapshots | Sole runtime database |

Corpus records use local `corpus-id:` identifiers. Official standard names, issues,
clause numbers, filenames and hashes are distinct reference fields. The corpus
retains a pinned copy of the evidence rows needed for foreign keys. It does not
modify the official source registry. SimWorld receives another explicit snapshot;
there are no live cross-database joins during a simulation step.

## Build and publish

For older checkouts, run `npm run migrate:geography` once. It moves the former
`data/trainsim.sqlite`, checks integrity, and updates the existing SimWorld source
path while retaining its fingerprint and relocation history. It refuses to overwrite
an existing destination. No SimWorld instance values are rebuilt by this migration.

```bash
npm run build:simworld
npm run build
npm start
```

The first build copies the available geography/timetable staging data and corpus
into SimWorld. It records input fingerprints in `simworld_source` and marks the
world fictitious in `simworld_meta`. Subsequent reference refreshes preserve
runtime train profiles, component configurations, scenario parameter overrides
and seed-object edits. Source changes do not become runtime changes until the
reference snapshot is explicitly refreshed.

`npm run ingest:functional` and the Docs **Refresh references** action parse corpus
inputs and publish a new SimWorld reference snapshot. `npm run build:simworld`
also migrates the former combined registry: it copies local corpus records first,
backs up the old registry, and then leaves only source-evidence tables in the
official database. A migration with missing copied data fails rather than discarding it.

The runtime database path is fixed. The former `TRAINSIM_DB` source override no
longer changes the simulation's data source. Query logging is separate diagnostic
bookkeeping, not simulation state.

## Runtime entities and provenance

`simworld_component` holds fictitious component instances linked to corpus evidence.
`simworld_contract` links these instances to I/O contracts and keeps execution
`blocked_pending_review`. `simworld_parameter` stores editable scenario values
with fictitious classification and source-file lineage.

The dataset inventory merged in PR #17 is ingested into `corpus_dataset`,
`corpus_seed_object` and `corpus_seed_link`. It retains source URL, upstream
revision, licence, file SHA256 and unresolved relationship states. Available
interlocking seeds become fictitious `simworld_seed_object` and
`simworld_seed_link` records. They are model inputs, not a validated ETCS/RBC
implementation. Source files and licences are retained unchanged.

Data and Query default to SimWorld. Source and corpus files are read-only in
these tools, and SQL attachments are disabled. Runtime edits never write back
to a corpus input or official document. Official evidence extraction remains a
separate ingestion operation.
