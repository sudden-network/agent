import { context, getOctokit } from '@actions/github';
import { getIssueNumber } from './context';
import { inputs } from './input';

export const postComment = async (message: string): Promise<void> => {
  const { owner, repo } = context.repo;

  await getOctokit(inputs.githubToken).rest.issues.createComment({
    owner,
    repo,
    issue_number: getIssueNumber(),
    body: message,
  });
};
