import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { RagPage } from "./RagPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke } } }));
afterEach(cleanup);
beforeEach(() => { invoke.mockReset(); });

const answer = { status: "answered", workflow: "unified", kind: "draft", answer: "A suggested answer.", experienceUsed: "", retrievedCount: 0, sources: [] };

function ask() {
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Describe my trip" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Ask Gemini" }));
}

describe("RagPage", () => {
  it("uses one prompt without mode selection and labels fictional responses", async () => {
    invoke.mockResolvedValue({ data: { ...answer, kind: "fictional", answer: "Fictional practice: I went hiking." }, error: null });
    render(<RagPage />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    ask();
    expect(await screen.findByText("Fictional practice answer")).toBeInTheDocument();
    expect(screen.getByText(/No database sources were cited/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("ask-materials", { body: { question: "Describe my trip", keywords: "", consent: true } });
  });

  it("rejects old backend responses and asks for deployment", async () => {
    invoke.mockResolvedValue({ data: { status: "insufficient_evidence", answer: "Old backend", sources: [] }, error: null });
    render(<RagPage />);
    ask();
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the Edge Function deployment");
  });
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
    invoke.mockResolvedValue({ data: { ...answer, answer: "Beach trip [1] <script>test</script>", experienceUsed: "A trip with two friends.", retrievedCount: 3, sources: [{ source_id: "synthetic", number: 1, title: "Trip", content: "I went to the beach.", quote: "the beach", usage: "Used the past-tense pattern for the user's trip.", route: "#/library" }] }, error: null });
    render(<RagPage />);
    fireEvent.change(screen.getByLabelText("Search keywords (optional)"), { target: { value: "beach 여행" } });
    ask();
    const citation = await screen.findByRole("button", { name: "View source 1" });
    expect(citation.parentElement).toHaveTextContent("Beach trip [1] <script>test</script>");
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("[1] Trip")).toBeInTheDocument();
    const details = screen.getByText("[1] Trip").closest("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(citation);
    expect(details.open).toBe(true);
    expect(screen.getByText("[1] Trip")).toHaveFocus();
    expect(screen.getByText("I went to the beach.")).toBeInTheDocument();
    expect(screen.getByText("the beach")).toBeInTheDocument();
    expect(screen.getByText("Used the past-tense pattern for the user's trip.")).toBeInTheDocument();
    expect(screen.getByText("A trip with two friends.")).toBeInTheDocument();
    expect(screen.getByText(/3 passages retrieved · 1 cited/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("ask-materials", { body: { question: "Describe my trip", keywords: "beach 여행", consent: true } });
  });

  it("displays clarification without invented sources", async () => {
    invoke.mockResolvedValue({ data: { ...answer, kind: "clarification", answer: "Please supply the SMART strategy." }, error: null });
    render(<RagPage />);
    ask();
    expect(await screen.findByText("More information needed")).toBeInTheDocument();
    expect(screen.queryByText("How your database was used")).not.toBeInTheDocument();
    expect(screen.getByText(/No database sources were cited/)).toBeInTheDocument();
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
