# Task system

One file per task, `T-<nnn>.md`, in this directory. The task files are the
swarm's **only shared state**: the orchestrator schedules from them,
implementers treat them as contracts, reviewers audit against them, and every
state change is committed to the integration branch. If it isn't written in a
task file, it didn't happen.

[`INDEX.md`](./INDEX.md) lists every task with phase, status, and
dependencies. Update it in the same commit as any task-state change (it is a
convenience view; the task files win on conflict).

## File format

```markdown
# T-104: Port config store (connections + settings JSON)

- status: open | in_progress | in_review | blocked | done
- phase: 2
- depends_on: [T-101, T-102]
- touches: [src-tauri/crates/verql-config/**, src-tauri/crates/verql-core/src/paths.rs]
- reads: [specs/tauri-migration/subsystems/config-store.md, src/main/config/store.ts]
- risk: low | medium | high   (gates use `—` — their risk is the phase's)
- estimate: S | M | L
- verify.scope: rust | renderer | contract | e2e | none   (one or more;
  `none (<reason>)` is for spike/measurement/sign-off tasks whose Verify
  block checks deliverables rather than code)

## Goal
One paragraph: what exists when this task is done, and what v1 behavior it
preserves.

## Acceptance criteria
- [ ] Numbered, individually checkable statements. Each one is something an
      adversarial reviewer can tick or refute with evidence.

## Verify
```bash
# exact commands the verifier will run, in order
```

## Notes
Constraints, gotchas from the v1 code, links to ADRs.

## Log
(append-only: claims, completion reports, review verdicts, verification
evidence, refutations — each entry timestamped and attributed to a role)
```

### Field semantics

- **status** — the five states and their legal transitions:

  ```
  open → in_progress → in_review → done
            ↑              │
            └── (rejected) ┘        any state → blocked → open
  ```

  Only the orchestrator moves `in_review → done` (after verification) and
  anything → `blocked`. Implementers move `in_progress → in_review`.

- **depends_on** — hard ordering. A task is *ready* only when every
  dependency is `done`. Don't encode soft preferences here; the dispatch
  heuristics in the playbook handle priorities. (`INDEX.md` may abbreviate
  contiguous lists as ranges, `T-201..T-209`; task files always spell out
  the explicit list.)

- **touches** — the exclusive write set, as globs. Two tasks whose `touches`
  intersect never run concurrently. Implementers may not write outside it;
  reviewers reject diffs that do. Keep it as narrow as honestly possible —
  broad `touches` serializes the swarm.

- **reads** — required pre-reading: the subsystem spec, the v1 source being
  ported, relevant ADRs. Implementers must actually read these; the parity
  reviewer will read them regardless.

- **verify** — commands that must pass, runnable from the repo root in the
  candidate worktree. These are executed verbatim by the verifier; if they
  need setup (test DBs up), say so in the block.

- **risk: high** — adds the quality/safety reviewer lens and makes the task
  dispatch early (playbook §dispatch order).

## Splitting and adding tasks

The initial graph is not sacred. When work reveals a task is too big,
mis-scoped, or missing a dependency:

1. The discovering agent writes the observation in the task Log and stops.
2. The **orchestrator** edits the graph: splits the file into new `T-9xx`
   tasks (900-series = tasks added during execution), fixes `depends_on`,
   updates `INDEX.md`, commits with a `swarm: reshape` message explaining why.
3. Nobody else edits another task's definition. Ever.

## Numbering

Tasks are numbered by phase: `T-0xx` phase 0, `T-1xx` phase 1, … `T-9xx`
reserved for tasks created mid-flight. Numbers are stable identifiers, not a
schedule — order comes from `depends_on` + the ready-set heuristics.

## Gate reports

Phase-gate results are committed under [`gate-reports/`](./gate-reports/) as
`phase-<n>-<date>.md` with the full command transcript summary
(see `../orchestration/verification.md`).
