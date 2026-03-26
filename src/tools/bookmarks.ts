import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QlikEngineClient } from "../qlik-client.js";

export function registerBookmarkTools(server: McpServer, engine: QlikEngineClient) {
  server.tool(
    "qlik_list_bookmarks",
    "List all bookmarks in an app",
    { appId: z.string().describe("Application ID") },
    async ({ appId }) => {
      const appHandle = await engine.openApp(appId);

      const objRes = (await engine.send(appHandle, "CreateSessionObject", [
        {
          qInfo: { qType: "BookmarkList" },
          qBookmarkListDef: { qType: "bookmark" },
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
    "qlik_create_bookmark",
    "Create a bookmark that saves the current selection state in an app",
    {
      appId: z.string().describe("Application ID"),
      title: z.string().describe("Bookmark title"),
      description: z.string().optional().describe("Bookmark description"),
    },
    async ({ appId, title, description }) => {
      const appHandle = await engine.openApp(appId);

      const res = await engine.send(appHandle, "CreateBookmark", [
        {
          qInfo: { qType: "bookmark" },
          qMetaDef: {
            title,
            description: description ?? "",
          },
        },
      ]);

      await engine.send(appHandle, "DoSave", []);
      engine.close();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "qlik_apply_bookmark",
    "Apply a bookmark to restore its saved selections",
    {
      appId: z.string().describe("Application ID"),
      bookmarkId: z.string().describe("Bookmark ID to apply"),
    },
    async ({ appId, bookmarkId }) => {
      const appHandle = await engine.openApp(appId);

      await engine.send(appHandle, "ApplyBookmark", [bookmarkId]);

      engine.close();
      return { content: [{ type: "text", text: `Applied bookmark "${bookmarkId}"` }] };
    },
  );

  server.tool(
    "qlik_delete_bookmark",
    "Delete a bookmark from an app",
    {
      appId: z.string().describe("Application ID"),
      bookmarkId: z.string().describe("Bookmark ID to delete"),
    },
    async ({ appId, bookmarkId }) => {
      const appHandle = await engine.openApp(appId);

      const res = (await engine.send(appHandle, "DestroyBookmark", [bookmarkId])) as {
        qReturn: boolean;
      };

      await engine.send(appHandle, "DoSave", []);
      engine.close();
      return {
        content: [
          {
            type: "text",
            text: res.qReturn
              ? `Deleted bookmark "${bookmarkId}"`
              : `Bookmark "${bookmarkId}" not found`,
          },
        ],
      };
    },
  );
}
