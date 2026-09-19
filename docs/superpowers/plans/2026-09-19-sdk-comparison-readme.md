# SDK Comparison README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a concise, accurate README comparison that positions Judge against Vercel AI SDK and TypeSafe AI's official Jev JavaScript SDK.

**Architecture:** Add one documentation-only section after `Why Judge`. A six-row Markdown table will distinguish product scope and decision semantics, followed by a compatibility paragraph explaining that Judge can sit above Jev and Vercel AI Gateway rather than replacing either ecosystem.

**Tech Stack:** Markdown, TypeScript API names, repository documentation checks

## Global Constraints

- Keep the tone confident but fair: combine product positioning with guidance on when each option fits.
- Refer to TypeSafe AI's official JavaScript package as `@typesafe-ai/sdk`.
- Distinguish Vercel AI SDK from Vercel AI Gateway.
- Do not imply that Vercel AI SDK lacks typed structured outputs or evaluation support.
- Ground every Judge claim in implemented APIs or tests.
- Modify no runtime code or dependencies.

---

### Task 1: Add and verify the SDK comparison

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-19-sdk-comparison-readme.md`

**Interfaces:**
- Consumes: the existing `JudgeClient` methods `if`, `switch`, `boolean`, `choice`, and `score`; the `mockProvider` export; direct Jev and gateway adapters.
- Produces: a reader-facing `How Judge differs` section with official links and no changes to the package API.

- [x] **Step 1: Insert the comparison after `Why Judge`**

Add this section before `## Quick start`:

```markdown
## How Judge differs

Judge is deliberately narrower than the [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)
and higher-level than TypeSafe AI's official
[Jev JavaScript SDK](https://www.npmjs.com/package/@typesafe-ai/sdk):

| | Judge | Vercel AI SDK | Jev JavaScript SDK |
| --- | --- | --- | --- |
| Primary job | Put bounded semantic decisions inside application control flow | Build AI applications with generation, streaming, tools, agents, and UI integrations | Call Jev's native state-and-questions API directly |
| Model scope | Provider-neutral core; the default client uses Jev through direct or gateway transports | Broad model and provider ecosystem | Jev through TypeSafe AI |
| Result | A validated Boolean, choice, or score decision, or the return value of one selected callback | Generated or evaluated model results for the application to compose | Native typed Jev answers and metadata |
| Control flow | `if()` and `switch()` derive legal outcomes and execute exactly one application-owned callback | General primitives and agent loops; the application defines decision-specific branching | The application maps returned answers to its own branching |
| Uncertainty | Built-in confidence thresholds and an explicit `uncertain` branch | Exposes model results; decision thresholds and fallback policy are application concerns | Returns Jev probabilities and confidence; the application applies policy |
| Testing | Includes a deterministic decision mock and validates provider results before callbacks run | General-purpose model and provider test utilities | Direct Jev client; application-level decision mocks are separate |

Use Vercel AI SDK when you need a broad AI application toolkit. Use the Jev SDK
when you want direct access to Jev's native API. Use Judge when the outcome is a
closed decision that must safely select application-owned behavior. Judge can
use Jev directly or through gateways—including Vercel AI Gateway—so these tools
can be complementary rather than mutually exclusive.
```

- [x] **Step 2: Check formatting and repository claims**

Run:

```bash
git diff --check
rg -n "How Judge differs|Vercel AI SDK|@typesafe-ai/sdk|exactly one|uncertain" README.md
```

Expected: `git diff --check` prints nothing; `rg` finds the new heading, links, control-flow claim, and uncertainty claim along with existing supporting README text.

- [x] **Step 3: Run documentation-relevant project checks**

Run:

```bash
npm run lint
```

Expected: the lint command exits successfully.

- [x] **Step 4: Review the final branch diff**

Run:

```bash
git diff -- README.md docs/superpowers/plans/2026-09-19-sdk-comparison-readme.md
git status --short
```

Expected: only the README comparison and this tracked plan are present, with no runtime or dependency changes.

- [x] **Step 5: Commit the documentation change**

```bash
git add README.md docs/superpowers/plans/2026-09-19-sdk-comparison-readme.md
git commit -m "docs: compare Judge with adjacent SDKs"
```
