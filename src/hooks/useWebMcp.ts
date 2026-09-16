import { useEffect } from "react";
import type { ProgressStatus, WorkspaceData } from "../domain";

interface WebMcpActions {
  updateStatus: (questionId: string, status: ProgressStatus) => Promise<void>;
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Input must be an object.");
  return value as Record<string, unknown>;
}

export function useWebMcp(data: WorkspaceData, actions: WebMcpActions) {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: WebMcpTool) => {
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined); } catch { /* Unsupported implementations must not break the site. */ }
    };

    register({
      name: "list_study_questions",
      title: "List study questions",
      description: "Search the currently authenticated owner's OPIc questions by optional text, topic, and question type. This reads private user-authored material and does not change it.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", maxLength: 200 },
          topic: { type: "string", maxLength: 120 },
          questionType: { type: "string", maxLength: 120 },
          limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        const value = objectInput(input);
        const query = typeof value.query === "string" ? value.query.toLocaleLowerCase() : "";
        const topic = typeof value.topic === "string" ? value.topic.toLocaleLowerCase() : "";
        const questionType = typeof value.questionType === "string" ? value.questionType.toLocaleLowerCase() : "";
        const limit = Number.isInteger(value.limit) ? Math.min(20, Math.max(1, Number(value.limit))) : 10;
        return data.questions.filter((question) => {
          const topicName = data.topics.find((item) => item.id === question.topic_id)?.name || "";
          return (!query || `${question.title} ${question.prompt}`.toLocaleLowerCase().includes(query))
            && (!topic || topicName.toLocaleLowerCase() === topic)
            && (!questionType || question.question_type.toLocaleLowerCase() === questionType);
        }).slice(0, limit).map((question) => ({
          id: question.id,
          code: question.question_code,
          title: question.title,
          prompt: question.prompt,
          topic: data.topics.find((item) => item.id === question.topic_id)?.name || "Uncategorized",
          questionType: question.question_type,
          status: data.progress.find((item) => item.question_id === question.id)?.status || "not_started",
        }));
      },
    });

    register({
      name: "update_question_progress",
      title: "Update question progress",
      description: "Set the authenticated owner's progress for one existing OPIc question and increment its practice count.",
      inputSchema: {
        type: "object",
        properties: {
          questionId: { type: "string", minLength: 1 },
          status: { type: "string", enum: ["not_started", "practicing", "confident"] },
        },
        required: ["questionId", "status"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const value = objectInput(input);
        if (typeof value.questionId !== "string" || !data.questions.some((item) => item.id === value.questionId)) throw new Error("Unknown questionId.");
        if (!(["not_started", "practicing", "confident"] as unknown[]).includes(value.status)) throw new Error("Invalid progress status.");
        await actions.updateStatus(value.questionId, value.status as ProgressStatus);
        return { questionId: value.questionId, status: value.status, saved: true };
      },
    });

    register({
      name: "start_random_practice",
      title: "Start random practice",
      description: "Open one random question from the authenticated owner's current library in the visible practice interface.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        objectInput(input);
        if (!data.questions.length) throw new Error("No questions are available.");
        const question = data.questions[Math.floor(Math.random() * data.questions.length)];
        window.location.hash = "/library";
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("opic:start-random-practice", { detail: { questionId: question.id } })), 0);
        return { questionId: question.id, title: question.title, opened: true };
      },
    });

    return () => lifecycle.abort();
  }, [data, actions]);
}
