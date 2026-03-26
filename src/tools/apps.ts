import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QlikRestClient } from "../qlik-client.js";

export function registerAppTools(server: McpServer, rest: QlikRestClient) {
  // qlik_search — search for apps, datasets, data products, glossaries
  server.tool(
    "qlik_search",
    "Search for Qlik resources (applications, datasets, data products, glossaries) by name or content",
    { query: z.string().describe("Search query"), limit: z.number().optional().describe("Max results (default 20)") },
    async ({ query, limit }) => {
      const data = await rest.get("/api/v1/items", {
        query,
        limit: limit ?? 20,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  // qlik_describe_app — get app metadata
  server.tool(
    "qlik_describe_app",
    "Retrieve comprehensive metadata about an application including fields, owner, and publishing status",
    { appId: z.string().describe("Application ID") },
    async ({ appId }) => {
      const data = await rest.get(`/api/v1/apps/${appId}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  // qlik_get_fields — list all fields in an app
  server.tool(
    "qlik_get_fields",
    "List all data fields available in an application",
    { appId: z.string().describe("Application ID") },
    async ({ appId }) => {
      // Uses the items endpoint filtered to the app, or the app-specific data model
      const data = await rest.get(`/api/v1/apps/${appId}/data/metadata`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  // qlik_list_sheets — list sheets in an app
  server.tool(
    "qlik_list_sheets",
    "Enumerate all sheets within an application",
    { appId: z.string().describe("Application ID") },
    async ({ appId }) => {
      const data = await rest.get(`/api/v1/apps/${appId}/objects`, {
        type: "sheet",
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  // qlik_get_sheet_details — get details about a sheet
  server.tool(
    "qlik_get_sheet_details",
    "Get details about a specific sheet including all charts and their types",
    {
      appId: z.string().describe("Application ID"),
      sheetId: z.string().describe("Sheet ID"),
    },
    async ({ appId, sheetId }) => {
      const data = await rest.get(`/api/v1/apps/${appId}/objects/${sheetId}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  // qlik_list_apps — list all apps (convenience)
  server.tool(
    "qlik_list_apps",
    "List all applications in the tenant",
    { limit: z.number().optional().describe("Max results (default 50)") },
    async ({ limit }) => {
      const data = await rest.get("/api/v1/apps", { limit: limit ?? 50 });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
}
