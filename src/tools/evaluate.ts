import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QlikEngineClient } from "../qlik-client.js";

export function registerEvaluateTools(server: McpServer, engine: QlikEngineClient) {
  server.tool(
    "qlik_evaluate_expression",
    "Evaluate any Qlik expression in an app context (e.g. 'Sum(Sales)', '=Count(distinct ProductID)')",
    {
      appId: z.string().describe("Application ID"),
      expression: z.string().describe("Qlik expression to evaluate (e.g. 'Sum(Sales)')"),
    },
    async ({ appId, expression }) => {
      const appHandle = await engine.openApp(appId);

      const res = (await engine.send(appHandle, "EvaluateEx", [expression])) as {
        qValue: { qText: string; qIsNumeric: boolean; qNumber: number };
      };

      engine.close();

      const result = res.qValue;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                value: result.qText,
                isNumeric: result.qIsNumeric,
                number: result.qNumber,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
