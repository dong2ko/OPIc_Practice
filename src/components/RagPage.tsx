import { useRef, useState, type FormEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface Answer {
  status: "answered" | "insufficient_evidence";
  answer: string;
  sources: { source_id: string; number: number; title: string; content: string; route: string }[];
}

export function RagPage({ enabled = true }: { enabled?: boolean }) {
  const [question, setQuestion] = useState("");
  const [keywords, setKeywords] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
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
      if (!data || !["answered", "insufficient_evidence"].includes(data.status) || typeof data.answer !== "string" || !Array.isArray(data.sources)) {
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
      <p className="eyebrow">Gemini · keyword retrieval</p>
      <h1>Ask my materials</h1>
      <p className="lede">Ask about your saved questions, sample answers, and guides. Answers include excerpts so you can check the sources.</p>
    </div></div>
    {!available && <p className="inline-message" role="status">AI questions are unavailable in demo mode or without Supabase configuration.</p>}
    <form className="editor-card rag-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <label>Your question<textarea required maxLength={1200} rows={4} value={question} disabled={!available || busy} onChange={(event) => setQuestion(event.target.value)} placeholder="Based on my materials, how can I describe a trip to the beach?" /></label>
      <label>Search keywords (optional)<input maxLength={200} value={keywords} disabled={!available || busy} onChange={(event) => setKeywords(event.target.value)} placeholder="beach travel 여행" /></label>
      <p>Use words found in your materials. Keyword search does not automatically translate or understand synonyms. Notes and original attachments are not searched.</p>
      <label className="rag-consent"><input type="checkbox" checked={consent} disabled={!available || busy} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to send this question and up to six matching excerpts to Google. Free-tier inputs and outputs may be used to improve Google products and reviewed by humans; I will not include sensitive information.</span></label>
      <p>Up to 20 requests per day (midnight UTC reset), at least 10 seconds apart. Failed and unmatched requests also count. Google quotas may be lower. No chat history is saved by this app.</p>
      <button className="primary-button" disabled={!available || !consent || !question.trim() || busy}>{busy ? "Searching and asking Gemini…" : "Ask Gemini"}</button>
    </form>
    {error && <p className="inline-message error" role="alert">{error}</p>}
    <div aria-live="polite" aria-busy={busy}>
      {answer && <section className="editor-card rag-answer">
        <h2>{answer.status === "answered" ? "Answer" : "Not enough evidence"}</h2>
        <div className="rag-answer-text">{answer.answer}</div>
        {answer.sources.length > 0 && <>
          <p>AI answers can be wrong. Check each source before relying on the answer.</p>
          <h3>Sources</h3>
          {answer.sources.map((source) => <details key={source.source_id}>
            <summary>[{source.number}] {source.title}</summary>
            <blockquote>{source.content}</blockquote>
            <a href={source.route === "#/guides" ? "#/guides" : "#/library"}>Open {source.route === "#/guides" ? "study guides" : "question library"}</a>
          </details>)}
        </>}
      </section>}
    </div>
  </section>;
}
