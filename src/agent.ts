import type { McpServerConfig } from './mcp';

export interface BootstrapOptions {
  mcpServers: McpServerConfig[]
}

export interface BootstrapResult {
  resumed: boolean
}

export interface Agent {
  bootstrap: (options: BootstrapOptions) => Promise<BootstrapResult>;
  run: (prompt: string) => Promise<void>;
  teardown: () => Promise<void>;
}
