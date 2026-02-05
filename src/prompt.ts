import fs from 'fs';
import path from 'path';
import { inputs } from './github/input';

const PROMPT_TEMPLATE = fs.readFileSync(path.join(__dirname, 'PROMPT.md'), 'utf8');

export const buildPrompt = (): string => {
  const githubEventPath = process.env.GITHUB_EVENT_PATH;

  if (!githubEventPath) {
    throw new Error('Missing `GITHUB_EVENT_PATH`.');
  }

  return PROMPT_TEMPLATE
    .replace('{{github_event_path}}', githubEventPath)
    .replace('{{extra_prompt}}', inputs.prompt ?? '')
    .trim();
};
