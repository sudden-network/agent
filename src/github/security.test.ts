const contextMock = {
  actor: 'octo',
  repo: { owner: 'octo', repo: 'sudden-agent' },
  eventName: 'pull_request',
  payload: {},
};

jest.mock('@actions/github', () => ({ context: contextMock }));

jest.mock('./permissions', () => ({
  fetchPermission: jest.fn(),
}));

jest.mock('./octokit', () => ({
  getOctokit: jest.fn(),
}));

import { ensureWriteAccess, fetchTrustedCollaborators, isTrustedCommentAuthor } from './security';
import { fetchPermission } from './permissions';
import { getOctokit } from './octokit';

const fetchPermissionMock = jest.mocked(fetchPermission);
const getOctokitMock = jest.mocked(getOctokit);

describe('ensureWriteAccess', () => {
  afterEach(() => {
    fetchPermissionMock.mockReset();
    contextMock.actor = 'octo';
  });

  it('skips permission checks for bot actors', async () => {
    contextMock.actor = 'sudden-agent[bot]';

    await expect(ensureWriteAccess()).resolves.toBeUndefined();
    expect(fetchPermissionMock).not.toHaveBeenCalled();
  });

  it('allows write access', async () => {
    fetchPermissionMock.mockResolvedValue('write');

    await expect(ensureWriteAccess()).resolves.toBeUndefined();
  });

  it('rejects non-write access', async () => {
    fetchPermissionMock.mockResolvedValue('read');

    await expect(ensureWriteAccess()).rejects.toThrow('must have write access');
  });
});

describe('fetchTrustedCollaborators', () => {
  afterEach(() => {
    getOctokitMock.mockReset();
  });

  it('returns collaborators with role names', async () => {
    const listCollaboratorsMock = jest.fn();
    const paginateMock = jest.fn().mockResolvedValue([
      { login: 'octo', role_name: 'admin' },
      { login: 'hubot', role_name: 'read' },
    ]);

    getOctokitMock.mockReturnValue({
      rest: { repos: { listCollaborators: listCollaboratorsMock } },
      paginate: paginateMock,
    } as unknown as ReturnType<typeof getOctokit>);

    const result = await fetchTrustedCollaborators();

    expect(paginateMock).toHaveBeenCalledWith(
      listCollaboratorsMock,
      { owner: 'octo', repo: 'sudden-agent', permission: 'push', per_page: 100 },
    );
    expect(result).toEqual(['octo', 'hubot']);
  });
});

describe('isTrustedCommentAuthor', () => {
  afterEach(() => {
    contextMock.eventName = 'pull_request';
    contextMock.payload = {};
  });

  it('allows non-comment events', () => {
    contextMock.eventName = 'pull_request';
    contextMock.payload = {};

    expect(isTrustedCommentAuthor(['octo'])).toBe(true);
  });

  it('allows trusted comment authors', () => {
    contextMock.eventName = 'issue_comment';
    contextMock.payload = { comment: { user: { login: 'octo' } } };

    expect(isTrustedCommentAuthor(['octo', 'hubot'])).toBe(true);
  });

  it('rejects untrusted comment authors', () => {
    contextMock.eventName = 'pull_request_review_comment';
    contextMock.payload = { comment: { user: { login: 'hubot' } } };

    expect(isTrustedCommentAuthor(['octo'])).toBe(false);
  });

  it('rejects missing comment author', () => {
    contextMock.eventName = 'issue_comment';
    contextMock.payload = { comment: {} };

    expect(() => isTrustedCommentAuthor(['octo'])).toThrow('Missing comment author login.');
  });
});
