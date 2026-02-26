let githubTokenMock: string | undefined = 'token';

jest.mock('./input', () => ({
  inputs: {
    get githubToken() {
      return githubTokenMock;
    },
  },
}));

jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(),
}));

import { getOctokit } from './octokit';
import { getOctokit as actionsGetOctokit } from '@actions/github';

const actionsGetOctokitMock = jest.mocked(actionsGetOctokit);

describe('getOctokit', () => {
  afterEach(() => {
    actionsGetOctokitMock.mockReset();
    githubTokenMock = 'token';
  });

  it('uses the configured github token', () => {
    getOctokit();

    expect(actionsGetOctokitMock).toHaveBeenCalledWith('token');
  });

  it('uses the provided token override', () => {
    getOctokit('override-token');

    expect(actionsGetOctokitMock).toHaveBeenCalledWith('override-token');
  });

  it('throws when supplied token is undefined', () => {
    expect(() => getOctokit(undefined)).toThrow('Missing GitHub token.');
  });

  it('throws when default token is missing', () => {
    githubTokenMock = undefined;

    expect(() => getOctokit()).toThrow('Missing GitHub token.');
  });
});
