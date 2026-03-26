import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QlikRestClient } from "../qlik-client.js";

export function registerReloadTools(server: McpServer, rest: QlikRestClient) {
  server.tool(
    "qlik_trigger_reload",
    "Trigger an app reload via the Qlik REST API",
    {
      appId: z.string().describe("Application ID to reload"),
      partial: z.boolean().optional().describe("Partial reload (default false)"),
    },
    async ({ appId, partial }) => {
      const data = await rest.post("/api/v1/reloads", {
        appId,
        partial: partial ?? false,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_reload_status",
    "Check the status of an app reload",
    {
      reloadId: z.string().describe("Reload task ID"),
    },
    async ({ reloadId }) => {
      const data = await rest.get(`/api/v1/reloads/${reloadId}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
}
