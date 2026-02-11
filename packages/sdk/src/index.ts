import { z } from "zod";
import { NewsListResponseSchema, NewsBriefSchema } from "@scod/shared";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type NewsBrief = z.infer<typeof NewsBriefSchema>;
export type NewsListResponse = z.infer<typeof NewsListResponseSchema>;

export type CreateNewsInput = {
  title: string;
  contentMd: string;
  source?: "manual" | "cron";
};

export function createApiClient(opts: {
  baseUrl: string;
  apiKey: string;
  fetch?: FetchLike;
}) {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  const fetchImpl: FetchLike = opts.fetch ?? fetch;

  async function request<T>(path: string, init?: RequestInit, parse?: (x: unknown) => T): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${opts.apiKey}`,
      },
    });

    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      // ignore
    }

    if (!res.ok) {
      const msg = typeof (json as any)?.error?.message === "string" ? (json as any).error.message : text;
      throw new Error(`HTTP ${res.status}: ${msg}`);
    }

    const data = json ?? text;
    return parse ? parse(data) : (data as T);
  }

  return {
    health: (): Promise<{ ok: boolean }> => request("/v1/health"),

    listNews: (limit = 20, cursor?: string): Promise<NewsListResponse> =>
      request(
        `/v1/news?limit=${encodeURIComponent(String(limit))}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        undefined,
        (x) => NewsListResponseSchema.parse(x)
      ),

    createNews: (input: CreateNewsInput): Promise<NewsBrief> =>
      request(
        "/v1/news",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        (x) => NewsBriefSchema.parse(x)
      ),
  };
}
