import { getOctokit as octokit } from '@actions/github';
import { inputs } from './input';

export const getOctokit = (...args: [string] | [undefined] | []): ReturnType<typeof octokit> => {
  if (args.length === 0) {
    return getOctokit(inputs.githubToken);
  }

  const [token] = args;

  if (token === undefined) {
    throw new Error('Missing GitHub token.');
  }

  return octokit(token);
};
