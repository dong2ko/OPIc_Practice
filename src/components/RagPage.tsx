import { useRef, useState, type FormEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface Answer {
  status: "answered";
  workflow: "unified";
  kind: "draft" | "explanation" | "fictional" | "clarification";
  answer: string;
  experienceUsed: string;
  retrievedCount: number;
  sources: { source_id: string; number: number; title: string; content: string; route: string; quote: string; usage: string }[];
}

export function RagPage({ enabled = true }: { enabled?: boolean }) {
  const [question, setQuestion] = useState("");
  const [keywords, setKeywords] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const sourceDetails = useRef<Record<number, HTMLDetailsElement | null>>({});
  const available = enabled && Boolean(supabase);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!available || !supabase || !consent || !question.trim() || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const { data, error: invocationError } = await supabase.functions.invoke<Answer>("ask-materials", {
        body: { question: question.trim(), keywords: keywords.trim(), consent: true },
      });
      if (invocationError) {
        let message = "Could not reach Ask my materials. Check your connection and deploy the ask-materials Edge Function.";
        if (invocationError instanceof FunctionsHttpError) {
          const detail = await invocationError.context.json().catch(() => null);
          if (typeof detail?.error === "string") message = detail.error;
        }
        setError(message);
        return;
      }
      if (!data || data.status !== "answered" || data.workflow !== "unified" ||
          !["draft", "explanation", "fictional", "clarification"].includes(data.kind) ||
          typeof data.answer !== "string" || typeof data.experienceUsed !== "string" ||
          !Number.isInteger(data.retrievedCount) || !Array.isArray(data.sources) ||
          data.sources.some((source) => !source || !Number.isInteger(source.number) ||
            [source.source_id, source.title, source.content, source.quote, source.usage].some((value) => typeof value !== "string"))) {
        setError("The server returned an unexpected answer. Check the Edge Function deployment.");
        return;
      }
      setAnswer(data);
    } catch {
      setError("Could not complete the request. Check your connection and try again later.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <section className="rag-page">
    <div className="page-heading"><div>
      <p className="eyebrow">Gemini · study and practice</p>
      <h1>Ask my materials</h1>
      <p className="lede">Describe your experience and ask for an OPIc answer, new questions, or study advice. See exactly which saved passages Gemini cites.</p>
    </div></div>
    {!available && <p className="inline-message" role="status">AI questions are unavailable in demo mode or without Supabase configuration.</p>}
    <form className="editor-card rag-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <label>Your question<textarea required maxLength={1200} rows={6} value={question} disabled={!available || busy} onChange={(event) => setQuestion(event.target.value)} placeholder="Use the SMART strategy in my materials to write an OPIc answer. My experience: I visited Busan with two friends last summer. Cite the strategy, and don't invent personal details." /></label>
      <p>No mode selection needed. Include your real experience, target level, and desired length. Ask explicitly if you want a fictional example. Each request is independent; previous answers are not sent.</p>
      <details><summary>Search keywords (optional)</summary>
        <label>Search keywords (optional)<input maxLength={200} value={keywords} disabled={!available || busy} onChange={(event) => setKeywords(event.target.value)} placeholder="beach travel 여행" /></label>
        <p>Search uses your prompt unless keywords are supplied. Try SMART to focus on a strategy. This is keyword search, not automatic translation or semantic search. Notes and original attachments are not searched.</p>
      </details>
      <label className="rag-consent"><input type="checkbox" checked={consent} disabled={!available || busy} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to send this question, including experiences I enter, and up to six matching excerpts to Google. Free-tier inputs and outputs may be used to improve Google products and reviewed by humans; I will not include sensitive information.</span></label>
      <p>Up to 20 requests per day (midnight UTC reset), at least 10 seconds apart. Failed and unmatched requests also count. Google quotas may be lower. No chat history is saved by this app.</p>
      <button className="primary-button" disabled={!available || !consent || !question.trim() || busy}>{busy ? "Searching and asking Gemini…" : "Ask Gemini"}</button>
    </form>
    {error && <p className="inline-message error" role="alert">{error}</p>}
    <div aria-live="polite" aria-busy={busy}>
      {answer && <section className="editor-card rag-answer">
        <h2>{{ draft: "Suggested answer", explanation: "Explanation", fictional: "Fictional practice answer", clarification: "More information needed" }[answer.kind]}</h2>
        <div className="rag-answer-text">{answer.answer.split(/(\[\d+\])/g).map((part, index) => {
          const match = /^\[(\d+)\]$/.exec(part);
          const number = match ? Number(match[1]) : null;
          return number !== null && answer.sources.some((source) => source.number === number)
            ? <button key={index} type="button" className="rag-citation" aria-label={`View source ${number}`} onClick={() => {
              const details = sourceDetails.current[number];
              if (details) {
                details.open = true;
                details.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
                details.querySelector("summary")?.focus();
              }
            }}>{part}</button> : part;
        })}</div>
        {answer.experienceUsed && <div><h3>Your experience used (Gemini summary)</h3><p className="rag-answer-text">{answer.experienceUsed}</p><p>This comes from your prompt, not a database citation. Check that the summary is accurate.</p></div>}
        <p>{answer.retrievedCount} passages retrieved · {answer.sources.length} cited. Retrieval alone does not mean a source was used.</p>
        {!answer.sources.length && <p role="status">No database sources were cited. This response is not presented as grounded in your saved materials.</p>}
        {answer.sources.length > 0 && <>
          <p>Source numbers and exact quotes are checked. Gemini's explanation of how it used them can still be wrong; compare the answer with the original.</p>
          <h3>How your database was used</h3>
          {answer.sources.map((source) => <details key={source.source_id} ref={(element) => { sourceDetails.current[source.number] = element; }}>
            <summary tabIndex={0}>[{source.number}] {source.title}</summary>
            <h4>Supporting quote</h4><blockquote>{source.quote}</blockquote>
            <h4>How Gemini applied it</h4><p className="rag-answer-text">{source.usage}</p>
            <h4>Retrieved passage</h4><blockquote>{source.content}</blockquote>
            <a href={source.route === "#/guides" ? "#/guides" : "#/library"}>Open {source.route === "#/guides" ? "study guides" : "question library"}</a>
          </details>)}
        </>}
      </section>}
    </div>
  </section>;
}
