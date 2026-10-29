# Babble: developer and operations documentation

Start here for the system that supplies Lickety’s clues, Self Serve, historical statistics and Babble Expert’s connected services. The developer guides were checked against source on **29 October 2026**. The original system/recovery handbook included live checks on **20 October 2026**; dated rollout and drill records are not current service-status claims.

## Developer reading path

Start with the [developer guide](DEVELOPER-GUIDE.md), then [architecture](ARCHITECTURE.md), [design principles](DESIGN-PRINCIPLES.md) and [build/release pipelines](BUILD-AND-RELEASE.md). Desktop details live in [Expert's documentation](https://github.com/licketySplitAUS/BabbleExpert/tree/main/docs); public-site details live in [Babble's README](https://github.com/licketySplitAUS/Babble#readme). Each repository has an entry point, while shared system guidance is maintained here.

| Read this | What it answers |
|---|---|
| [Developer guide](DEVELOPER-GUIDE.md) | Ownership, onboarding, source navigation, common logic flows and change checks |
| [Design principles](DESIGN-PRINCIPLES.md) | Product constraints, compatibility, identity, uncertainty, persistence and performance tradeoffs |
| [Build and release](BUILD-AND-RELEASE.md) | Local commands, CI gates, Netlify/GitHub Pages delivery, installers, verification and rollback boundaries |
| [Architecture and design](ARCHITECTURE.md) | Components, diagrams, technologies, storage, puzzle solving, validation, triggers and publication |
| [Backup and disaster recovery](DISASTER-RECOVERY.md) | What GitHub contains, what it does not contain, making a recovery pack, restore instructions, Netlify outages |
| [SQL Server failover](SQL-SERVER-FAILOVER.md) | Grid/word exports, old database mappings, staging SQL, returning to the old generator |
| [Operations](OPERATIONS.md) | Daily checks, settings, safe troubleshooting and deployment |
| [Discord activity statistics](DISCORD-STATISTICS.md) | Read-only bot setup, reporting totals, date filters and test installations |
| [Recovery verification record](RECOVERY-DRILL.md) | What was actually backed up and tested, and the drills still outstanding |
| [Small daily GitHub backups](GITHUB-BACKUPS.md) | Checkpoint design and workflow template; a dated implementation record |
| [Newer reliability and backup notes](../OPERATIONS.md) | Full runtime artifacts, daily backup/watchdog arrangement and in-memory restore rehearsal |

**Current position:** code and imported historical data are in GitHub. New runtime data lives in Netlify Blobs and needs its own backup. Both public web projects use Netlify; switching to the old clues page is not protection against a complete Netlify outage. A downloadable recovery pack and a standalone emergency page make the data portable. An independent standby host and DNS cutover remain operator tasks.

## Source map

| Project | Repository | Responsibility |
|---|---|---|
| Self Serve / new clues | [SelfServeClues](https://github.com/licketySplitAUS/SelfServeClues) | React website, solver, history, validation, Admin, backend functions, recovery tools |
| Original public site | [Babble](https://github.com/licketySplitAUS/Babble) | `r46.me`, legacy generated pages, downloads and the public clues routing switch |
| Desktop app | [BabbleExpert](https://github.com/licketySplitAUS/BabbleExpert) | Electron application, side-by-side panes, word transfer, installers and updates |
| Legacy Delphi / SQL Server | Local source, reports and database | Original generator; not all of this is in the three GitHub repositories |

The diagrams are Mermaid diagrams rendered directly by GitHub. They remain editable text in the repository. GitHub documents this format in [Creating diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams).

## Operator recovery preparation

1. In [Admin](https://selfserve.r46.me/history-admin.html), enter the admin key and expand **Backup & recovery**. Download all runtime data and the emergency clues page.
2. Use the [recovery pack instructions](DISASTER-RECOVERY.md#make-a-portable-recovery-pack) to collect source bundles, imported history and the full SQL staging export.
3. Copy the pack to another device or provider. Preserve the secrets in a password manager separately.
4. Keep a native SQL Server `.bak` and the legacy generator if returning to the old system is a requirement.
5. Before relying on outage failover, rehearse serving the emergency page on another host and confirm access to the domain’s DNS controls.

[Back to project README](../README.md)
