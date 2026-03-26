import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QlikRestClient } from "../qlik-client.js";

export function registerLineageTools(server: McpServer, rest: QlikRestClient) {
  server.tool(
    "qlik_get_lineage",
    "Load lineage history of a dataset or app",
    {
      resourceId: z.string().describe("Resource ID (dataset or app)"),
      resourceType: z.enum(["dataset", "app"]).optional().describe("Resource type (default: dataset)"),
    },
    async ({ resourceId, resourceType }) => {
      const data = await rest.get(`/api/v1/lineage-graphs/nodes/${resourceId}`, {
        level: "overview",
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
}
