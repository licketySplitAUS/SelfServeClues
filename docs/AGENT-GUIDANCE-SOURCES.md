# Public AGENTS.md research and adaptations

Reviewed 29 October 2026 for the Babble, BabbleExpert and SelfServeClues agent guides. This is an optional cross-project research record, not instructions to fetch these sites before routine work. External files were treated as reference material, not adopted as authority over the maintainer's instructions.

## Selection method

There is no established file-level rating in the sources inspected. GitHub repository stars indicate project popularity, not whether an AGENTS.md improves outcomes. I used stars to find established projects, then compared the actual file, maintenance recency, relevance to this workspace, and whether an instruction could prevent a concrete failure. This is a reasoned selection, not a benchmark or proof of a global best file.

Star counts below came from GitHub's repository API on the review date. File links are pinned to the most recent file-changing commit returned by the commits API, so the examples remain reviewable when branches change.

| Primary example | Repository stars at review | Useful pattern and local adaptation |
| --- | ---: | --- |
| [Next.js AGENTS.md](https://github.com/vercel/next.js/blob/8b59e7dd78603d4146e3393509a60a6664245f3f/AGENTS.md) | 143,195 | Focus investigation on relevant symbols, inspect saved failure output, combine related edits before rebuilding, and wait for conditions rather than relying on fixed delays. Applied to iteration/testing guidance without importing Next.js commands or mandatory watch processes. |
| [Playwright AGENTS.md](https://github.com/microsoft/playwright/blob/2c6885b34e37e1edb9c8c5cc1b5d83b439c60fec/AGENTS.md) | 98,784 | Expand an appropriate existing test and cover meaningful scenarios rather than proliferating combinations. Keep client/server boundaries explicit. Applied to all three guides and SelfServeClues shared-runtime/type contracts. |
| [Grafana AGENTS.md](https://github.com/grafana/grafana/blob/e3708d794f9ad4fdb11c98de5378168c9c8636e8/AGENTS.md) | 77,583 | Explain surprising constraints in comments; make asynchronous tests controllable; preserve compatibility across independently deployed components. Applied to comments/testing and the existing desktop/website separation. |
| [TanStack Query AGENTS.md](https://github.com/TanStack/query/blob/9f350003562437899c00443246df27a14d6ffa5e/AGENTS.md) | 50,497 | A small entry file can point to maintained, detailed guidance instead of duplicating it. Retained the concise root plus task-specific implementation references; did not add another always-read handbook. |
| [NextDNS AGENTS.md](https://github.com/nextdns/nextdns/blob/39d631917d2fdaf7a87a326fcc2f4faedca26c1d/AGENTS.md) | 4,234 | A smaller but relevant example for low-resource clients: consider dependency footprint, startup/lifecycle cost and failure paths. Adapted to Expert installer/memory/startup, Functions bundle/cold-start cost and public-page payloads. |

Two first-party guides supplied additional checks:

- [OpenAI: scoped code-review rules](https://developers.openai.com/blog/custom-code-review-rules-for-codex): make integration constraints visible during reviews. Each root now has a Code Review Rules section using Babble's actual contracts, with findings tied to concrete scenarios and file/line evidence.
- [OpenAI: revisiting prompts and instruction files](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra): limit unconditional context and apply guidance only where relevant. Kept detailed references conditional and every root under 800 words after editing.

## What changed

All three roots now emphasize focused investigation, reusing diagnostic output, batching related edits, expanding suitable tests, explaining non-obvious reasons, and evaluating dependency cost. Existing compatibility rules now double as focused code-review criteria. Expert and SelfServeClues references add behavioural regression/deterministic-testing guidance; SelfServeClues also identifies the need to maintain shared JavaScript declarations with implementation changes.

These additions complement the source-backed project guidance. They do not replace the projects' commands, introduce test frameworks, require a new approval round for routine work, or change deployment authorization.

## What was deliberately excluded

- Generic template popularity and unsupported claims of token savings were not treated as effectiveness measurements.
- Language/framework-specific commands, organization membership rules, automatic Git actions, blanket approval gates and universal full-suite requirements were not copied.
- This workspace does not gain pnpm, Playwright, Go, lint tools or mandatory background servers merely because another repository uses them.
- A cached search result for OpenAI Codex's root file was not used as a current example after both direct and contents-API requests returned 404. The fetched official review guidance was used instead.
- Existing project instructions already covered isolation, compatibility, backups and consent; redundant copies of those rules were avoided. Future additions should address a demonstrated repository-specific mistake and replace obsolete guidance rather than steadily lengthening the roots.

No performance improvement has been measured from these edits. Validate their usefulness through actual tasks, retaining rules that prevent mistakes and removing those that add friction without benefit.

## Follow-up: articles and empirical research

The second search focused on authors explaining or measuring instruction files, rather than collecting more templates. Reviewed 29 October 2026.

| Article / primary research | Finding worth retaining | Effect on these guides |
| --- | --- | --- |
| [GitHub: lessons from over 2,500 repositories](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/) | Put working commands prominently; give concrete, scoped instructions. Its examples largely concern specialized Copilot agent profiles, so the frontmatter/persona setup is not a requirement for a root AGENTS.md. | Moved Commands and checks directly after Scope and priorities in all three roots. Kept existing commands; imported no new tools or personas. |
| [Agentic AI Foundation: Writing an effective AGENTS.md](https://aaif.io/blog/writing-an-effective-agents-md) | Useful instructions change an agent's decision: name the exception, owner, alternative action and appropriate verification. Avoid duplicate sources of guidance and define completion. | Preserved the project-specific traps and added final-change inspection, including new files, to catch scope drift or missing companion outputs. Existing focused verification maps already address the article's validation advice. |
| [Antoine van der Lee: writing instructions agents follow](https://aifundamentals.dev/articles/how-to-write-agents-md/) | Keep occasional workflows in conditional references. Important constraints need executable checks rather than prose alone; maintain the file rather than accumulating session notes. | Added a short maintenance rule: update guidance alongside changed commands/contracts and remove superseded rules. No new hook/linter is installed by this documentation task. |
| [Gloaguen et al.: Evaluating AGENTS.md](https://arxiv.org/html/2602.11988v1) | In the tested Python issue-solving settings, context files increased exploration/testing and cost; there was no significant overall success improvement. Redundant overviews did not speed relevant-file discovery. | Avoided expanding the roots with more architecture explanation, mandatory reading or full-suite rituals. This does not establish that Babble's non-obvious compatibility guidance is useless. |
| [Lulla et al.: efficiency impact](https://arxiv.org/html/2601.20404v2) | A paired study of 124 PR tasks across 10 repositories reported lower median runtime/output-token use with context files. Efficiency and comprehensive patch correctness are distinct outcomes. | Recorded the counter-evidence rather than claiming all context files hurt or help. Neither paper supplies a measured speedup for these projects or establishes an optimal word count. |
| [Santos et al.: Configuration Smells](https://arxiv.org/html/2606.15828v5) | Catalogues instruction duplication of tooling, overly broad context, task-specific material and conflicting directions in 100 repositories. This is a descriptive study, not a controlled performance result. | Checked for conflicting directions and duplicate style/tool rules. Retained conditional references instead of adding generic tutorials; no additional permanent rule was needed for every listed smell. |

The incremental changes are deliberately small. The earlier 800-word limit is a local editing budget, not a scientific threshold. If a future instruction makes no difference to a recurring decision, remove it or move it to task-specific documentation. Put mechanically enforceable policy in the appropriate existing check when implementing that policy, rather than repeating its full specification in prose.

For a future effectiveness comparison, use representative tasks, the same starting commits/model/settings, and independent outcome checks; compare correctness, avoidable tool work and completion cost separately. No such experiment was run here, and the papers' results are not a substitute for one.
