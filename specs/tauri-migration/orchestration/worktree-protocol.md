# Worktree & branch protocol

Every implementer works in its own **git worktree** on its own branch. The
orchestrator owns the integration branch. Nothing merges except through the
merge queue described here.

## Branches

| Branch | Purpose | Who writes |
|--------|---------|-----------|
| `v2-tauri` | the integration branch for the whole migration | orchestrator only (merges + task-state commits) |
| `v2-tauri/task/<task-id>` | one per task, e.g. `v2-tauri/task/T-104` | that task's implementer only |
| `main` | v1 Electron app, untouched by this effort | nobody in this swarm |

`v2-tauri` is created once, from `main`, at migration start (task T-001).
Task branches are always created **from the current tip of `v2-tauri`** at
dispatch time — never from `main`, never from another task branch.

## Worktree lifecycle

```bash
# DISPATCH (orchestrator, per task)
git branch v2-tauri/task/T-104 v2-tauri
git worktree add ../verql-wt/T-104 v2-tauri/task/T-104

# ... implementer works, commits, finishes ...

# MERGE (orchestrator, after review + verification pass)
git checkout v2-tauri
git merge --no-ff v2-tauri/task/T-104 -m "T-104: <task title>"

# CLEANUP
git worktree remove ../verql-wt/T-104
git branch -d v2-tauri/task/T-104
```

Rules:

- Worktrees live **outside the repo** (a sibling `verql-wt/` directory) so
  they never pollute each other's file watchers, `target/`, or `node_modules`.
- One worktree = one task = one agent. No sharing, no reuse after merge.
- Each worktree needs its own `pnpm install` state and its own Rust `target/`
  dir; set `CARGO_TARGET_DIR` per worktree only if disk is tight, otherwise
  accept the duplication — cross-worktree target sharing causes lock
  contention with 8 parallel builds.
- An implementer that needs a file outside its task's `touches` list does
  **not** reach into another worktree or cherry-pick another branch. It
  reports the missing dependency and stops; the orchestrator fixes the graph.

## The merge queue

Candidates that passed adversarial review queue for merge **one at a time**:

1. Verifier creates a scratch worktree, checks out the candidate, rebases it
   onto the current `v2-tauri` tip (`git rebase v2-tauri`).
2. Rebase conflict? The candidate goes back to its implementer with the
   conflict listing. The implementer rebases in its own worktree and returns
   through re-review *only if the conflict resolution changed its code
   meaningfully* (orchestrator judges from the rebase diff; a trivial
   lockfile/import-order conflict skips re-review, a logic conflict does not).
3. Rebase clean? Run the task's `verify` commands + the standing gate
   ([`verification.md`](./verification.md)) in the scratch worktree.
4. Green ⇒ fast-forward-safe merge to `v2-tauri` (use `--no-ff` to keep task
   boundaries in history), task → `done`, next candidate.
5. Red ⇒ back to the implementer with the exact failing output.

Serializing the queue is deliberate: parallel merges reintroduce the
integration races the worktrees were meant to prevent. The queue is fast
because verification per task is scoped; the *phase gates* are the expensive
runs and they happen between phases.

## Conflict prevention beats conflict resolution

- The task graph's `touches` globs are the primary defense: the orchestrator
  must not dispatch two overlapping tasks concurrently (playbook §concurrency).
- Hot shared files (`Cargo.toml` workspace members list, `tauri.conf.json`,
  the command registry table, `shared/ipc.ts`) are each owned by specific
  tasks; other tasks that "just need one line" in them declare that in
  `touches` and therefore serialize behind the owner. This is intentional
  friction — it forces those files' churn through a small number of tasks.
- Generated files (bindings from `tauri-specta`, lockfiles) are regenerated,
  not merged: on conflict, take either side and rerun the generator/installer,
  then commit the regenerated result.

## Commit hygiene

- Task branches: small commits, imperative subjects, prefixed with the task
  id (`T-104: port config store atomic write`). The final commit of a task
  branch updates the task file's Log with the completion report.
- Integration branch: merge commits titled `T-<id>: <task title>`, plus
  task-state commits titled `swarm: <state change summary>`.
- Never rewrite history on `v2-tauri`. Task branches may be rebased freely
  until merged.
