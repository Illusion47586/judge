# Judge examples

All examples use Jev through Vercel AI Gateway.

## Setup

```sh
cp .env.example .env
```

Add your Vercel AI Gateway key to `.env`:

```dotenv
AI_GATEWAY_API_KEY=your_key_here
```

Run one example with its `npm run example:*` command. For example:

```sh
npm run example:switch
```

Run `npm run typecheck:examples` to compile every example without making remote
requests.

`npm run example:all` executes all nine examples sequentially. It performs nine
remote, potentially billable evaluations.

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
