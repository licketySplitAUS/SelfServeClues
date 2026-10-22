# Operational reliability

Production credentials belong only to Netlify's production context. Preview notification forwarding is disabled unless explicitly enabled with separate test credentials. Local tests use fixtures.

`HISTORY_BACKUP_KEY` permits read-only recovery exports and backup-health reporting; it is not accepted for game/admin changes. The private `licketySplitAUS/BabbleBackups` repository runs daily backups at 08:23 UTC, preserves validated puzzle checkpoints in Git, retains full runtime artifacts for seven days, and rehearses restoration into memory. A production watchdog at 09:17 UTC alerts the diagnostics channel if no successful backup is recorded for 36 hours. Credentials must remain Netlify/GitHub secrets.

To rehearse a downloaded full backup without production writes:

    node tools/recovery/rehearse.mjs runtime.json.gz

Dependency installs are pinned by package-lock.json. The current upstream `braces` nested-pattern advisory has no patched version in this dependency chain. The reviewed postinstall patch rejects excessive nesting before AST processing and verifies the upstream parser checksum before patching; audit intentionally continues to report the advisory. Development servers bind to loopback. Reassess/remove the patch when upstream provides a fix. Production dependencies have no currently reported advisories.
