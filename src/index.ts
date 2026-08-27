#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigRegistry } from "./config/loader.js";
import { registerAllTools } from "./tools/index.js";

/**
 * SleepBot MCP server entrypoint.
 *
 * Boots by loading the leagues config, registering all read-only tools, and
 * serving over stdio. The server holds no per-request state (Sleeper's public
 * API is the source of truth), which keeps it portable from laptop to VPS as a
 * deploy change rather than a rewrite.
 */
async function main(): Promise<void> {
  const config = ConfigRegistry.load();

  const server = new McpServer({
    name: "sleepbot",
    version: "0.1.0",
  });

  await registerAllTools(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is the MCP channel; all logging must go to stderr.
  console.error(
    `SleepBot MCP server ready — ${config.list().length} league(s) configured.`,
  );
}

main().catch((err) => {
  console.error(`SleepBot failed to start: ${(err as Error).message}`);
  process.exit(1);
});
