import { bootstrapCli } from './codex';
import { readInputs } from './input';

const main = async (): Promise<void> => {
  const { cliVersion, apiKey } = readInputs();
  await bootstrapCli({ version: cliVersion, apiKey });
};

void main();
