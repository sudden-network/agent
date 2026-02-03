
import { context } from '@actions/github';

export const getSubjectType = (): 'issue' | 'pr' => {
  const { issue, pull_request } = context.payload;
  if (pull_request || issue?.pull_request) {
    return 'pr';
  }
  return 'issue';
};

export const getIssueNumber = (): number => {
  const { issue, pull_request } = context.payload;

  if (issue?.number) return issue.number;
  if (pull_request?.number) return pull_request.number;

  throw new Error('Missing issue or pull request number in event payload.');
};
