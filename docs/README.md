# Babble: system guide and recovery handbook

Start here for the system that supplies Lickety’s clues, Self Serve, the historical statistics, and Babble Expert’s connected services. Verified against source and the live Netlify projects on **20 October 2026**.

| Read this | What it answers |
|---|---|
| [Architecture and design](ARCHITECTURE.md) | Components, diagrams, technologies, storage, puzzle solving, validation, triggers and publication |
| [Backup and disaster recovery](DISASTER-RECOVERY.md) | What GitHub contains, what it does not contain, making a recovery pack, restore instructions, Netlify outages |
| [SQL Server failover](SQL-SERVER-FAILOVER.md) | Grid/word exports, old database mappings, staging SQL, returning to the old generator |
| [Operations](OPERATIONS.md) | Daily checks, settings, safe troubleshooting and deployment |
| [Recovery verification record](RECOVERY-DRILL.md) | What was actually backed up and tested, and the drills still outstanding |
| [Small daily GitHub backups](GITHUB-BACKUPS.md) | Low-usage validated puzzle checkpoints, ready-to-use private-repository workflow and recovery commands |

**Current position:** code and imported historical data are in GitHub. New runtime data lives in Netlify Blobs and needs its own backup. Both public web projects use Netlify; switching to the old clues page is not protection against a complete Netlify outage. A downloadable recovery pack and a standalone emergency page make the data portable. An independent standby host and DNS cutover remain operator tasks.

## Source map

| Project | Repository | Responsibility |
|---|---|---|
| Self Serve / new clues | [SelfServeClues](https://github.com/licketySplitAUS/SelfServeClues) | React website, solver, history, validation, Admin, backend functions, recovery tools |
| Original public site | [Babble](https://github.com/licketySplitAUS/Babble) | `r46.me`, legacy generated pages, downloads and the public clues routing switch |
| Desktop app | [BabbleExpert](https://github.com/licketySplitAUS/BabbleExpert) | Electron application, side-by-side panes, word transfer, installers and updates |
| Legacy Delphi / SQL Server | Local source, reports and database | Original generator; not all of this is in the three GitHub repositories |

The diagrams are Mermaid diagrams rendered directly by GitHub. They remain editable text in the repository. GitHub documents this format in [Creating diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams).

## Practical first steps

1. In [Admin](https://selfserve.r46.me/history-admin.html), enter the admin key and expand **Backup & recovery**. Download all runtime data and the emergency clues page.
2. Use the [recovery pack instructions](DISASTER-RECOVERY.md#make-a-portable-recovery-pack) to collect source bundles, imported history and the full SQL staging export.
3. Copy the pack to another device or provider. Preserve the secrets in a password manager separately.
4. Keep a native SQL Server `.bak` and the legacy generator if returning to the old system is a requirement.
5. Before relying on outage failover, rehearse serving the emergency page on another host and confirm access to the domain’s DNS controls.

[Back to project README](../README.md)
