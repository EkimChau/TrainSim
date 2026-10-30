# Imported, independently licenced source fixtures

These two JSON fixtures are **unchanged upstream configuration files** for OSM Interlocking, reproduced under its GNU GPL v3 licence. The upstream full licence is preserved as [LICENSE.md](LICENSE.md).

- Upstream repository: https://github.com/osmhpi/interlocking
- Exact source commit: `a0a93a14850689e44728234e38e33c0f57c62438`
- `locking_table.json` → `locking_table_interlocking/specific_application/configuration.json` — original Git blob `1194ada7ff6c99a7101b355677ec93f6cf632cd4`
- `geographical.json` → `geographical_interlocking/specific_application/configuration.json` — original Git blob `50cd91a2b01f10dde836caca03650c95c365fb73`
- Licence: GNU General Public License v3, full text at `LICENSE.md`; original licence Git blob `f288702d2fa16d3cdf0035b15a9fcbc552cd88e7`.

The upstream repo also supplies the **generic application** (state machine rules) and the web simulator. These two JSON files alone are **complete specific-application configurations**, not a self-contained executable interlocking. To run either, obtain and run the matching upstream generic application at the pinned commit. Their syntax and semantics must not be silently reinterpreted.

**No production safety claim:** Test/example interlocking data, not an approved railway signalling installation and not an ETCS OBU or RBC. Use only in a simulator sandbox. Under GPLv3 these files retain their original licence and copyright; this attribution does not relicense other TrainSim components.
