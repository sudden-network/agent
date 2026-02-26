import { WORKFLOW_TOKEN_ACTOR } from './github/identity';

const loadPrompt = async ({
  prompt,
  pseudo,
}: {
  prompt?: string;
  pseudo?: boolean;
} = {}) => {
  jest.resetModules();
  process.env.GITHUB_EVENT_PATH = '/tmp/event.json';

  if (prompt) {
    process.env.INPUT_PROMPT = prompt;
  } else {
    delete process.env.INPUT_PROMPT;
  }

  if (pseudo !== undefined) {
    process.env.INPUT_PSEUDO = pseudo ? 'true' : 'false';
  } else {
    delete process.env.INPUT_PSEUDO;
  }

  const { buildPrompt } = await import('./prompt');

  return buildPrompt;
};

describe('buildPrompt', () => {
  afterEach(() => {
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.INPUT_PROMPT;
    delete process.env.INPUT_PSEUDO;
  });

  it('uses the resume prompt when resumed', async () => {
    const buildPrompt = await loadPrompt();
    const result = buildPrompt({
      resumed: true,
      trustedCollaborators: ['octocat'],
      tokenActor: WORKFLOW_TOKEN_ACTOR,
    });

    expect(result).toContain('A new GitHub event triggered this workflow.');
    expect(result).toContain('/tmp/event.json');
    expect(result).toContain('Re-evaluate the task you were previously given');
    expect(result).not.toContain('You are `github-actions[bot]`');
  });

  it('uses the full prompt when not resumed', async () => {
    const buildPrompt = await loadPrompt({ prompt: 'Extra instructions' });
    const result = buildPrompt({
      resumed: false,
      trustedCollaborators: ['octocat', 'hubot'],
      tokenActor: WORKFLOW_TOKEN_ACTOR,
    });

    expect(result).toContain('You are `github-actions[bot]`');
    expect(result).toContain('- @octocat');
    expect(result).toContain('- @hubot');
    expect(result).toContain('/tmp/event.json');
    expect(result).toContain('Extra instructions');
    expect(result).toContain('github-actions[bot]');
  });

  it('supports token context overrides', async () => {
    const buildPrompt = await loadPrompt({ prompt: 'Extra instructions' });
    const result = buildPrompt({
      resumed: false,
      trustedCollaborators: ['octocat', 'hubot'],
      tokenActor: 'sudden-agent[bot]',
    });

    expect(result).toContain('sudden-agent[bot]');
  });

  it('uses pseudo mode instructions when enabled', async () => {
    const buildPrompt = await loadPrompt({ pseudo: true });
    const result = buildPrompt({
      resumed: false,
      trustedCollaborators: ['octocat'],
      tokenActor: WORKFLOW_TOKEN_ACTOR,
    });

    expect(result).toContain('Pseudo mode is enabled.');
    expect(result).toContain('GitHub CLI is available');
    expect(result).toContain('MCP server is disabled');
    expect(result).toContain('write access to the local checkout');
  });
});
