# Adversarial review protocol

Every merge candidate in this migration is reviewed by agents whose explicit
job is to **prove the work wrong**. A reviewer that skims a diff and says
"LGTM" has failed its role. The default posture is *refute*: assume the task
is incomplete or incorrect and go looking for the evidence; the candidate
earns a pass only when a genuine hunt comes back empty.

Why adversarial: swarm implementers are optimistic by construction — they
wrote the code, they believe the criteria are met, and a friendly reviewer
inherits that belief. Migration work amplifies the risk because the failure
mode isn't a crash, it's a *silent parity break*: the Rust port compiles, the
happy path works, and some Electron behavior (an error shape, a default, an
event ordering) quietly changed. Only a reviewer hunting for differences
finds those.

## Panel composition

Each `in_review` task gets a panel of **at least two reviewers with distinct
lenses**, spawned in parallel, blind to each other's findings:

| Lens | Hunts for |
|------|-----------|
| **Parity** | behavioral differences vs the Electron source the task ports: outputs, error codes/shapes, defaults, ordering, timing-sensitive behavior, edge cases the old code handled (null/empty/unicode/huge inputs). Reads the OLD code side-by-side with the new. |
| **Contract** | violations of the specs: IPC contract (`../03-ipc-contract.md`), crate boundaries (`../04-rust-workspace.md`), the task's own acceptance criteria taken literally, one at a time. Also: out-of-scope file touches (diff vs `touches`). |
| **Quality/safety** *(add for `risk: high` tasks and anything touching secrets, the keyring, plugin isolation, or query execution)* | unwrap/expect on fallible paths, blocking calls on the async runtime, secrets in logs or config files, SQL/command injection in built statements, panics reachable from IPC input, unbounded memory on large result sets. |

Reviewers are **read-only**. They never fix, never commit, never soften a
finding into a "suggestion" to avoid conflict.

## Reviewer prompt template

```
You are an adversarial reviewer in the Verql Electron→Tauri migration swarm.
Lens: {lens}. Candidate: branch {branch}, task specs/tauri-migration/tasks/{task_id}.md.

Your goal is to REFUTE the claim that this task is complete and correct.
Work through, in order:
1. Each acceptance criterion, literally. Find the code/test that satisfies
   it; if you cannot point to it, that is a finding.
2. The diff vs the task's `touches` list. Any file outside it is a finding.
3. {lens-specific checklist from the table above}
4. The old Electron source this task ports (listed in the task's `reads`).
   Diff the BEHAVIOR, not the code shape.

Every finding needs evidence: file:line, a command that fails, or a concrete
input → divergent output scenario. "This looks wrong" without evidence is
not a finding — either develop it into one or drop it.

Verdict, exactly one of:
- REJECT: one or more findings with evidence. List them, most severe first.
- PASS: you genuinely hunted and found nothing. State what you checked so
  the orchestrator can audit the hunt (files read, commands run, criteria
  ticked). An unsubstantiated PASS is treated as no review.
If you are uncertain whether a finding is real, include it marked
UNCERTAIN — the orchestrator resolves it, not you.
```

## Verdict rules (orchestrator side)

- **Any REJECT ⇒ the candidate fails.** Findings go back to the original
  implementer (continue that agent — it has the context) as a numbered list;
  the implementer must answer every finding with either a fix commit or a
  written refutation in the task Log.
- **UNCERTAIN findings**: the orchestrator spawns a one-shot verifier to
  settle each (run the scenario, check the old behavior). Never resolve an
  UNCERTAIN by judgment call alone when it is checkable by execution.
- **All PASS ⇒ proceed to verification** (`verification.md`). Review passing
  is necessary, not sufficient — verifiers still run the commands.
- A PASS with an empty or vague "what I checked" section is **void**;
  re-spawn that lens.
- Re-review after fixes covers the *whole candidate*, not just the fixed
  lines (fixes regress things; reviewers stay adversarial on round 2+).
- Three REJECT rounds ⇒ the task is `blocked` and escalates per the
  playbook. The failure pattern gets written into the task Log — repeated
  rejection usually means the task or spec is wrong, not the implementer.

## Refutation etiquette

Implementers may push back. A refutation is valid only if it cites evidence
of the same quality demanded of the finding (the old code also did X —
file:line; the criterion says Y, not Z — quote it). The orchestrator
arbitrates; ties go to the reviewer (the conservative outcome is another fix
round, which is cheap; a false PASS is expensive).

## What findings are NOT

To keep the queue moving, these are explicitly out of scope for REJECT
verdicts (log as `note:` lines instead, non-blocking):

- style preferences with no behavioral or maintainability stake;
- "I would have structured this differently" absent a concrete defect;
- scope creep demands — asking the task to do more than its criteria;
- findings against code the task did not touch and was not required to touch
  (file a new task suggestion in the Log instead).
