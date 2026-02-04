import { warning } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { getIssueNumber } from './context';
import { inputs } from './input';
import { isPermissionError } from './error';

export const postComment = async (comment: string) => {
  const { owner, repo } = context.repo;

  try {
    await getOctokit(inputs.githubToken).rest.issues.createComment({
      owner,
      repo,
      issue_number: getIssueNumber(),
      body: comment,
    });
  } catch (error) {
    if (isPermissionError(error)) {
      warning('Attempted to post a comment but the workflow lacks `issues: write` permission.');
      return;
    }
    throw error;
  }
};

export const postErrorComment = async () => {
  const { serverUrl, runId } = context;
  const { owner, repo } = context.repo;
  const runUrl = `${serverUrl}/${owner}/${repo}/actions/runs/${runId}`;

  await postComment(`action-agent failed, see workflow run: ${runUrl}`);
};
