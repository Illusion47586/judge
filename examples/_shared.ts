import { createJudge } from "@brkn-labs/judge";
import { vercelGateway } from "@brkn-labs/judge/gateway/vercel";

const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();

if (!apiKey) {
  throw new Error(
    "Set AI_GATEWAY_API_KEY in the repository-root .env file before running examples."
  );
}

export const judge = createJudge({
  gateway: vercelGateway({ apiKey }),
});

export const printResult = (label: string, value: unknown): void => {
  console.log(`\n${label}\n${JSON.stringify(value, null, 2)}`);
};
