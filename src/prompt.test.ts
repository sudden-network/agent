const loadPrompt = async (prompt?: string) => {
  jest.resetModules();
  process.env.GITHUB_EVENT_PATH = '/tmp/event.json';

  if (prompt) {
    process.env.INPUT_PROMPT = prompt;
  } else {
    delete process.env.INPUT_PROMPT;
  }

  const { buildPrompt } = await import('./prompt');

  return buildPrompt;
};

describe('buildPrompt', () => {
  afterEach(() => {
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.INPUT_PROMPT;
  });

  it('uses the resume prompt when resumed', async () => {
    const buildPrompt = await loadPrompt();
    const result = buildPrompt({ resumed: true });

    expect(result).toContain('A new GitHub event triggered this workflow.');
    expect(result).toContain('/tmp/event.json');
    expect(result).not.toContain('You are action-agent');
  });

  it('uses the full prompt when not resumed', async () => {
    const buildPrompt = await loadPrompt('Extra instructions');
    const result = buildPrompt({ resumed: false });

    expect(result).toContain('You are action-agent');
    expect(result).toContain('/tmp/event.json');
    expect(result).toContain('Extra instructions');
  });
});
