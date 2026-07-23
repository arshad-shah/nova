---
---

Tests only: add an architecture guard that pins the "no special-cased built-in
drivers in `src/main/db/`" invariant. `createAdapter` is now covered
behaviourally (it constructs whatever the `DriverRegistry` holds for a profile
type and errors cleanly when none is registered) and statically (no file under
`src/main/db/` may branch on a known driver name or import a bundled-driver
implementation). The rationale is documented beside the code in `factory.ts`.
No shipped behaviour changes.
