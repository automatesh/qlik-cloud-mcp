import WebSocket from "ws";

export interface QlikConfig {
  tenantUrl: string; // e.g. https://x2bsmja3t4khq5z.us.qlikcloud.com
  apiKey: string;
}

// ---------- REST client ----------

export class QlikRestClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: QlikConfig) {
    this.baseUrl = config.tenantUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Qlik API ${method} ${path} → ${res.status}: ${text}`);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  }

  get<T = unknown>(path: string, query?: Record<string, string | number | undefined>) {
    return this.request<T>("GET", path, undefined, query);
  }

  post<T = unknown>(path: string, body?: unknown, query?: Record<string, string | number | undefined>) {
    return this.request<T>("POST", path, body, query);
  }

  put<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, body);
  }

  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }

  delete<T = unknown>(path: string) {
    return this.request<T>("DELETE", path);
  }
}

// ---------- QIX (Engine) WebSocket client ----------

interface QixResponse {
  id: number;
  result?: unknown;
  error?: { code: number; parameter: string; message: string };
}

export class QlikEngineClient {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private baseUrl: string;
  private apiKey: string;

  constructor(config: QlikConfig) {
    this.baseUrl = config.tenantUrl.replace(/^https?:\/\//, "");
    this.apiKey = config.apiKey;
  }

  async openApp(appId: string): Promise<number> {
    await this.connect(appId);
    const res = (await this.send(-1, "OpenDoc", [appId])) as { qReturn: { qHandle: number } };
    return res.qReturn.qHandle;
  }

  async connect(appId: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }

    return new Promise((resolve, reject) => {
      const url = `wss://${this.baseUrl}/app/${appId}`;
      this.ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      this.ws.on("open", () => resolve());
      this.ws.on("error", (err) => reject(err));
      this.ws.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as QixResponse;
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) {
            p.reject(new Error(`QIX error ${msg.error.code}: ${msg.error.message}`));
          } else {
            p.resolve(msg.result);
          }
        }
      });
      this.ws.on("close", () => {
        for (const p of this.pending.values()) {
          p.reject(new Error("WebSocket closed"));
        }
        this.pending.clear();
      });
    });
  }

  send(handle: number, method: string, params: unknown[] = []): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("WebSocket not connected"));
      }
      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          handle,
          method,
          params,
        }),
      );
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
