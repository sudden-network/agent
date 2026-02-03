import { exportVariable, setFailed } from '@actions/core';
import fs from 'fs';
import path from 'path';
import { downloadLatestArtifact, uploadArtifact } from './artifacts';
import { bootstrapCli, runCodex } from './codex';
import { postComment } from './comment';
import { getIssueNumber, getSubjectType } from './github-context';
import { readInputs } from './input';

const ARTIFACT_PREFIX = 'action-agent';
const CODEX_DIRNAME = 'action-agent-codex';

const ensureDir = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
};

const setCodexEnv = (): string => {
  const baseDir = path.join(process.env.RUNNER_TEMP || '/tmp', CODEX_DIRNAME);
  const sessionsDir = path.join(baseDir, 'sessions');
  ensureDir(sessionsDir);
  exportVariable('CODEX_HOME', baseDir);
  exportVariable('CODEX_STATE_DIR', baseDir);
  exportVariable('CODEX_SESSIONS_PATH', sessionsDir);
  return baseDir;
};

const getArtifactName = (): string => {
  return `${ARTIFACT_PREFIX}-${getSubjectType()}-${getIssueNumber()}`;
};

const restoreArtifact = async (githubToken: string, name: string, targetDir: string): Promise<void> => {
  const downloadPath = path.join(process.env.RUNNER_TEMP || '/tmp', 'action-agent-artifact');
  fs.rmSync(downloadPath, { recursive: true, force: true });
  ensureDir(downloadPath);
  const latest = await downloadLatestArtifact(githubToken, name, downloadPath);
  if (!latest) {
    return;
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  ensureDir(targetDir);
  fs.cpSync(downloadPath, targetDir, { recursive: true });
};

const main = async (): Promise<void> => {
  const { cliVersion, apiKey, githubToken } = readInputs();
  const artifactName = getArtifactName();
  const codexDir = setCodexEnv();
  try {
    await restoreArtifact(githubToken, artifactName, codexDir);
    await bootstrapCli({ version: cliVersion, apiKey });
    await runCodex('say hello');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await postComment(`
action-agent failed:
\`\`\`
${message}
\`\`\`
    `);

    setFailed(`action-agent failed: ${message}`);
  } finally {
    await uploadArtifact(artifactName, codexDir);
  }
};

void main();
