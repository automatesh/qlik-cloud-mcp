import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QlikRestClient } from "../qlik-client.js";

export function registerSpaceTools(server: McpServer, rest: QlikRestClient) {
  server.tool(
    "qlik_list_spaces",
    "List all spaces in the tenant",
    { limit: z.number().optional().describe("Max results (default 50)") },
    async ({ limit }) => {
      const data = await rest.get("/api/v1/spaces", { limit: limit ?? 50 });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_space",
    "Get details about a specific space",
    { spaceId: z.string().describe("Space ID") },
    async ({ spaceId }) => {
      const data = await rest.get(`/api/v1/spaces/${spaceId}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
}
