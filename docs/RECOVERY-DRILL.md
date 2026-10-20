# Recovery verification: 20 October 2026

[Documentation home](README.md) · [Recovery instructions](DISASTER-RECOVERY.md)

This records what was actually exercised when the recovery tooling was introduced. It distinguishes tested portability from a full production disaster rehearsal.

## Verified

| Check | Result |
|---|---|
| Application unit tests | 45 passing, including seven new recovery tests |
| TypeScript / production build | Passed |
| Netlify function packaging | Passed, including recovery route and existing schedules |
| Published source | `a93da82b29faf9219340bb3921cdd72275b9503b` in SelfServeClues |
| Production deploy | `6ad7389660ac0b1f43943d98`, ready |
| Live runtime backup | 33 objects across the four defined stores; checksum and reference validation passed |
| Live SQL downloads | Current and since-import downloads succeeded; puzzle 8616, 147 words, 2,297 points |
| Live emergency HTML download | Succeeded; current puzzle shown; no external assets/API calls required |
| Unauthorized recovery request | Rejected with HTTP 403 |
| Full private recovery pack | 37 checksummed files, approximately 80.6 MiB, including all three Git bundles |
| Git bundles | All three verified; SelfServeClues cloned locally from its bundle without GitHub |
| Real backup restoration logic | All 33 objects restored into isolated simulated stores; identical-data resume passed; control written last |
| Offline solver | Reproduced 147 words and 2,297 points from the backed-up dictionary and current board; output clearly unverified |
| Full canonical SQL staging export | 7,267 puzzles, 1,278,832 word rows, 17,133,494 summed points |
| SQL export internal totals | Per-game counts/scores agreed with all generated word rows |
| Live saved result after checks | Puzzle 8616, `matched`; no solve/correction/publication switch triggered by backup checks |

The pack is stored privately under the operator’s local `Babble/Recovery` backup folder, outside Git. Its manifest records the exact commits: SelfServeClues `a93da82`, Babble `eb968a2`, BabbleExpert `fce54e3`. The Babble working tree had an untracked local file; it was preserved in place and excluded from its committed-source bundle, as reported in the manifest.

## Not yet rehearsed or configured

- A restore to a second real Netlify project; simulated storage is not a production-provider restore test.
- Executing the staging SQL in SQL Server, restoring a native `.bak`, or running the old Delphi generator against it.
- An independent standby host, DNS/HTTPS cutover, or Expert integration against that standby.
- A daily scheduled backup job, offsite replication, automatic retention or backup-failure monitoring.
- Recovery of credentials from the operator’s password manager, domain account or original SQL Server account.

No production data was overwritten to test restoration. The local pack is a useful verified recovery artifact, but must be copied to an independent device/provider. Those remaining drills determine the actual recovery time; no recovery-time guarantee is implied by the successful export.
