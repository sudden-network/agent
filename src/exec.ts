import { getExecOutput } from '@actions/exec';
import type { ExecListeners, ExecOptions } from '@actions/exec';

type StreamMode = 'stdout' | 'stderr' | 'both';

const buildCommandError = (
  command: string,
  args: string[],
  stdout: string,
  stderr: string,
  exitCode: number,
): string => {
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();
  const details = [trimmedStdout, trimmedStderr].filter(Boolean).join('\n');
  const base = `Command failed: ${[command, ...args].join(' ')}`;
  return details ? `${base}\n\n${details}` : `${base} (exit code ${exitCode})`;
};

const buildListeners = (stream: StreamMode): ExecListeners => {
  return {
    stdout: stream === 'stdout' || stream === 'both' ? (data) => process.stdout.write(data) : undefined,
    stderr: stream === 'stderr' || stream === 'both' ? (data) => process.stderr.write(data) : undefined,
  };
};

export const runCommand = async (
  command: string,
  args: string[],
  options: ExecOptions = {},
  stream: StreamMode = 'both',
): Promise<void> => {
  const result = await getExecOutput(command, args, {
    ...options,
    ignoreReturnCode: true,
    silent: true,
    listeners: buildListeners(stream),
  });

  if (result.exitCode !== 0) {
    throw new Error(buildCommandError(command, args, result.stdout, result.stderr, result.exitCode));
  }
};
