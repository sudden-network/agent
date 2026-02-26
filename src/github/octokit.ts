import { getOctokit as octokit } from '@actions/github';
import { inputs } from './input';

export const getOctokit = (token: string | undefined = inputs.githubToken) => {
  if (token === undefined) {
    throw new Error('Missing GitHub token.');
  }

  return octokit(token);
};
