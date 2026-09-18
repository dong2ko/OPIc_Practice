// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createAskHandler, type MaterialsBackend } from "../../supabase/functions/ask-materials/handler";

const source = { source_id: "question:synthetic:1", title: "Beach travel", content: "I went to the beach.", route: "#/library" };
const validAnswer = { supported: true, answer: "You went to the beach [1].", citations: [1] };
const input = { question: "Describe my beach trip", consent: true };

function geminiResponse(value: unknown = validAnswer) {
  return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] });
}

function setup(overrides: Partial<MaterialsBackend> = {}, apiKey: string | undefined = "synthetic-test-key") {
  const backend = {
    authenticate: vi.fn(async () => true),
    isOwner: vi.fn(async () => true),
    search: vi.fn(async () => [source]),
    consumeQuota: vi.fn(async () => true),
    ...overrides,
  };
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => geminiResponse());
  const handler = createAskHandler({ apiKey, backend: () => backend, fetch });
  const post = (body: unknown = input, authorization = "Bearer synthetic-session") => handler(new Request("https://example.test/ask-materials", {
    method: "POST", headers: { authorization }, body: JSON.stringify(body),
  }));
  return { backend, fetch, handler, post };
}

describe("Ask my materials backend", () => {
  it("allows browser preflight without authentication", async () => {
    const { handler, backend } = setup();
    const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(backend.authenticate).not.toHaveBeenCalled();
  });

  it("rejects other methods", async () => {
    const { handler } = setup();
    expect((await handler(new Request("https://example.test"))).status).toBe(405);
  });

  it("rejects missing bearer tokens before accessing data", async () => {
    const { post, backend, fetch } = setup();
    expect((await post(input, "")).status).toBe(401);
    expect(backend.authenticate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid session", { authenticate: async () => false }, 401],
    ["unapproved user", { isOwner: async () => false }, 403],
    ["exhausted app quota", { consumeQuota: async () => false }, 429],
  ] as const)("rejects %s before retrieval or Gemini", async (_name, overrides, status) => {
    const { post, backend, fetch } = setup(overrides);
    expect((await post()).status).toBe(status);
    expect(backend.search).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { question: "   ", consent: true },
    { question: "x".repeat(1201), consent: true },
    { ...input, keywords: "x".repeat(201) },
    { ...input, consent: false },
  ])("validates input and consent: %j", async (body) => {
    const { post, fetch, backend } = setup();
    expect((await post(body)).status).toBe(400);
    expect(backend.consumeQuota).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds request bytes", async () => {
    const { post, fetch } = setup();
    expect((await post({ ...input, extra: "x".repeat(8192) })).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("explains missing secret without spending quota", async () => {
    const { post, backend } = setup({}, "");
    const response = await post();
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("GEMINI_API_KEY");
    expect(backend.consumeQuota).not.toHaveBeenCalled();
  });

  it("does not call Gemini when search finds nothing", async () => {
    const { post, fetch } = setup({ search: async () => [] });
    const response = await post();
    expect(await response.json()).toMatchObject({ status: "insufficient_evidence", sources: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses server-retrieved sources, keywords and a server-only API key", async () => {
    const { post, fetch, backend } = setup();
    const response = await post({ ...input, keywords: " beach 여행 ", sources: [{ content: "Untrusted client override" }] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "answered", answer: validAnswer.answer, sources: [{ ...source, number: 1 }] });
    expect(backend.search).toHaveBeenCalledWith("beach 여행");
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain("gemini-2.5-flash-lite:generateContent");
    expect(url).not.toContain("synthetic-test-key");
    expect(options?.headers).toMatchObject({ "x-goog-api-key": "synthetic-test-key" });
    const sent = JSON.parse(String(options?.body));
    expect(JSON.parse(sent.contents[0].parts[0].text)).toEqual({ question: input.question, excerpts: [{ number: 1, title: source.title, text: source.content }] });
  });

  it("bounds excerpt count and size", async () => {
    const { post, fetch } = setup({ search: async () => Array.from({ length: 8 }, () => ({ ...source, content: "x".repeat(5000) })) });
    await post();
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    const { excerpts } = JSON.parse(body.contents[0].parts[0].text);
    expect(excerpts).toHaveLength(6);
    expect(excerpts.every((item: { text: string }) => item.text.length === 1800)).toBe(true);
  });

  it.each([
    { ...validAnswer, citations: [99] },
    { ...validAnswer, citations: [] },
    { ...validAnswer, citations: ["1"] },
    { ...validAnswer, answer: "Unsupported [2]" },
    { ...validAnswer, answer: "No citation" },
    null,
  ])("rejects malformed answers or fabricated citations: %j", async (answer) => {
    const { post, fetch } = setup();
    fetch.mockResolvedValue(geminiResponse(answer));
    expect((await post()).status).toBe(502);
  });

  it("refuses when Gemini finds insufficient evidence", async () => {
    const { post, fetch } = setup();
    fetch.mockResolvedValue(geminiResponse({ supported: false, answer: "invented text", citations: [] }));
    expect(await (await post()).json()).toMatchObject({ status: "insufficient_evidence", sources: [] });
  });

  it("handles truncated and non-JSON model output", async () => {
    for (const value of [
      { candidates: [{ finishReason: "MAX_TOKENS" }] },
      { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } }] },
    ]) {
      const { post, fetch } = setup();
      fetch.mockResolvedValue(Response.json(value));
      expect((await post()).status).toBe(502);
    }
  });

  it.each([[429, 429], [403, 502], [500, 502]])("sanitizes upstream status %i", async (upstream, expected) => {
    const { post, fetch } = setup();
    fetch.mockResolvedValue(new Response("PRIVATE ERROR DETAILS", { status: upstream }));
    const response = await post();
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toContain("PRIVATE ERROR DETAILS");
  });

  it("handles timeouts without leaking upstream errors", async () => {
    const { post, fetch } = setup();
    fetch.mockRejectedValue(new DOMException("PRIVATE ERROR DETAILS", "TimeoutError"));
    expect((await post()).status).toBe(504);
  });

  it("fails closed when the database is unavailable", async () => {
    const { post, fetch } = setup({ consumeQuota: async () => { throw new Error("PRIVATE ERROR DETAILS"); } });
    const response = await post();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("PRIVATE ERROR DETAILS");
    expect(fetch).not.toHaveBeenCalled();
  });
});
