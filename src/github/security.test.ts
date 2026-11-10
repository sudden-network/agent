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

import { ensureWriteAccess, fetchTrustedCollaborators, trustedCollaboratorsForEvent } from './security';
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

describe('trustedCollaboratorsForEvent', () => {
  afterEach(() => {
    contextMock.actor = 'octo';
    contextMock.eventName = 'pull_request';
    contextMock.payload = {};
    fetchPermissionMock.mockReset();
  });

  it('leaves non-comment events unchanged', async () => {
    contextMock.eventName = 'pull_request';
    contextMock.payload = {};

    await expect(trustedCollaboratorsForEvent(['octo'])).resolves.toEqual(['octo']);
    expect(fetchPermissionMock).not.toHaveBeenCalled();
  });

  it('trusts an admin comment author omitted from the collaborator list', async () => {
    contextMock.eventName = 'issue_comment';
    contextMock.actor = 'reviewer';
    contextMock.payload = { comment: { user: { login: 'octo' } } };
    fetchPermissionMock.mockResolvedValue('admin');

    await expect(trustedCollaboratorsForEvent(['reviewer'])).resolves.toEqual(['reviewer', 'octo']);
    expect(fetchPermissionMock).toHaveBeenCalledWith('octo');
  });

  it.each(['write', 'maintain'])('trusts a %s comment author already listed', async (permission) => {
    contextMock.eventName = 'issue_comment';
    contextMock.payload = { comment: { user: { login: 'octo' } } };
    fetchPermissionMock.mockResolvedValue(permission);

    await expect(trustedCollaboratorsForEvent(['octo'])).resolves.toEqual(['octo']);
  });

  it.each(['read', 'triage', 'none'])('rejects a %s comment author even if listed', async (permission) => {
    contextMock.eventName = 'pull_request_review_comment';
    contextMock.payload = { comment: { user: { login: 'hubot' } } };
    fetchPermissionMock.mockResolvedValue(permission);

    await expect(trustedCollaboratorsForEvent(['hubot'])).resolves.toBeNull();
  });

  it('rejects missing comment author', async () => {
    contextMock.eventName = 'issue_comment';
    contextMock.payload = { comment: {} };

    await expect(trustedCollaboratorsForEvent(['octo'])).rejects.toThrow('Missing comment author login.');
  });
});
