const fs = require('fs');
const os = require('os');
const path = require('path');
const mockFs = require('fs');
const mockPath = require('path');

let mockArtifactClient;
let mockLastCodexArgs = null;
let mockLastCodexInput = '';
let mockCodexOutput = '';
let mockCodexExit = 0;
let mockLoginExit = 0;

jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  exportVariable: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
}));

jest.mock('@actions/exec', () => ({
  exec: jest.fn(async (cmd, args, opts = {}) => {
    if (cmd === 'npm') {
      return 0;
    }
    if (cmd === 'bash') {
      return mockLoginExit;
    }
    if (cmd === 'codex') {
      mockLastCodexArgs = args;
      mockLastCodexInput = opts.input || '';
      if (opts.env?.CODEX_STATE_DIR) {
        mockFs.mkdirSync(opts.env.CODEX_STATE_DIR, { recursive: true });
        mockFs.writeFileSync(mockPath.join(opts.env.CODEX_STATE_DIR, 'history.jsonl'), '');
      }
      if (opts.listeners?.stdout) {
        opts.listeners.stdout(mockCodexOutput);
      }
      if (opts.listeners?.stderr && mockCodexOutput) {
        opts.listeners.stderr('');
      }
      return mockCodexExit;
    }
    return 0;
  }),
}));

jest.mock('@actions/artifact', () => ({
  DefaultArtifactClient: jest.fn(() => mockArtifactClient),
}));

const mockGithubContext = {
  repo: { owner: 'acme', repo: 'demo' },
  payload: {
    action: 'opened',
    issue: { title: 'Default title', body: 'Default body' },
    comment: { body: '' },
  },
};

const mockGetOctokit = jest.fn();

jest.mock('@actions/github', () => ({
  context: mockGithubContext,
  getOctokit: mockGetOctokit,
}));

const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const waitFor = async (fn, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) {
      return;
    }
    await flushPromises();
  }
  throw new Error('Timed out waiting for condition');
};

const setInputs = (overrides = {}) => {
  const inputs = {
    issue_number: '1',
    comment_id: '',
    model: '',
    reasoning_effort: '',
    openai_api_key: 'test-key',
    github_token: 'ghs_test',
    ...overrides,
  };

  core.getInput.mockImplementation((name) => inputs[name] ?? '');
};

const setContext = ({ action = 'opened', issue, comment } = {}) => {
  github.context.payload.action = action;
  github.context.payload.issue = issue || { title: 'Issue title', body: 'Issue body' };
  github.context.payload.comment = comment || { body: '' };
};

const createOctokit = ({
  issueTitle = 'Issue title',
  issueBody = 'Issue body',
  issueUrl = 'https://example.com/issues/1',
  commentBody = '',
  commentUrl = 'https://example.com/issues/1#comment',
  artifacts = [],
} = {}) => ({
  rest: {
    issues: {
      get: jest.fn().mockResolvedValue({
        data: { title: issueTitle, body: issueBody, html_url: issueUrl },
      }),
      getComment: jest.fn().mockResolvedValue({
        data: { body: commentBody, html_url: commentUrl },
      }),
      createComment: jest.fn().mockResolvedValue({}),
    },
    reactions: {
      createForIssue: jest.fn().mockResolvedValue({}),
      createForIssueComment: jest.fn().mockResolvedValue({}),
    },
    actions: {
      listArtifactsForRepo: jest.fn().mockResolvedValue({ data: { artifacts } }),
    },
  },
});

const runAction = async () => {
  jest.isolateModules(() => {
    require('../src/index');
  });
  await flushPromises();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockArtifactClient = {
    downloadArtifact: jest.fn(),
    uploadArtifact: jest.fn(),
  };
  mockLastCodexArgs = null;
  mockLastCodexInput = '';
  mockCodexExit = 0;
  mockLoginExit = 0;
  mockCodexOutput = `${JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', text: 'Hello from Codex' },
  })}\n`;

  const runnerTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'));
  process.env.RUNNER_TEMP = runnerTemp;
  process.env.GITHUB_ACTION_PATH = path.resolve(__dirname, '..');
  fs.rmSync('/tmp/codex_output.txt', { force: true });
  fs.rmSync('/tmp/codex_response.txt', { force: true });
});

test('runs on new issue and posts response', async () => {
  setInputs({ issue_number: '7' });
  setContext({ action: 'opened' });

  const octokit = createOctokit({ issueTitle: 'New issue', issueBody: 'Do work' });
  mockGetOctokit.mockReturnValue(octokit);

  await runAction();
  await waitFor(() => octokit.rest.issues.createComment.mock.calls.length === 1);

  const [{ body }] = octokit.rest.issues.createComment.mock.calls[0];
  expect(body).toBe('Hello from Codex');
  expect(mockLastCodexArgs).toEqual(expect.arrayContaining(['exec', '--json']));
  expect(mockLastCodexArgs).not.toEqual(expect.arrayContaining(['resume']));
  expect(mockLastCodexInput).toContain('<title>New issue</title>');
  expect(mockLastCodexInput).toContain('<description>Do work</description>');
  expect(mockArtifactClient.uploadArtifact).toHaveBeenCalledWith(
    'codex-worker-session-7',
    expect.any(Array),
    expect.any(String),
    expect.objectContaining({ retentionDays: 7 })
  );
});

