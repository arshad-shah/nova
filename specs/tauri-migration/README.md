# Verql v2 — Electron → Tauri migration spec

This directory is the **complete, self-contained specification** for
migrating Verql from Electron + Node.js to **Tauri 2.x + a Rust backend**,
written to be executed by an autonomous Claude Code session driving a swarm
of parallel agents in git worktrees, with adversarial review on every merge.

**Status: future work (v2). Nothing outside this directory has been
migrated.** The Electron app on `main` is the live product and the
behavioral oracle for this spec.

## Reading order

| # | Document | What it settles |
|---|---|---|
| 1 | [`00-goals-and-non-goals.md`](./00-goals-and-non-goals.md) | why, what parity means, what is explicitly out of scope, cutover criteria |
| 2 | [`01-current-state-inventory.md`](./01-current-state-inventory.md) | audited ground truth of v1: subsystems, 143 IPC channels, plugins, coupling hotspots, known defects |
| 3 | [`02-target-architecture.md`](./02-target-architecture.md) | the Rust workspace, crate map, v1→v2 mechanism mappings, concurrency + error model |
| 4 | [`03-migration-strategy.md`](./03-migration-strategy.md) | the strangler approach, 7 phases with exit criteria, risk front-loading |
| 5 | [`04-ipc-and-events-contract.md`](./04-ipc-and-events-contract.md) | the frozen IPC contract, bridge shim, dispatch design, type/serde rules, event parity |
| 6 | [`decisions/`](./decisions/README.md) | 8 ADRs — the choices the swarm must not re-litigate (and how to amend them when reality disagrees) |
| 7 | [`subsystems/`](./subsystems/README.md) | one deep spec per subsystem being ported — the implementer's contract detail |
| 8 | [`orchestration/`](./orchestration/swarm-playbook.md) | **how to run the swarm**: playbook, worktree protocol, adversarial review, verification |
| 9 | [`tasks/`](./tasks/README.md) | the executable task graph: format, [INDEX](./tasks/INDEX.md), ~60 task files across phases 0–6 |

## How to run this migration (the kickoff prompt)

Start a Claude Code session at the repo root on a machine with: pnpm + the
repo bootstrapped, a Rust toolchain, Docker (for `scripts/test-dbs.sh`), and
the platform you care about most. Then:

> Read `specs/tauri-migration/README.md` and everything it links, in the
> reading order given. You are the **orchestrator** defined in
> `specs/tauri-migration/orchestration/swarm-playbook.md`. Execute the task
> graph in `specs/tauri-migration/tasks/INDEX.md` starting from Phase 0,
> following the worktree protocol, adversarial-review protocol, and
> verification requirements exactly. T-001 is a human touchpoint: present
> the ADRs to me for ratification before dispatching anything else.

The session is expected to be long-lived and restartable: all swarm state
lives in the task files and git history (playbook §state). A fresh session
resumes by re-reading `tasks/INDEX.md` + `git log` on the integration
branch.

### Invariants for every agent in the swarm

1. **v1 is read-only reference** until the Phase-6 deletion task. Never
   destabilize `main`.
2. **The IPC contract is frozen** (`04-ipc-and-events-contract.md`
   §freeze). The renderer is not redesigned.
3. **Parity is proven, not claimed** — golden fixtures and the seeded test
   DBs, per `orchestration/verification.md`.
4. **Stay inside your task's `touches`.** Out-of-scope discoveries are
   reported, not fixed.
5. **Everything is logged in the task files.** If it isn't written there,
   it didn't happen.

## Relationship to the rest of the repo

- `docs/` describes **v1** and remains authoritative for the Electron app
  until the Phase-6 docs task rewrites it.
- `shared/` is the contract source of truth for **both** stacks throughout.
- This directory is self-contained on purpose: specs here restate what they
  need from `docs/` so the swarm doesn't depend on v1 docs staying frozen —
  but when a spec and the v1 *code* disagree, the code wins and the spec
  gets a logged correction.

## Maintenance

This spec was authored against `main` at v1.5.0 (July 2026), with the
ecosystem claims researched and source-verified on 2026-07-16
([`decisions/versions-baseline.md`](./decisions/versions-baseline.md)).
Phase 0's T-002 re-verifies that baseline for drift and amends ADRs before
any porting begins. If v1 gains
features between now and execution, re-run the inventory sweep
(`01-current-state-inventory.md` cites its sources) and extend the task
graph via the 900-series process in `tasks/README.md`.
