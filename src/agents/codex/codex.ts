import fs from 'fs';
import os from 'os';
import path from 'path';
import { context } from '@actions/github';
import { downloadLatestArtifact, uploadArtifact } from '../../github/artifacts';
import { runCommand } from '../../exec';
import { inputs } from '../../github/input';
import { isPermissionError } from '../../github/error';
import { info } from '@actions/core';
import { BootstrapOptions, BootstrapResult } from '../../agent';
import type { McpServerConfig } from '../../mcp';

type AuthStrategy =
  | { kind: 'api_key'; apiKey: string }
  | { kind: 'auth_file'; authFile: string };

const CODEX_VERSION = '0.98.0';
const CODEX_DIR = path.join(os.homedir(), '.codex');
const CODEX_CONFIG_PATH = path.join(CODEX_DIR, 'config.toml');
const CODEX_AUTH_PATH = path.join(CODEX_DIR, 'auth.json');
const CODEX_SESSIONS_PATH = path.join(CODEX_DIR, 'sessions');

const ensureDir = (dir: string) => fs.mkdirSync(dir, { recursive: true });

const shouldResume = (): boolean => {
  if (!inputs.resume) return false;
  return Boolean(context.payload.issue || context.payload.pull_request);
};

export const buildConfig = (mcpServers: McpServerConfig[]) => {
  return mcpServers
    .map(({ name, url }) => `[mcp_servers.${name}]\nurl = "${url}"`)
    .join('\n\n');
};

const writeCodexConfig = (mcpServers: McpServerConfig[]) => {
  ensureDir(CODEX_DIR);
  fs.writeFileSync(CODEX_CONFIG_PATH, buildConfig(mcpServers));
};

const restoreSession = async (): Promise<boolean> => {
  if (!shouldResume()) return false;
  ensureDir(CODEX_SESSIONS_PATH);

  try {
    if (await downloadLatestArtifact(CODEX_SESSIONS_PATH)) {
      info('Restored previous session');
      return true;
    } else {
      info('No previous session found');
      return false;
    }
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error('Resume is enabled but the workflow lacks `actions: read` permission.');
    }
    throw error;
  }
};

const persistSession = async () => {
  if (!shouldResume()) return;
  await uploadArtifact(CODEX_SESSIONS_PATH);
};

const install = async () => {
  await runCommand('npm', ['install', '-g', `@openai/codex@${CODEX_VERSION}`]);
};

export const resolveAuthStrategy = (): AuthStrategy => {
  const apiKey = inputs.agentApiKey?.trim() || undefined;
  const authFile = inputs.agentAuthFile?.trim() || undefined;

  if (apiKey && authFile) throw new Error('Set only one: `agent_api_key` or `agent_auth_file`.');
  if (authFile) return { kind: 'auth_file', authFile };
  if (apiKey) return { kind: 'api_key', apiKey };

  throw new Error('Missing auth: set `agent_api_key` or `agent_auth_file`.');
};

const login = async () => {
  const auth = resolveAuthStrategy();

  if (auth.kind === 'auth_file') {
    ensureDir(CODEX_DIR);
    fs.writeFileSync(CODEX_AUTH_PATH, auth.authFile, { mode: 0o600 });
    return;
  }

  await runCommand('codex', ['login', '--with-api-key'], { input: Buffer.from(auth.apiKey, 'utf8') });
};

export const parseModelInput = (value: string | undefined) => {
  if (!value) return {};
  const [model, reasoningEffort] = value.split('/', 2).map((part) => part.trim());
  return {
    model: model || undefined,
    reasoningEffort: reasoningEffort || undefined,
  };
};

export const bootstrap = async ({ mcpServers }: BootstrapOptions): Promise<BootstrapResult> => {
  const [resumed] = await Promise.all([
    restoreSession(),
    install(),
  ]);
  writeCodexConfig(mcpServers);
  await login();

  return { resumed };
};

export const teardown = async () => {
  await persistSession();
};

export const run = async (prompt: string) => {
  const { model, reasoningEffort } = parseModelInput(inputs.model);
  const sandbox = inputs.sudo ? 'danger-full-access' : 'read-only';

  await runCommand(
    'codex',
    [
      'exec',
      `--sandbox=${sandbox}`,
      ...(model ? [`--model=${model}`] : []),
      ...(reasoningEffort ? [`--config=model_reasoning_effort=${reasoningEffort}`] : []),
      '-',
      'resume',
      '--last',
      '--skip-git-repo-check',
    ],
    { input: Buffer.from(prompt, 'utf8') },
    'stderr',
  );
};
