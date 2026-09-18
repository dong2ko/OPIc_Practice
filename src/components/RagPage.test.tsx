import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { RagPage } from "./RagPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke } } }));
afterEach(cleanup);
beforeEach(() => { invoke.mockReset(); });

function ask() {
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Describe my trip" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Ask Gemini" }));
}

describe("RagPage", () => {
  it("requires question and explicit data-processing consent", () => {
    render(<RagPage />);
    const button = screen.getByRole("button", { name: "Ask Gemini" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Describe my trip" } });
    expect(button).toBeDisabled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("disables AI calls in demo mode", () => {
    render(<RagPage enabled={false} />);
    expect(screen.getByLabelText("Your question")).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ask Gemini" })).toBeDisabled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("shows plain-text answers and inspectable citations", async () => {
    invoke.mockResolvedValue({ data: { status: "answered", answer: "Beach trip [1] <script>test</script>", sources: [{ source_id: "synthetic", number: 1, title: "Trip", content: "I went to the beach.", route: "#/library" }] }, error: null });
    render(<RagPage />);
    fireEvent.change(screen.getByLabelText("Search keywords (optional)"), { target: { value: "beach 여행" } });
    ask();
    expect(await screen.findByText("Beach trip [1] <script>test</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("[1] Trip")).toBeInTheDocument();
    fireEvent.click(screen.getByText("[1] Trip"));
    expect(screen.getByText("I went to the beach.")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("ask-materials", { body: { question: "Describe my trip", keywords: "beach 여행", consent: true } });
  });

  it("displays insufficient evidence without invented sources", async () => {
    invoke.mockResolvedValue({ data: { status: "insufficient_evidence", answer: "Try different keywords.", sources: [] }, error: null });
    render(<RagPage />);
    ask();
    expect(await screen.findByText("Not enough evidence")).toBeInTheDocument();
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
  });

  it("shows actionable Edge Function errors", async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: "Gemini quota exhausted." }), { status: 429 })) });
    render(<RagPage />);
    ask();
    expect(await screen.findByRole("alert")).toHaveTextContent("Gemini quota exhausted.");
    expect(screen.getByRole("button", { name: "Ask Gemini" })).toBeEnabled();
  });

  it("prevents duplicate submissions while waiting", async () => {
    let resolve!: (value: unknown) => void;
    invoke.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<RagPage />);
    ask();
    expect(screen.getByRole("button", { name: "Searching and asking Gemini…" })).toBeDisabled();
    expect(invoke).toHaveBeenCalledTimes(1);
    resolve({ data: null, error: new Error("network") });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach");
  });
});
