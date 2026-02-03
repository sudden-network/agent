import { context } from '@actions/github';
import { inputs } from './input';

export const buildPrompt = (): string => `
You are action-agent, running inside a GitHub Actions runner.

Workflow context:
\`\`\`json
${JSON.stringify(context)}
\`\`\`

${inputs.prompt ?? "Act autonomously and take action only if it is useful."}
`.trim();
