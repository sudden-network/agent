const contextMock = {
  repo: { owner: 'octo', repo: 'sudden-agent' },
  serverUrl: 'https://github.com',
  runId: 1234,
  payload: { issue: { number: 32 } },
};

const workflowGithubTokenMock = 'workflow-token';

jest.mock('@actions/github', () => ({ context: contextMock }));

jest.mock('./input', () => ({
  inputs: {
    get workflowGithubToken() {
      return workflowGithubTokenMock;
    },
  },
}));

jest.mock('./octokit', () => ({
  getOctokit: jest.fn(),
}));

import { postErrorComment } from './comment';
import { getOctokit } from './octokit';

const getOctokitMock = jest.mocked(getOctokit);

describe('postErrorComment', () => {
  afterEach(() => {
    getOctokitMock.mockReset();
  });

  it('posts with the workflow token to avoid comment-trigger loops', async () => {
    const createCommentMock = jest.fn().mockResolvedValue(undefined);

    getOctokitMock.mockReturnValue({
      rest: { issues: { createComment: createCommentMock } },
    } as unknown as ReturnType<typeof getOctokit>);

    await postErrorComment();

    expect(getOctokitMock).toHaveBeenCalledWith(workflowGithubTokenMock);
    expect(createCommentMock).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'sudden-agent',
      issue_number: 32,
      body: 'sudden-agent failed, see workflow run: https://github.com/octo/sudden-agent/actions/runs/1234',
    });
  });
});
