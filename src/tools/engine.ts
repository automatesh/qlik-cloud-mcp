import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QlikEngineClient } from "../qlik-client.js";

export function registerEngineTools(server: McpServer, engine: QlikEngineClient) {
  // ---------- Selections ----------

  server.tool(
    "qlik_select_values",
    "Apply selections (filters) to fields — supports exact values and search expressions",
    {
      appId: z.string().describe("Application ID"),
      fieldName: z.string().describe("Field name to filter on"),
      values: z.array(z.string()).optional().describe("Exact values to select"),
      searchExpression: z.string().optional().describe("Search expression pattern"),
    },
    async ({ appId, fieldName, values, searchExpression }) => {
      const appHandle = await engine.openApp(appId);

      // Get field handle
      const fieldRes = (await engine.send(appHandle, "GetField", [fieldName])) as {
        qReturn: { qHandle: number };
      };
      const fieldHandle = fieldRes.qReturn.qHandle;

      if (searchExpression) {
        await engine.send(fieldHandle, "SelectValues", [
          { qSearchExpression: searchExpression },
        ]);
      } else if (values && values.length > 0) {
        const qFieldValues = values.map((v) => ({ qText: v, qIsNumeric: false }));
        await engine.send(fieldHandle, "SelectValues", [qFieldValues, false, false]);
      }

      engine.close();
      return { content: [{ type: "text", text: `Selected ${values?.length ?? searchExpression} in field "${fieldName}"` }] };
    },
  );

  server.tool(
    "qlik_clear_selections",
    "Clear selections — all or for a specific field",
    {
      appId: z.string().describe("Application ID"),
      fieldName: z.string().optional().describe("Field name (omit to clear all)"),
    },
    async ({ appId, fieldName }) => {
      const appHandle = await engine.openApp(appId);

      if (fieldName) {
        const fieldRes = (await engine.send(appHandle, "GetField", [fieldName])) as {
          qReturn: { qHandle: number };
        };
        await engine.send(fieldRes.qReturn.qHandle, "Clear", []);
      } else {
        await engine.send(appHandle, "ClearAll", []);
      }

      engine.close();
      return { content: [{ type: "text", text: fieldName ? `Cleared selections in "${fieldName}"` : "Cleared all selections" }] };
    },
  );

  server.tool(
    "qlik_get_current_selections",
    "Retrieve currently active selections/filters in the app",
    { appId: z.string().describe("Application ID") },
    async ({ appId }) => {
      const appHandle = await engine.openApp(appId);

      // Create a CurrentSelections object
      const objRes = (await engine.send(appHandle, "CreateSessionObject", [
        {
          qInfo: { qType: "CurrentSelections" },
          qSelectionObjectDef: {},
        },
      ])) as { qReturn: { qHandle: number } };

      const layout = (await engine.send(objRes.qReturn.qHandle, "GetLayout", [])) as {
        qLayout: unknown;
      };

      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(layout.qLayout, null, 2) }] };
    },
  );

  // ---------- Data Exploration ----------

  server.tool(
    "qlik_create_data_object",
    "Create a temporary hypercube for ad-hoc analytics queries",
    {
      appId: z.string().describe("Application ID"),
      dimensions: z.array(z.string()).describe("Field names for dimensions"),
      measures: z.array(z.string()).describe("Expressions for measures (e.g. 'Sum(Sales)')"),
      limit: z.number().optional().describe("Max rows to return (default 100)"),
    },
    async ({ appId, dimensions, measures, limit }) => {
      const appHandle = await engine.openApp(appId);

      const qDimensions = dimensions.map((d) => ({
        qDef: { qFieldDefs: [d] },
      }));
      const qMeasures = measures.map((m) => ({
        qDef: { qDef: m },
      }));

      const objRes = (await engine.send(appHandle, "CreateSessionObject", [
        {
          qInfo: { qType: "hypercube" },
          qHyperCubeDef: {
            qDimensions,
            qMeasures,
            qInitialDataFetch: [
              {
                qTop: 0,
                qLeft: 0,
                qWidth: dimensions.length + measures.length,
                qHeight: Math.min(limit ?? 100, 10000),
              },
            ],
          },
        },
      ])) as { qReturn: { qHandle: number } };

      const layout = (await engine.send(objRes.qReturn.qHandle, "GetLayout", [])) as {
        qLayout: unknown;
      };

      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(layout.qLayout, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_field_values",
    "Get distinct values for a specific field in an app",
    {
      appId: z.string().describe("Application ID"),
      fieldName: z.string().describe("Field name"),
      limit: z.number().optional().describe("Max values (default 100)"),
    },
    async ({ appId, fieldName, limit }) => {
      const appHandle = await engine.openApp(appId);

      const objRes = (await engine.send(appHandle, "CreateSessionObject", [
        {
          qInfo: { qType: "listbox" },
          qListObjectDef: {
            qDef: { qFieldDefs: [fieldName] },
            qInitialDataFetch: [
              {
                qTop: 0,
                qLeft: 0,
                qWidth: 1,
                qHeight: Math.min(limit ?? 100, 10000),
              },
            ],
          },
        },
      ])) as { qReturn: { qHandle: number } };

      const layout = (await engine.send(objRes.qReturn.qHandle, "GetLayout", [])) as {
        qLayout: unknown;
      };

      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(layout.qLayout, null, 2) }] };
    },
  );

  server.tool(
    "qlik_search_field_values",
    "Search for specific values across fields in an app",
    {
      appId: z.string().describe("Application ID"),
      fieldName: z.string().describe("Field name"),
      searchTerm: z.string().describe("Search term"),
    },
    async ({ appId, fieldName, searchTerm }) => {
      const appHandle = await engine.openApp(appId);

      const objRes = (await engine.send(appHandle, "CreateSessionObject", [
        {
          qInfo: { qType: "listbox" },
          qListObjectDef: {
            qDef: { qFieldDefs: [fieldName] },
            qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 100 }],
          },
        },
      ])) as { qReturn: { qHandle: number } };

      await engine.send(objRes.qReturn.qHandle, "SearchListObjectFor", [
        "/qListObjectDef",
        searchTerm,
      ]);

      const layout = (await engine.send(objRes.qReturn.qHandle, "GetLayout", [])) as {
        qLayout: unknown;
      };

      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(layout.qLayout, null, 2) }] };
    },
  );

  server.tool(
    "qlik_get_chart_data",
    "Retrieve paginated data from an existing chart/object in an app",
    {
      appId: z.string().describe("Application ID"),
      objectId: z.string().describe("Chart/object ID"),
      page: z.number().optional().describe("Page number (0-based, default 0)"),
      pageSize: z.number().optional().describe("Rows per page (default 100)"),
    },
    async ({ appId, objectId, page, pageSize }) => {
      const appHandle = await engine.openApp(appId);

      const objRes = (await engine.send(appHandle, "GetObject", [objectId])) as {
        qReturn: { qHandle: number };
      };
      const objHandle = objRes.qReturn.qHandle;

      const layout = (await engine.send(objHandle, "GetLayout", [])) as {
        qLayout: Record<string, unknown>;
      };

      // Try to get hypercube data
      const top = (page ?? 0) * (pageSize ?? 100);
      try {
        const data = await engine.send(objHandle, "GetHyperCubeData", [
          "/qHyperCubeDef",
          [{ qTop: top, qLeft: 0, qWidth: 20, qHeight: pageSize ?? 100 }],
        ]);
        engine.close();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch {
        // If not a hypercube, return the layout
        engine.close();
        return { content: [{ type: "text", text: JSON.stringify(layout.qLayout, null, 2) }] };
      }
    },
  );

  server.tool(
    "qlik_get_chart_info",
    "Get metadata about a chart/object (type, dimensions, measures)",
    {
      appId: z.string().describe("Application ID"),
      objectId: z.string().describe("Chart/object ID"),
    },
    async ({ appId, objectId }) => {
      const appHandle = await engine.openApp(appId);

      const objRes = (await engine.send(appHandle, "GetObject", [objectId])) as {
        qReturn: { qHandle: number };
      };

      const layout = (await engine.send(objRes.qReturn.qHandle, "GetLayout", [])) as {
        qLayout: unknown;
      };

      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(layout.qLayout, null, 2) }] };
    },
  );

  // ---------- Master Items ----------

  server.tool(
    "qlik_list_dimensions",
    "List all library dimensions in an app",
    { appId: z.string().describe("Application ID") },
    async ({ appId }) => {
      const appHandle = await engine.openApp(appId);

      const objRes = (await engine.send(appHandle, "CreateSessionObject", [
        {
          qInfo: { qType: "DimensionList" },
          qDimensionListDef: { qType: "dimension" },
        },
      ])) as { qReturn: { qHandle: number } };

      const layout = (await engine.send(objRes.qReturn.qHandle, "GetLayout", [])) as {
        qLayout: unknown;
      };

      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(layout.qLayout, null, 2) }] };
    },
  );

  server.tool(
    "qlik_create_dimension",
    "Create a reusable library dimension in an app",
    {
      appId: z.string().describe("Application ID"),
      title: z.string().describe("Dimension title"),
      fieldDefs: z.array(z.string()).describe("Field definitions"),
      description: z.string().optional().describe("Description"),
    },
    async ({ appId, title, fieldDefs, description }) => {
      const appHandle = await engine.openApp(appId);

      const prop = {
        qInfo: { qType: "dimension" },
        qDim: {
          qFieldDefs: fieldDefs,
          title,
        },
        qMetaDef: {
          title,
          description: description ?? "",
        },
      };

      const res = await engine.send(appHandle, "CreateDimension", [prop]);
      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "qlik_list_measures",
    "List all library measures in an app",
    { appId: z.string().describe("Application ID") },
    async ({ appId }) => {
      const appHandle = await engine.openApp(appId);

      const objRes = (await engine.send(appHandle, "CreateSessionObject", [
        {
          qInfo: { qType: "MeasureList" },
          qMeasureListDef: { qType: "measure" },
        },
      ])) as { qReturn: { qHandle: number } };

      const layout = (await engine.send(objRes.qReturn.qHandle, "GetLayout", [])) as {
        qLayout: unknown;
      };

      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(layout.qLayout, null, 2) }] };
    },
  );

  server.tool(
    "qlik_create_measure",
    "Create a reusable library measure with expression in an app",
    {
      appId: z.string().describe("Application ID"),
      title: z.string().describe("Measure title"),
      expression: z.string().describe("Measure expression (e.g. 'Sum(Sales)')"),
      description: z.string().optional().describe("Description"),
    },
    async ({ appId, title, expression, description }) => {
      const appHandle = await engine.openApp(appId);

      const prop = {
        qInfo: { qType: "measure" },
        qMeasure: {
          qLabel: title,
          qDef: expression,
        },
        qMetaDef: {
          title,
          description: description ?? "",
        },
      };

      const res = await engine.send(appHandle, "CreateMeasure", [prop]);
      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  // ---------- Visualization / Sheets ----------

  server.tool(
    "qlik_create_sheet",
    "Create a new empty sheet (dashboard) in an app",
    {
      appId: z.string().describe("Application ID"),
      title: z.string().describe("Sheet title"),
      description: z.string().optional().describe("Sheet description"),
    },
    async ({ appId, title, description }) => {
      const appHandle = await engine.openApp(appId);

      const res = await engine.send(appHandle, "CreateObject", [
        {
          qInfo: { qType: "sheet" },
          qMetaDef: {
            title,
            description: description ?? "",
          },
          cells: [],
          rank: 0,
        },
      ]);

      // Save the app to persist the sheet
      await engine.send(appHandle, "DoSave", []);
      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "qlik_add_chart",
    "Add a visualization (bar, line, pie, table, KPI, etc.) to a sheet",
    {
      appId: z.string().describe("Application ID"),
      sheetId: z.string().describe("Sheet ID to add chart to"),
      chartType: z.enum(["barchart", "linechart", "piechart", "table", "kpi", "scatterplot", "combochart", "treemap", "gauge"]).describe("Chart type"),
      dimensions: z.array(z.string()).describe("Field names for dimensions"),
      measures: z.array(z.string()).describe("Expressions for measures"),
      title: z.string().optional().describe("Chart title"),
    },
    async ({ appId, sheetId, chartType, dimensions, measures, title }) => {
      const appHandle = await engine.openApp(appId);

      // Get sheet object
      const sheetRes = (await engine.send(appHandle, "GetObject", [sheetId])) as {
        qReturn: { qHandle: number };
      };

      const qDimensions = dimensions.map((d) => ({
        qDef: { qFieldDefs: [d] },
      }));
      const qMeasures = measures.map((m) => ({
        qDef: { qDef: m, qLabel: m },
      }));

      // Create the chart as a child of the sheet
      const chartRes = await engine.send(appHandle, "CreateObject", [
        {
          qInfo: { qType: chartType },
          qHyperCubeDef: {
            qDimensions,
            qMeasures,
          },
          qMetaDef: { title: title ?? "" },
          title: title ?? "",
        },
      ]);

      await engine.send(appHandle, "DoSave", []);
      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(chartRes, null, 2) }] };
    },
  );

  server.tool(
    "qlik_add_filter",
    "Add a filter panel to a sheet for user-driven filtering",
    {
      appId: z.string().describe("Application ID"),
      sheetId: z.string().describe("Sheet ID"),
      fieldNames: z.array(z.string()).describe("Field names to include as filters"),
      title: z.string().optional().describe("Filter panel title"),
    },
    async ({ appId, sheetId, fieldNames, title }) => {
      const appHandle = await engine.openApp(appId);

      const children = fieldNames.map((f) => ({
        qListObjectDef: {
          qDef: { qFieldDefs: [f] },
          qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 100 }],
        },
      }));

      const res = await engine.send(appHandle, "CreateObject", [
        {
          qInfo: { qType: "filterpane" },
          qMetaDef: { title: title ?? "Filters" },
          qChildListDef: { qData: { info: "/qListObjectDef" } },
          children,
        },
      ]);

      await engine.send(appHandle, "DoSave", []);
      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );
}
