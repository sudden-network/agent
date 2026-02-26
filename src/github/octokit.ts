import { getOctokit as octokit } from '@actions/github';
import { inputs } from './input';

export const getOctokit = (...args: [string] | [undefined] | []): ReturnType<typeof octokit> => {
  const [token] = args;

  if (!args.length) return getOctokit(inputs.githubToken);
  if (!token) throw new Error('Missing GitHub token.');

  return octokit(token);
};
