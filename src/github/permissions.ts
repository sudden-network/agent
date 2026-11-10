import { context } from '@actions/github';
import { isNotFoundError } from './error';
import { getOctokit } from './octokit';

export const fetchPermission = async (username = context.actor): Promise<string> => {
  const { repo: { owner, repo } } = context;

  try {
    const { data } = await getOctokit().rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username,
    });

    return data.permission ?? 'none';
  } catch (error) {
    if (isNotFoundError(error)) {
      return 'none';
    }

    throw new Error(`Failed to verify permissions for '${username}': ${error instanceof Error ? error.message : String(error)}`);
  }
};
