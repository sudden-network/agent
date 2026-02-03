import { setFailed } from '@actions/core';
import { bootstrap, runCodex, teardown } from './codex';
import { postComment } from './comment';
import { readInputs } from './input';
import { ensurePermission } from './permissions';
import { prompt } from "./prompt";

const main = async (): Promise<void> => {
  try {
    const { apiKey, githubToken } = readInputs();

    await ensurePermission(githubToken);
    await bootstrap({ apiKey, githubToken });
    await runCodex(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await postComment(`
action-agent failed:
\`\`\`
${message}
\`\`\`
    `);

    setFailed(`action-agent failed: ${message}`);
  } finally {
    await teardown();
  }
};

void main();
