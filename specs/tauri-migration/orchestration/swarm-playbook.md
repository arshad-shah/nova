# Swarm playbook — how to run this migration with Claude Code

This document is the **operating manual for the orchestrator session**: a single
long-running Claude Code session that reads this spec directory, spawns a swarm
of implementer agents in parallel git worktrees, subjects every merge candidate
to adversarial review, and drives the task graph in `../tasks/` to completion.

Read this whole file before spawning anything. The companion protocols are:

- [`worktree-protocol.md`](./worktree-protocol.md) — branches, worktrees, the merge queue
- [`adversarial-review.md`](./adversarial-review.md) — the reviewer swarm and verdict rules
- [`verification.md`](./verification.md) — parity gates and the test matrix
- [`../tasks/README.md`](../tasks/README.md) — task file format, states, claiming rules

## Roles

The swarm has four roles. One session (you, the reader) is the **orchestrator**;
everything else is a subagent you spawn.

| Role | Cardinality | Runs in | Writes code? |
|------|-------------|---------|--------------|
| **Orchestrator** | 1 | main checkout, `v2-tauri` integration branch | merge commits + task-state updates only |
| **Implementer** | many, in parallel | one worktree each, one task each | yes — only files named in its task's `touches` |
| **Adversarial reviewer** | ≥2 per merge candidate | read-only view of the candidate branch | no — verdicts only |
| **Verifier** | 1 per merge candidate + 1 per phase gate | a worktree of the candidate merged onto integration | no — runs builds/tests, reports evidence |

Do not let one agent hold two roles for the same task. The implementer of a
task never reviews or verifies it.

## The loop

The orchestrator runs this loop until every task in `../tasks/` is `done`:

```
1. SYNC      Re-read tasks/INDEX.md and every task file changed since last pass.
2. SELECT    Compute the ready set: tasks whose `depends_on` are all `done`
             and whose status is `open`.
3. DISPATCH  For each ready task (up to the concurrency cap), claim it
             (status → in_progress, record agent id), create a worktree per
             worktree-protocol.md, and spawn an implementer with the
             implementer prompt template below.
4. COLLECT   As implementers finish, each leaves its worktree committed and
             its task status → in_review with a completion report appended
             to the task file.
5. REVIEW    For each in_review task, spawn the adversarial reviewer panel
             (adversarial-review.md). Findings go back to the SAME
             implementer agent (continue it; do not spawn a fresh one) until
             the panel passes or the task is escalated.
6. VERIFY    Passed candidates enter the merge queue (worktree-protocol.md).
             The verifier rebases onto integration, runs the task's
             `verify` commands plus the standing gate, and reports evidence.
7. MERGE     Green candidates merge to the integration branch; the task
             status → done. Red candidates go back to step 5's implementer
             with the failure evidence.
8. GATE      When all tasks of a phase are done, run the phase gate in
             verification.md before dispatching the next phase.
```

### Concurrency

- Default cap: **8 concurrent implementers**. Raise it only if merge-queue
  wait time is consistently zero; lower it if reviewers or the queue back up.
- Never dispatch two in-progress tasks whose `touches` globs intersect.
  Overlap is checked at DISPATCH time, not at merge time — conflicts are
  cheaper to prevent than to resolve.
- Reviewer and verifier agents are cheap and read-only; do not throttle them
  below the implementer count or they become the bottleneck.

### Dispatch order within the ready set

1. Tasks on the **critical path** (most transitive dependents) first.
2. Then tasks marked `risk: high` — surface the unknowns early.
3. Then longest-estimated tasks.
4. Ties: lowest task id.

## Prompt templates

Use these verbatim as the skeleton; splice in the task file contents. Every
spawned agent gets the *task file*, not a paraphrase of it — paraphrase drift
is how swarms diverge from spec.

### Implementer

```
You are an implementer agent in the Verql Electron→Tauri migration swarm.

Your worktree: {worktree_path} on branch {branch}. Work ONLY there.
Your task file is specs/tauri-migration/tasks/{task_id}.md — its full text
follows. It is your contract: the acceptance criteria are the definition of
done, the `touches` list is the ONLY set of paths you may create or modify,
and the `verify` commands must pass locally before you finish.

Before writing code, read the spec documents listed in the task's `reads`
field, and the existing Electron source it names — the migration must
preserve observable behavior unless the task says otherwise.

Rules:
- Do not modify any task file except your own (only its Status/Log section).
- Do not touch the integration branch, other worktrees, or files outside
  `touches`. If you discover the task NEEDS an out-of-scope change, stop and
  report the dependency instead of making it.
- No placeholder/stub code presented as complete. If a criterion cannot be
  met, say so explicitly in your completion report.
- Commit in small, described steps. Final state: all verify commands green,
  working tree clean, completion report appended to the task file's Log.

{task_file_contents}
```

### Adversarial reviewer

See [`adversarial-review.md`](./adversarial-review.md) for the full template
and verdict rules. The short form: the reviewer's job is to **refute** the
claim that the task is complete and correct — it hunts for parity breaks,
unmet acceptance criteria, stubbed logic, and untested paths, and must attach
concrete evidence (file:line, a failing command, a behavioral diff) to every
finding.

### Verifier

```
You are a verifier agent. Merge candidate: branch {branch} for task {task_id}.
In a fresh worktree, rebase the candidate onto {integration_branch}, then run:
1. the task's `verify` commands,
2. the standing gate from specs/tauri-migration/orchestration/verification.md
   for scope {scope}.
Report each command, its exact exit status, and the relevant output excerpt.
You do not fix anything. A verifier that edits code has failed its role.
```

## State, restarts, and long-run hygiene

- **All swarm state lives in the task files.** Status, claims, review
  verdicts, verification evidence — appended to each task's Log section and
  committed to the integration branch. A restarted orchestrator must be able
  to rebuild the entire world from `git log` + `tasks/` alone. No state in
  the orchestrator's memory is authoritative.
- Commit task-state changes to the integration branch **immediately** (one
  commit per state transition is fine; batching a DISPATCH round into one
  commit is also fine).
- If an implementer dies or stalls (no commit in its worktree and no report),
  set the task back to `open`, note the abandonment in its Log, delete the
  worktree, and re-dispatch. Never leave a task `in_progress` with no live
  agent.
- If the same task fails adversarial review **3 times**, stop re-dispatching
  it. Mark it `blocked`, write up what keeps failing, and either split it
  into smaller tasks or escalate to the human. Grinding a swarm against a
  mis-specified task burns the budget and produces merge-queue sludge.
- Periodically (every ~10 merges) run the full phase-gate suite even
  mid-phase. Drift caught early is a one-task fix; drift caught at the gate
  is an archaeology project.

## What the orchestrator must never do

- Write feature code itself. Its diff footprint is merges + task-file state.
- Merge anything that has not been through both adversarial review and
  verification, "because it's small".
- Reinterpret a task's acceptance criteria to make a failing candidate pass.
  Criteria change only by editing the task file in a dedicated, reviewed
  spec-change commit — and that edit is itself logged.
- Let a reviewer finding die silently. Every finding is either fixed,
  refuted-with-evidence in the task Log, or escalated.

## Escalation to the human

Interrupt the run and ask when:
- a phase gate fails for a reason the spec doesn't cover;
- two spec documents contradict each other (log where);
- a task requires a product decision (e.g. dropping a feature) rather than an
  engineering one;
- the Tauri/crate ecosystem has drifted from an ADR's assumption badly enough
  that the ADR's decision looks wrong (see ADR process in `../decisions/`).

Everything else, decide, log the decision in the relevant task file, and keep
moving.
