# Akodo Roadmap

> Ship software you can trust.

Akodo is not an editor or a multi-agent chat launcher. It is the control and verification layer between a developer's intent and agent-generated software that is ready to review.

## Product principles

- The first-class object is an **Outcome**, not a file, conversation, or agent.
- The user defines the goal, constraints, and acceptance criteria; Akodo manages execution.
- Agents are implementation details. Akodo chooses and coordinates them behind the outcome.
- The implementer does not decide whether its own work is complete.
- Validation is derived independently from the specification and produces inspectable evidence.
- Failed validation returns the work to an agent for another attempt.
- An outcome becomes ready to review only after its required checks pass.
- The local runtime stays useful with bring-your-own agents and credentials.

## V1 success criteria

The first release must demonstrate one workflow exceptionally well:

```text
Outcome + acceptance criteria
  -> isolated Git worktree
  -> coding agent implementation
  -> independent validation
  -> automatic fix and retry on failure
  -> evidence-backed Ready to review state
```

The product is useful when a developer can start an outcome, leave it running, and return to a trustworthy explanation of what changed, what was tested, what failed, what was fixed, and what still needs human judgment.

## Phase 0 — Reframe the current prototype

- [x] Electron + React + TypeScript desktop scaffold
- [x] Basic agent/chat prototype
- [x] Local message queue and persistence prototype
- [x] Initial settings and agent management UI
- [x] Replace agent-first navigation with an Outcomes list
- [x] Rename task-domain concepts to Outcome where they represent user intent
- [x] Add outcome states: Draft, Planning, Working, Validating, Fixing, Needs input, Ready to review, Failed
- [x] Create a new-outcome flow for goal, constraints, and acceptance criteria
- [x] Move conversations and agent runs inside the outcome detail view
- [x] Show agents as execution details instead of top-level workspace objects
- [x] Replace mock completion behavior in the current orchestrator with persisted lifecycle events

## Phase 1 — Local outcome runtime

### Projects and persistence

- [ ] Select and register a local Git repository
- [ ] Move durable business state out of React/localStorage and into the Electron main process
- [ ] Add SQLite persistence for projects, outcomes, acceptance criteria, runs, events, worktrees, validation runs, artifacts, and provider usage
- [ ] Keep Zustand limited to ephemeral UI state
- [ ] Resume and reconstruct in-progress outcomes after an app restart

### Unified agent adapters

- [ ] Define an `AgentAdapter` interface for start, stream, continue, cancel, and status
- [ ] Define normalized events: started, output, tool call, file changed, blocked, completed, and failed
- [ ] Implement Claude Code first as the reference adapter
- [ ] Implement Codex adapter
- [ ] Implement OpenCode adapter
- [ ] Detect installed agent CLIs and explain missing setup clearly
- [ ] Stream agent activity into the outcome timeline
- [ ] Support cancellation and recovery from crashed or interrupted runs

### Git isolation

- [ ] Create one Git worktree and branch per outcome
- [ ] Run every agent inside the assigned worktree
- [ ] Track changed files and commits for the outcome
- [ ] Display the diff without building a full editor
- [ ] Detect dirty repositories, branch conflicts, and unsafe cleanup conditions
- [ ] Provide explicit, recoverable worktree cleanup

## Phase 2 — Independent validation loop

### Specification and validation planning

- [ ] Turn the outcome description into explicit, user-editable acceptance criteria
- [ ] Generate a validation plan independently from the implementation agent
- [ ] Map every required acceptance criterion to one or more validation checks
- [ ] Preserve the original goal and constraints across retries
- [ ] Allow repository-specific validation commands and policies

### Validation engine

- [ ] Run configured build, typecheck, lint, and test commands
- [ ] Capture exit status, duration, logs, and relevant artifacts for every check
- [ ] Prevent the implementation agent from marking its own work as validated
- [ ] Produce structured pass/fail results tied to acceptance criteria
- [ ] Add timeout, cancellation, and process cleanup
- [ ] Add browser validation after command-based validation is reliable
- [ ] Add independent code and security review after the core loop is reliable

### Automatic repair

- [ ] Convert failed checks into focused repair instructions
- [ ] Send failures and evidence back to an implementation agent
- [ ] Re-run the full required validation set after each repair
- [ ] Add configurable retry limits and stop conditions
- [ ] Escalate genuine product decisions as Needs input instead of guessing
- [ ] Preserve the complete attempt and validation history

## Phase 3 — Evidence-first review experience

- [ ] Build the outcome detail view around Goal, Acceptance criteria, Implementation, Validation, Evidence, and Diff
- [ ] Show exactly which acceptance criteria are proven, failed, or unverified
- [ ] Show validation logs, test counts, screenshots, review findings, attempts, time, and cost
- [ ] Explain why an outcome is Ready to review or why it is blocked
- [ ] Make human approval explicit; do not equate validation with automatic merge
- [ ] Add a dashboard for completed, active, failed, and needs-input outcomes
- [ ] Add filters and notifications that prioritize decisions over raw agent activity

## Phase 4 — GitHub delivery

- [ ] Connect a GitHub repository after the local workflow is dependable
- [ ] Push an outcome branch only with explicit user approval
- [ ] Create a pull request containing the outcome summary and validation evidence
- [ ] Track CI checks and feed failures back into the repair loop
- [ ] Reconcile local validation with GitHub CI results
- [ ] Add preview deployment evidence where the repository supports it

## Phase 5 — Smarter orchestration

- [ ] Record task category, agent, model, strategy, attempts, success, cost, time, and human acceptance
- [ ] Compare agent performance by task and repository type
- [ ] Recommend or automatically choose an agent using Fast, Balanced, and Best modes
- [ ] Route implementation and validation to independent agents where useful
- [ ] Add controlled parallel execution only after the single-outcome loop is reliable
- [ ] Learn repository-specific risk signals and validation requirements

## Later — Cloud and teams

- [ ] Remote and persistent workers
- [ ] Cross-device sync and remote monitoring
- [ ] Shared outcomes, workflows, validation policies, and evidence
- [ ] Team permissions, audit logs, cost controls, and analytics
- [ ] Central MCP credential and permission governance
- [ ] Self-hosted runners and private model endpoints
- [ ] Issue tracker, CI/CD, and deployment integrations beyond GitHub

## Explicitly not in the MVP

- A VS Code or Cursor replacement
- A full code editor, language server, debugger, or extension ecosystem
- A general multi-provider API chat application
- A visual pipeline builder
- User-authored multi-agent graphs and manual subagent wiring
- A generic plugin marketplace
- Cloud sync, collaboration, and enterprise administration
- Automatic merges or production deployments
- Broad MCP support before the core outcome and validation loop works
- Cross-platform polish and auto-update infrastructure before product validation

## MVP release gate

- [ ] A user can open a local repository and define an outcome with acceptance criteria
- [ ] Akodo creates an isolated worktree and runs Claude Code through `AgentAdapter`
- [ ] Akodo independently runs the repository's required validation checks
- [ ] At least one real validation failure can trigger an automatic repair and successful retry
- [ ] The final view contains the diff, attempt history, validation evidence, time, and cost
- [ ] Akodo never reports Ready to review while a required criterion is failed or unverified
- [ ] A developer can complete the workflow without babysitting a terminal session
- [ ] The workflow is tested with real repositories by at least 20 recurring users

## Positioning guardrail

If a roadmap item does not strengthen the path from **intent** to **independently verified outcome**, it is not a V1 priority.
