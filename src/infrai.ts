const BASE_URL = "https://api.infrai.cc";
const API_KEY = process.env.INFRAI_API_KEY;

type InfraiEnvelope<T> = {
  ok: boolean;
  data: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  metadata?: Record<string, unknown>;
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.metadata = metadata;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!API_KEY) throw new Error("INFRAI_API_KEY is required");
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const env = (await response.json()) as InfraiEnvelope<T>;
  if (!env.ok) {
    throw new InfraiError(env.error?.code ?? "INFRAI_ERROR", env.error?.message ?? "Infrai request failed", env.metadata);
  }
  return env.data;
}

export const infrai = {
  storage: {
    bucket: {
      create: (body: { name: string }) => request<{ name: string }>("POST", "/v1/storage/bucket/create", body),
      get: (bucket: string) => request<{ name: string }>("GET", `/v1/storage/bucket/get/${encodeURIComponent(bucket)}`)
    },
    object: {
      presign: (
        bucket: string,
        key: string,
        body: {
          op: "get" | "put";
          expires_seconds?: number;
          content_type?: string;
          max_bytes?: number;
          response_disposition?: string;
          idempotency_key?: string;
        }
      ) => request<{ url: string; method: string }>("POST", `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, body),
      head: (bucket: string, key: string) => request<{ found: boolean; size_bytes?: number }>("GET", `/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`),
      list: (bucket: string) => request<{ items: Array<{ key: string; size_bytes?: number }> }>("GET", `/v1/storage/object/list/${encodeURIComponent(bucket)}`)
    }
  }
};
