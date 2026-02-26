import fs from 'fs';
import path from 'path';
import { inputs } from './github/input';
const PROMPT_TEMPLATE = fs.readFileSync(path.join(__dirname, 'PROMPT.md'), 'utf8');
const PROMPT_RESUME_TEMPLATE = fs.readFileSync(path.join(__dirname, 'PROMPT_RESUME.md'), 'utf8');
const { GITHUB_EVENT_PATH } = process.env;

export const buildPrompt = ({
  resumed,
  trustedCollaborators,
  tokenActor,
}: {
  resumed: boolean;
  trustedCollaborators: string[];
  tokenActor: string;
}): string => {
  if (!GITHUB_EVENT_PATH) throw new Error('Missing `GITHUB_EVENT_PATH`.');

  if (resumed) {
    return PROMPT_RESUME_TEMPLATE
      .replace('{{github_event_path}}', GITHUB_EVENT_PATH)
      .trim();
  }

  const githubAccessInstructions = inputs.pseudo
    ? [
        '- Pseudo mode is enabled.',
        '- GitHub CLI is available; use `gh` for all GitHub operations.',
        '- The MCP server is disabled; do not use `github.octokit_request`.',
        '- You have write access to the local checkout and network access.',
        '- Run shell commands directly without asking for approval.',
      ].join('\n')
    : [
        '- GitHub access is available via the MCP server named `github`.',
        '- The GitHub CLI is not usable here.',
        '- Use `github.octokit_request` for all GitHub operations (comments, reactions, file updates, PRs, inline replies, etc).',
        '- You cannot write to the local checkout; to update repo files (commits/branches/PRs), use GitHub MCP via `github.octokit_request`.',
        '- To update a PR branch that is behind its base, use the `update-branch` API via `github.octokit_request`.',
      ].join('\n');

  return PROMPT_TEMPLATE
    .replace('{{trusted_collaborators}}', trustedCollaborators.map((collaborator) => `- @${collaborator}`).join('\n'))
    .replace('{{github_event_path}}', GITHUB_EVENT_PATH)
    .replace('{{extra_prompt}}', inputs.prompt ?? '')
    .replace('{{github_access_instructions}}', githubAccessInstructions)
    .replace('{{token_actor}}', tokenActor)
    .trim();
};
