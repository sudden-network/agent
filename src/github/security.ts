import { context } from '@actions/github';
import { fetchPermission } from './permissions';
import { getOctokit } from './octokit';

const WRITE_PERMISSIONS = new Set(['admin', 'write', 'maintain']);

export const trustedCollaboratorsForEvent = async (trustedCollaborators: string[]): Promise<string[] | null> => {
  if (!(['issue_comment', 'pull_request_review_comment'].includes(context.eventName))) return trustedCollaborators;

  const author = context.payload.comment?.user?.login;

  if (!author) {
    throw new Error('Missing comment author login.');
  }

  if (!WRITE_PERMISSIONS.has(await fetchPermission(author))) return null;

  return trustedCollaborators.includes(author)
    ? trustedCollaborators
    : [...trustedCollaborators, author];
};

export const ensureWriteAccess = async (): Promise<void> => {
  const { actor, repo: { owner, repo } } = context;

  if (actor.endsWith('[bot]')) return;

  const permission = await fetchPermission();

  if (!WRITE_PERMISSIONS.has(permission)) {
    throw new Error(`Actor '${actor}' must have write access to ${owner}/${repo}. Detected permission: '${permission}'.`);
  }
};

export const fetchTrustedCollaborators = async (): Promise<string[]> => {
  const { repo: { owner, repo } } = context;
  const octokit = getOctokit();

  try {
    const collaborators: Array<{ login: string }> = await octokit.paginate(
      octokit.rest.repos.listCollaborators,
      {
        owner,
        repo,
        permission: "push",
        per_page: 100,
      },
    );

    return collaborators.map((collaborator) => collaborator.login);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list trusted collaborators for ${owner}/${repo}: ${message}`);
  }
};
