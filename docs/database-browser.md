# Database browser

Open **Databases** to browse files by their role:

| Category | Data |
| --- | --- |
| System | Query history, application bookkeeping and other local tooling databases |
| SimWorld | Fictitious runtime instances, parameters and pinned reference snapshots |
| Corpus | Technical corpus, geography/timetable inputs and separately labelled official ETCS evidence |

Database cards show purpose, file path, size and access. Backups and legacy inputs
are hidden until **Show backups and legacy inputs** is selected. Search finds
database names, paths and purposes. The browser initially selects SimWorld.

The middle pane groups tables and views by purpose and supports table-name search.
Internal spatial-index tables are hidden by default. Reference tables in a mixed
SimWorld database are marked `ref`; the selected table's access is enforced by the
server as well as its editing controls.

**Database overview** shows file metadata, table/view counts and links to records.
**Rows** retains filtering, sorting, pagination and editing for writable tables.
**Structure** shows declared types, primary keys, NOT NULL declarations, defaults,
foreign keys, indexes and the SQL definition. Follow a foreign-key link to inspect
the referenced table. Structure inspection is read-only.

Database/table navigation and row filters are reflected in `#/data` URLs, so links
from Docs and map inspectors work alongside browser navigation. **Open Query**
uses the selected database; Query's database selector uses the same three groups.

Corpus and official inputs stay read-only. Runtime edits belong to SimWorld
instances and parameters; refreshing reference snapshots preserves those overrides.
See [the SimWorld boundary](sim/simworld.md) for database locations and provenance.
