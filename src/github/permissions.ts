import { context, getOctokit } from '@actions/github';
import { inputs } from './input';
import { isNotFoundError } from "./error";

const { actor, repo: { owner, repo } } = context;

const fetchPermission = async (): Promise<string> => {
  const octokit = getOctokit(inputs.githubToken);

  try {
    const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username: actor,
    });

    return data.permission ?? 'none';
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new Error(`Actor '${actor}' is not a collaborator on ${owner}/${repo}; write access is required.`);
    }

    throw new Error(`Failed to verify permissions for '${actor}': ${error instanceof Error ? error.message : 'unknown error'}`);
  }
};

export const ensurePermission = async (): Promise<void> => {
  const permission = await fetchPermission();

  if (!(["admin", "write", "maintain"].includes(permission))) {
    throw new Error(`Actor '${actor}' must have write access to ${owner}/${repo}. Detected permission: '${permission}'.`);
  }
};
