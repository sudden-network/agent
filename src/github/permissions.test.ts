const contextMock = {
  actor: 'octo',
  repo: { owner: 'octo', repo: 'sudden-agent' },
};

jest.mock('@actions/github', () => ({ context: contextMock }));

jest.mock('./octokit', () => ({
  getOctokit: jest.fn(),
}));

import { getOctokit } from './octokit';
import { fetchPermission } from './permissions';

const getOctokitMock = jest.mocked(getOctokit);

describe('fetchPermission', () => {
  afterEach(() => {
    getOctokitMock.mockReset();
  });

  it('checks the explicit comment author instead of the event actor', async () => {
    const getCollaboratorPermissionLevelMock = jest.fn().mockResolvedValue({
      data: { permission: 'admin' },
    });
    getOctokitMock.mockReturnValue({
      rest: { repos: { getCollaboratorPermissionLevel: getCollaboratorPermissionLevelMock } },
    } as unknown as ReturnType<typeof getOctokit>);

    await expect(fetchPermission('reviewer')).resolves.toBe('admin');
    expect(getCollaboratorPermissionLevelMock).toHaveBeenCalledWith({
      owner: 'octo', repo: 'sudden-agent', username: 'reviewer',
    });
  });

  it('treats a missing collaborator as untrusted', async () => {
    const getCollaboratorPermissionLevelMock = jest.fn().mockRejectedValue({ status: 404 });
    getOctokitMock.mockReturnValue({
      rest: { repos: { getCollaboratorPermissionLevel: getCollaboratorPermissionLevelMock } },
    } as unknown as ReturnType<typeof getOctokit>);

    await expect(fetchPermission('outsider')).resolves.toBe('none');
  });

  it('does not turn an API failure into a trust decision', async () => {
    const getCollaboratorPermissionLevelMock = jest.fn().mockRejectedValue({ status: 403 });
    getOctokitMock.mockReturnValue({
      rest: { repos: { getCollaboratorPermissionLevel: getCollaboratorPermissionLevelMock } },
    } as unknown as ReturnType<typeof getOctokit>);

    await expect(fetchPermission('reviewer')).rejects.toThrow('Failed to verify permissions');
  });
});
