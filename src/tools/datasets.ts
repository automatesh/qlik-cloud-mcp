import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QlikRestClient } from "../qlik-client.js";

export function registerDatasetTools(server: McpServer, rest: QlikRestClient) {
  server.tool(
    "qlik_get_dataset",
    "Load dataset metadata including trust score",
    { datasetId: z.string().describe("Dataset ID") },
    async ({ datasetId }) => {
      const data = await rest.get(`/api/v1/data-sets/${datasetId}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_dataset_schema",
    "Load column definitions for a dataset",
    { datasetId: z.string().describe("Dataset ID") },
    async ({ datasetId }) => {
      const data = await rest.get(`/api/v1/data-sets/${datasetId}`);
      // schema is typically embedded in the dataset response
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_dataset_profile",
    "Load profile data (statistics, distributions) for a dataset",
    { datasetId: z.string().describe("Dataset ID") },
    async ({ datasetId }) => {
      const data = await rest.get(`/api/v1/data-sets/${datasetId}/profiles`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_dataset_sample",
    "Load first 10 rows of a dataset for preview",
    { datasetId: z.string().describe("Dataset ID") },
    async ({ datasetId }) => {
      const data = await rest.get(`/api/v1/data-sets/${datasetId}/data`, { limit: 10 });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_dataset_freshness",
    "Get last updated timestamp for a dataset",
    { datasetId: z.string().describe("Dataset ID") },
    async ({ datasetId }) => {
      const data = await rest.get<Record<string, unknown>>(`/api/v1/data-sets/${datasetId}`);
      const result = {
        id: data.id,
        name: data.name,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        lastLoadTime: data.lastLoadTime,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_dataset_trust_score",
    "Retrieve trust score for a dataset",
    { datasetId: z.string().describe("Dataset ID") },
    async ({ datasetId }) => {
      const data = await rest.get(`/api/v1/data-qualities/${datasetId}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_dataset_memberships",
    "Get data product memberships for a dataset",
    { datasetId: z.string().describe("Dataset ID") },
    async ({ datasetId }) => {
      const data = await rest.get(`/api/v1/data-sets/${datasetId}/memberships`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_update_dataset_metadata",
    "Update dataset name and description",
    {
      datasetId: z.string().describe("Dataset ID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
    },
    async ({ datasetId, name, description }) => {
      const body: Record<string, unknown> = {};
      if (name) body.name = name;
      if (description) body.description = description;
      const data = await rest.patch(`/api/v1/data-sets/${datasetId}`, body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_update_dataset_quality",
    "Request a data quality computation for a dataset",
    { datasetId: z.string().describe("Dataset ID") },
    async ({ datasetId }) => {
      const data = await rest.post(`/api/v1/data-qualities`, { datasetId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_dataset_quality_computation_status",
    "Check the status of a data quality computation",
    { computationId: z.string().describe("Computation ID") },
    async ({ computationId }) => {
      const data = await rest.get(`/api/v1/data-qualities/${computationId}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
}
