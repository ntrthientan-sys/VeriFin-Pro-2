# VeriFin Evidence v2 constitution

## Workflow
- Work on `feature/verifin-rea-evidence-and-byok-gate`, never directly on main.
- Use Git CLI for edits review/commits and SSH for pushes. Use `gh pr create` for PRs.
- Run TypeScript and relevant tests, inspect `git status`/`git diff`, report the diff, then STOP until the user explicitly says **OK** before committing.
- No force push, deleting system branches, or merging main.

## Evidence contract
Inspired by REA's separation of evidence and conclusions, adapted to this financial application; this is not a copy of REA's domain model.
1. Observations: only facts visible in source documents, each with SHA-256 provenance, snippet and page/location when available. Missing is not zero. No invented collateral prices, income, repayment amounts or dates.
2. Derivations: deterministic TypeScript arithmetic only, with input values, formulas, source references and engine version. LLM output cannot populate authoritative derivations.
3. Inferences: explicitly labelled interpretation, referencing observations/derivations; never silently promoted to a fact or approval.
4. Unknowns: BLOCKER/WARNING/INFO; preserve missing/conflicting evidence. Resolving a blocker requires an explicit human decision and a nonempty note. Missing core calculations cannot be waived by a checkbox.

## Fail-closed
- BYOK must pass a real Gemini request on startup before mounting the application. Regex or saved flags are not proof of verification.
- No fallback to a project/system Gemini API key. Each Gemini call uses only the requesting user's key; invalid provider credentials relock the UI.
- Proposal export must evaluate Evidence v2 on the UI and recompute on the server. Invalid/missing input, missing core derivations, or unresolved blockers deny export. Recalculate and clear stale export links whenever evidence or loan terms change.
- Deterministic LTV/DSCR thresholds are policy inputs with documented defaults, not universal banking rules.

## Optimization order
1. Token/paged evidence: extract only observations needed, process documents individually and use page/location pointers. Never resend the full case for each computed metric.
2. SHA-256 IndexedDB cache: schema/model/module/user scoped; validate cache reads and writes, never cache errors or raw keys. Reuse extraction, always recalculate derived values from current terms.
3. Bundle size: use React.lazy/Suspense for heavy independent panels only after correctness and evidence reuse.

## Privacy
- Redact Google keys, Bearer tokens and 12-digit identity numbers from all error logs and returned error messages. Never put keys in URLs, prompts, evidence, telemetry or source control.
- Browser base64 storage is obfuscation, not encryption. Explain the shared-device risk; support session-only storage and deletion.
- Source text and caches contain sensitive financial information: provide a clear-cache control, expire entries, isolate users and clear mounted case state on key changes.
- Keep Firebase client configuration distinct from Gemini credentials. No committed project key; optional Firebase must fail gracefully when not configured.

## Verification
- `npx tsc --noEmit`, `npm test`, and `npm run build`.
- Cover provider failure/quota/timeout, persisted-key revalidation, invalidation, IndexedDB corruption/dedup/isolation, policy boundaries, absent evidence, human resolutions, and direct proposal API bypass attempts.
- Mocked provider tests are not a live-key success claim. Never use real credentials in tests.
