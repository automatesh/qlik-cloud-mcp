import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { QlikRestClient, QlikEngineClient, QlikConfig } from "./qlik-client.js";
import { registerAppTools } from "./tools/apps.js";
import { registerGlossaryTools } from "./tools/glossaries.js";
import { registerDatasetTools } from "./tools/datasets.js";
import { registerDataProductTools } from "./tools/data-products.js";
import { registerLineageTools } from "./tools/lineage.js";
import { registerSpaceTools } from "./tools/spaces.js";
import { registerEngineTools } from "./tools/engine.js";
import { registerEvaluateTools } from "./tools/evaluate.js";
import { registerBookmarkTools } from "./tools/bookmarks.js";
import { registerReloadTools } from "./tools/reload.js";

function getConfig(): QlikConfig {
  const tenantUrl = process.env.QLIK_TENANT_URL;
  const apiKey = process.env.QLIK_API_KEY;

  if (!tenantUrl || !apiKey) {
    console.error("Missing QLIK_TENANT_URL or QLIK_API_KEY environment variables.");
    console.error("Set them before starting the server:");
    console.error("  QLIK_TENANT_URL=https://your-tenant.us.qlikcloud.com");
    console.error("  QLIK_API_KEY=your-api-key");
    process.exit(1);
  }

  return { tenantUrl, apiKey };
}

async function main() {
  const config = getConfig();
  const rest = new QlikRestClient(config);
  const engine = new QlikEngineClient(config);

  const server = new McpServer({
    name: "qlik-cloud-mcp",
    version: "1.0.0",
  });

  // Register all tool groups
  registerAppTools(server, rest);
  registerGlossaryTools(server, rest);
  registerDatasetTools(server, rest);
  registerDataProductTools(server, rest);
  registerLineageTools(server, rest);
  registerSpaceTools(server, rest);
  registerEngineTools(server, engine);
  registerEvaluateTools(server, engine);
  registerBookmarkTools(server, engine);
  registerReloadTools(server, rest);

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
