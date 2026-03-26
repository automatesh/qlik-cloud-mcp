import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QlikRestClient } from "../qlik-client.js";

export function registerDataProductTools(server: McpServer, rest: QlikRestClient) {
  server.tool(
    "qlik_create_data_product",
    "Create a new data product",
    {
      name: z.string().describe("Data product name"),
      description: z.string().optional().describe("Description"),
      spaceId: z.string().optional().describe("Space ID"),
    },
    async ({ name, description, spaceId }) => {
      const body: Record<string, unknown> = { name };
      if (description) body.description = description;
      if (spaceId) body.spaceId = spaceId;
      const data = await rest.post("/api/v1/data-products", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_data_product",
    "Retrieve metadata for a specific data product",
    { dataProductId: z.string().describe("Data product ID") },
    async ({ dataProductId }) => {
      const data = await rest.get(`/api/v1/data-products/${dataProductId}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_data_product_documentation",
    "Get markdown documentation for a data product",
    { dataProductId: z.string().describe("Data product ID") },
    async ({ dataProductId }) => {
      const data = await rest.get<Record<string, unknown>>(`/api/v1/data-products/${dataProductId}`);
      return { content: [{ type: "text", text: JSON.stringify({ documentation: data.documentation ?? data.description }, null, 2) }] };
    },
  );

  server.tool(
    "qlik_update_data_product",
    "Update data product properties (name, description, datasets)",
    {
      dataProductId: z.string().describe("Data product ID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
    },
    async ({ dataProductId, name, description }) => {
      const body: Record<string, unknown> = {};
      if (name) body.name = name;
      if (description) body.description = description;
      const data = await rest.patch(`/api/v1/data-products/${dataProductId}`, body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_update_data_product_space",
    "Move a data product to a different space",
    {
      dataProductId: z.string().describe("Data product ID"),
      spaceId: z.string().describe("Target space ID"),
    },
    async ({ dataProductId, spaceId }) => {
      const data = await rest.patch(`/api/v1/data-products/${dataProductId}`, { spaceId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_activate_data_product",
    "Activate a data product in a specific space",
    {
      dataProductId: z.string().describe("Data product ID"),
      spaceId: z.string().describe("Space ID to activate in"),
    },
    async ({ dataProductId, spaceId }) => {
      const data = await rest.post(`/api/v1/data-products/${dataProductId}/actions/activate`, { spaceId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_deactivate_data_product",
    "Deactivate a data product",
    { dataProductId: z.string().describe("Data product ID") },
    async ({ dataProductId }) => {
      const data = await rest.post(`/api/v1/data-products/${dataProductId}/actions/deactivate`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_delete_data_product",
    "Remove a data product",
    { dataProductId: z.string().describe("Data product ID") },
    async ({ dataProductId }) => {
      await rest.delete(`/api/v1/data-products/${dataProductId}`);
      return { content: [{ type: "text", text: "Data product deleted." }] };
    },
  );
}
