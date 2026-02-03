import fs from 'fs';
import os from 'os';
import path from 'path';
import { context } from '@actions/github';
import { downloadLatestArtifact, uploadArtifact } from './artifacts';
import { runCommand } from './exec';
import { inputs } from './input';

const CODEX_VERSION = '0.93.0';
const CODEX_DIR = path.join(os.homedir(), '.codex');

const ensureDir = (dir: string) => fs.mkdirSync(dir, { recursive: true });

const shouldResume = (): boolean =>
  inputs.resume && Boolean(context.payload.issue || context.payload.pull_request);

const restoreSession = async () => {
  if (!shouldResume()) return;
  ensureDir(CODEX_DIR);
  await downloadLatestArtifact(inputs.githubToken, CODEX_DIR);
};

const persistSession = async () => {
  if (!shouldResume()) return;
  fs.rmSync(path.join(CODEX_DIR, 'auth.json'), { force: true });
  fs.rmSync(path.join(CODEX_DIR, 'tmp'), { recursive: true, force: true });
  await uploadArtifact(CODEX_DIR);
};

const install = async () => {
  await runCommand('npm', ['install', '-g', `@openai/codex@${CODEX_VERSION}`]);
};

const login = async () => {
  await runCommand('bash', ['-lc', 'printenv OPENAI_API_KEY | codex login --with-api-key'], {
    env: { OPENAI_API_KEY: inputs.apiKey },
  });
};

export const bootstrap = async () => {
  await install();
  await restoreSession();
  await login();
};

export const teardown = async () => {
  await persistSession();
};

export const runCodex = async (prompt: string) => {
  await runCommand('codex', ['exec', 'resume', '--last', '--skip-git-repo-check', prompt], {}, 'stderr');
};
