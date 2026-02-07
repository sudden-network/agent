const contextMock = {
  actor: 'octo',
  repo: { owner: 'octo', repo: 'sudden-agent' }
};

jest.mock('@actions/github', () => ({ context: contextMock }));

jest.mock('./permissions', () => ({
  fetchPermission: jest.fn(),
}));

import { ensureWriteAccess } from './security';
import { fetchPermission } from './permissions';

const fetchPermissionMock = jest.mocked(fetchPermission);

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
