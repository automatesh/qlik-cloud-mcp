import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QlikRestClient } from "../qlik-client.js";

export function registerGlossaryTools(server: McpServer, rest: QlikRestClient) {
  server.tool(
    "qlik_create_glossary",
    "Create a new business glossary",
    {
      name: z.string().describe("Glossary name"),
      description: z.string().optional().describe("Glossary description"),
      spaceId: z.string().optional().describe("Space ID to create glossary in"),
    },
    async ({ name, description, spaceId }) => {
      const body: Record<string, unknown> = { name };
      if (description) body.description = description;
      if (spaceId) body.spaceId = spaceId;
      const data = await rest.post("/api/v1/glossaries", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_full_glossary_export",
    "Get complete glossary with all terms, categories, and links",
    { glossaryId: z.string().describe("Glossary ID") },
    async ({ glossaryId }) => {
      const glossary = await rest.get(`/api/v1/glossaries/${glossaryId}`);
      const terms = await rest.get(`/api/v1/glossaries/${glossaryId}/terms`);
      const categories = await rest.get(`/api/v1/glossaries/${glossaryId}/categories`);
      return {
        content: [{ type: "text", text: JSON.stringify({ glossary, terms, categories }, null, 2) }],
      };
    },
  );

  server.tool(
    "qlik_get_glossary_categories",
    "Retrieve all categories for a glossary",
    { glossaryId: z.string().describe("Glossary ID") },
    async ({ glossaryId }) => {
      const data = await rest.get(`/api/v1/glossaries/${glossaryId}/categories`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_create_glossary_category",
    "Add a new category within a glossary",
    {
      glossaryId: z.string().describe("Glossary ID"),
      name: z.string().describe("Category name"),
    },
    async ({ glossaryId, name }) => {
      const data = await rest.post(`/api/v1/glossaries/${glossaryId}/categories`, { name });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_search_glossary_terms",
    "Find terms within a glossary",
    {
      glossaryId: z.string().describe("Glossary ID"),
      query: z.string().optional().describe("Search query"),
    },
    async ({ glossaryId, query }) => {
      const data = await rest.get(`/api/v1/glossaries/${glossaryId}/terms`, {
        query: query ?? undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_glossary_term",
    "Retrieve a specific term from a glossary",
    {
      glossaryId: z.string().describe("Glossary ID"),
      termId: z.string().describe("Term ID"),
    },
    async ({ glossaryId, termId }) => {
      const data = await rest.get(`/api/v1/glossaries/${glossaryId}/terms/${termId}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_create_glossary_term",
    "Create a new glossary term with description, tags, and relationships",
    {
      glossaryId: z.string().describe("Glossary ID"),
      name: z.string().describe("Term name"),
      description: z.string().optional().describe("Term description"),
      abbreviation: z.string().optional().describe("Abbreviation"),
      tags: z.array(z.string()).optional().describe("Tags"),
      categoryId: z.string().optional().describe("Category ID"),
    },
    async ({ glossaryId, name, description, abbreviation, tags, categoryId }) => {
      const body: Record<string, unknown> = { name };
      if (description) body.description = description;
      if (abbreviation) body.abbreviation = abbreviation;
      if (tags) body.tags = tags;
      if (categoryId) body.categoryId = categoryId;
      const data = await rest.post(`/api/v1/glossaries/${glossaryId}/terms`, body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_update_glossary_term",
    "Modify an existing glossary term",
    {
      glossaryId: z.string().describe("Glossary ID"),
      termId: z.string().describe("Term ID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
    },
    async ({ glossaryId, termId, name, description }) => {
      const body: Record<string, unknown> = {};
      if (name) body.name = name;
      if (description) body.description = description;
      const data = await rest.patch(`/api/v1/glossaries/${glossaryId}/terms/${termId}`, body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_delete_glossary_term",
    "Remove a glossary term",
    {
      glossaryId: z.string().describe("Glossary ID"),
      termId: z.string().describe("Term ID"),
    },
    async ({ glossaryId, termId }) => {
      await rest.delete(`/api/v1/glossaries/${glossaryId}/terms/${termId}`);
      return { content: [{ type: "text", text: "Term deleted." }] };
    },
  );

  server.tool(
    "qlik_update_term_status",
    "Update term status (draft, verified, deprecated)",
    {
      glossaryId: z.string().describe("Glossary ID"),
      termId: z.string().describe("Term ID"),
      status: z.enum(["draft", "verified", "deprecated"]).describe("New status"),
    },
    async ({ glossaryId, termId, status }) => {
      const data = await rest.patch(`/api/v1/glossaries/${glossaryId}/terms/${termId}`, { status });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_glossary_term_links",
    "Get resources linked to a glossary term",
    {
      glossaryId: z.string().describe("Glossary ID"),
      termId: z.string().describe("Term ID"),
    },
    async ({ glossaryId, termId }) => {
      const data = await rest.get(`/api/v1/glossaries/${glossaryId}/terms/${termId}/links`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "qlik_create_glossary_term_links",
    "Link a term to apps, datasets, fields, or master items",
    {
      glossaryId: z.string().describe("Glossary ID"),
      termId: z.string().describe("Term ID"),
      links: z.array(z.object({
        resourceId: z.string(),
        resourceType: z.string(),
      })).describe("Links to create"),
    },
    async ({ glossaryId, termId, links }) => {
      const data = await rest.post(`/api/v1/glossaries/${glossaryId}/terms/${termId}/links`, links);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
}
