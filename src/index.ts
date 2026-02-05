import { setFailed } from '@actions/core';
import { bootstrap, runCodex, teardown } from './codex';
import { postErrorComment } from './github/comment';
import { isIssueOrPullRequest } from './github/context';
import { buildPrompt } from './prompt';
import { ensurePrivateRepo, ensureWriteAccess } from "./github/security";

const main = async () => {
  try {
    ensurePrivateRepo();
    await ensureWriteAccess();
    await bootstrap();
    await runCodex(buildPrompt());
    await teardown();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    setFailed(`action-agent failed: ${message}`);

    if (isIssueOrPullRequest()) {
      await postErrorComment();
    }
  }
};

void main();
