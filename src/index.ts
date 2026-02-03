import { setFailed } from '@actions/core';
import { bootstrap, runCodex, teardown } from './codex';
import { postComment } from './comment';
import { readInputs } from './input';
import { ensurePermission } from './permissions';
import { buildPrompt } from './prompt';

const main = async (): Promise<void> => {
  const inputs = readInputs();

  try {
    const { apiKey, githubToken, prompt, persistence } = inputs;

    await ensurePermission(githubToken);
    await bootstrap({ apiKey, githubToken, persistence });
    await runCodex(buildPrompt(prompt));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    setFailed(`action-agent failed: ${message}`);

    await postComment(`
action-agent failed:
\`\`\`
${message}
\`\`\`
    `);
  } finally {
    await teardown(inputs.persistence);
  }
};

void main();
