import { context } from '@actions/github';
import { getRepoVisibility } from './context';
import { fetchPermission } from './permissions';

export const ensurePrivateRepo = () => {
  const visibility = getRepoVisibility();

  if (visibility !== 'private') {
    throw new Error(
      `action-agent requires a private repository. Visibility detected: '${visibility}'. Set the repo to private to use this action.`,
    );
  }
};

export const ensureWriteAccess = async (): Promise<void> => {
  const { actor, repo: { owner, repo } } = context;
  const permission = await fetchPermission();

  if (!(["admin", "write", "maintain"].includes(permission))) {
    throw new Error(`Actor '${actor}' must have write access to ${owner}/${repo}. Detected permission: '${permission}'.`);
  }
};
