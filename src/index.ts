import { info, setFailed } from '@actions/core';
import { getAgent } from './agents';
import { postErrorComment } from './github/comment';
import { isIssueOrPullRequest } from './github/context';
import { githubMcpServer } from './github/mcp';
import { buildPrompt } from './prompt';
import { resolveTokenActor } from './github/identity';
import { fetchTrustedCollaborators, ensureWriteAccess, isTrustedCommentAuthor } from './github/security';

const main = async () => {
  try {
    const [trustedCollaborators, tokenActor, agent] = await Promise.all([
      fetchTrustedCollaborators(),
      resolveTokenActor(),
      getAgent(),
      ensureWriteAccess(),
    ]);

    if (!isTrustedCommentAuthor(trustedCollaborators)) {
      return info('Skipping run: comment author is not trusted.');
    }

    try {
      const { resumed } = await agent.bootstrap({
        mcpServers: [await githubMcpServer.start()]
      });

      await agent.run(buildPrompt({ resumed, trustedCollaborators, tokenActor }));
    } finally {
      await Promise.allSettled([
        githubMcpServer.stop(),
        agent.teardown()
      ]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    setFailed(`sudden-agent failed: ${message}`);

    if (isIssueOrPullRequest()) {
      await postErrorComment();
    }
  }
};

void main();
