# Judge examples

All examples use Jev through Vercel AI Gateway.

## Setup

```sh
cp .env.example .env.local
```

Add your Vercel AI Gateway key to `.env.local`:

```dotenv
AI_GATEWAY_API_KEY=your_key_here
```

Run one example with its `npm run example:*` command. For example:

```sh
npm run example:switch
```

Run `npm run typecheck:examples` to compile every example without making remote
requests.

The aggregate runner prefers `.env.local`; `.env` remains supported as a
fallback.

### Run the staggered suite

`npm run example:all` runs all nine examples sequentially. It prefers
`.env.local`, falls back to `.env`, and waits 15 seconds between examples.
Explicit `429` or `rate_limit` failures are retried once after 60 seconds.
Other failures are not retried, and later examples still run.

Override delays when needed:

```sh
JUDGE_EXAMPLE_DELAY_MS=20000 \
JUDGE_EXAMPLE_RETRY_DELAY_MS=90000 \
npm run example:all
```

Every successful attempt is a remote, potentially billable evaluation. A
retry can also be billable if the first response was lost after provider work.
The default successful path takes at least two minutes of intentional waiting.
The command exits non-zero if any example ultimately fails.

## Focused APIs

| File | Command | API |
| --- | --- | --- |
| `01-boolean.ts` | `npm run example:boolean` | `boolean()` |
| `02-if.ts` | `npm run example:if` | `if()` |
| `03-choice.ts` | `npm run example:choice` | `choice()` |
| `04-switch.ts` | `npm run example:switch` | `switch()` |
| `05-score.ts` | `npm run example:score` | `score()` |

## Domain scenarios

| File | Command | Domain |
| --- | --- | --- |
| `06-support-triage.ts` | `npm run example:support` | Customer support |
| `07-transaction-risk.ts` | `npm run example:risk` | Transaction risk |
| `08-incident-escalation.ts` | `npm run example:incident` | Operations |
| `09-agent-tool-routing.ts` | `npm run example:agent` | Agent/tool routing |