test('resumes from comment with latest artifact', async () => {
  setInputs({ issue_number: '8', comment_id: '55' });
  setContext({ action: 'created', comment: { body: 'What is up?' } });

  const octokit = createOctokit({
    commentBody: 'What is up?',
    artifacts: [
      { id: 1, name: 'codex-worker-session-8', expired: false, created_at: '2026-02-01T00:00:00Z' },
    ],
  });
  mockGetOctokit.mockReturnValue(octokit);

  mockArtifactClient.downloadArtifact.mockImplementation(async (_id, options) => {
    const sessionsDir = path.join(options.path, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'session.jsonl'), '');
  });

  await runAction();
  await waitFor(() => octokit.rest.issues.createComment.mock.calls.length === 1);

  const [{ body }] = octokit.rest.issues.createComment.mock.calls[0];
  expect(body).toBe('Hello from Codex');
  expect(mockLastCodexArgs).toEqual(expect.arrayContaining(['resume', '--last']));
  expect(mockLastCodexInput).toBe('What is up?');
});

test('fails when follow-up has no session artifact', async () => {
  setInputs({ issue_number: '9', comment_id: '77' });
  setContext({ action: 'created', comment: { body: 'continue' } });

  const octokit = createOctokit({ artifacts: [] });
  mockGetOctokit.mockReturnValue(octokit);

  await runAction();
  await waitFor(() => octokit.rest.issues.createComment.mock.calls.length === 1);

  const [{ body }] = octokit.rest.issues.createComment.mock.calls[0];
  expect(body).toContain('Session artifact not found; cannot resume.');
  expect(exec.exec).not.toHaveBeenCalledWith('codex', expect.anything(), expect.anything());
});

test('skips stale edited comment without posting', async () => {
  setInputs({ issue_number: '10', comment_id: '88' });
  setContext({ action: 'edited', comment: { body: 'new body' } });

  const octokit = createOctokit({ commentBody: 'old body' });
  mockGetOctokit.mockReturnValue(octokit);

  await runAction();
  await waitFor(() => exec.exec.mock.calls.length > 0);

  expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
});

test('reports missing OpenAI API key', async () => {
  setInputs({ issue_number: '11', openai_api_key: '' });
  setContext({ action: 'opened' });

  const octokit = createOctokit();
  mockGetOctokit.mockReturnValue(octokit);

  await runAction();
  await waitFor(() => octokit.rest.issues.createComment.mock.calls.length === 1);

  const [{ body }] = octokit.rest.issues.createComment.mock.calls[0];
  expect(body).toContain('OPENAI_API_KEY is missing');
  expect(exec.exec).not.toHaveBeenCalledWith('codex', expect.anything(), expect.anything());
});

test('reports login failure', async () => {
  setInputs({ issue_number: '12' });
  setContext({ action: 'opened' });

  mockLoginExit = 1;
  const octokit = createOctokit();
  mockGetOctokit.mockReturnValue(octokit);

  await runAction();
  await waitFor(() => octokit.rest.issues.createComment.mock.calls.length === 1);

  const [{ body }] = octokit.rest.issues.createComment.mock.calls[0];
  expect(body).toContain('Codex login failed.');
  expect(exec.exec).not.toHaveBeenCalledWith('codex', expect.anything(), expect.anything());
});

test('falls back to raw output when JSONL parse fails', async () => {
  setInputs({ issue_number: '13' });
  setContext({ action: 'opened' });

  mockCodexOutput = 'not-json\n';
  const octokit = createOctokit();
  mockGetOctokit.mockReturnValue(octokit);

  await runAction();
  await waitFor(() => octokit.rest.issues.createComment.mock.calls.length === 1);

  const [{ body }] = octokit.rest.issues.createComment.mock.calls[0];
  expect(body).toContain('not-json');
});

test('edited issue resumes and includes header', async () => {
  setInputs({ issue_number: '14' });
  setContext({ action: 'edited' });

  const octokit = createOctokit({
    issueUrl: 'https://example.com/issues/14',
    artifacts: [
      { id: 2, name: 'codex-worker-session-14', expired: false, created_at: '2026-02-01T00:00:00Z' },
    ],
  });
  mockGetOctokit.mockReturnValue(octokit);

  mockArtifactClient.downloadArtifact.mockImplementation(async (_id, options) => {
    fs.mkdirSync(options.path, { recursive: true });
    fs.writeFileSync(path.join(options.path, 'history.jsonl'), '');
  });

  await runAction();
  await waitFor(() => octokit.rest.issues.createComment.mock.calls.length === 1);

  const [{ body }] = octokit.rest.issues.createComment.mock.calls[0];
  expect(body.startsWith('Issue updated: https://example.com/issues/14')).toBe(true);
  expect(mockLastCodexArgs).toEqual(expect.arrayContaining(['resume', '--last']));
  expect(mockLastCodexInput).toContain('Issue updated');
});
