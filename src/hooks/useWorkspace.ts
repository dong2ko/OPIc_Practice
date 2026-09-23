import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  emptyWorkspace,
  type GuideArticle,
  type ProgressStatus,
  type StudyImportPackage,
  type StudyQuestion,
  type WorkspaceData,
} from "../domain";
import { demoWorkspace } from "../data/demo";
import { selectedImportPayload, sha256Hex } from "../lib/importers";
import { supabase } from "../lib/supabase";

interface SaveQuestionInput {
  id?: string;
  version?: number;
  topicId: string | null;
  title: string;
  prompt: string;
  promptTranslation: string;
  questionType: string;
  questionCode: string;
}

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const PRIVATE_BUCKET = "study-materials";

function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKC").replace(/[^a-zA-Z0-9가-힣._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 120) || "document";
}

export function useWorkspace(session: Session | null) {
  const userId = session?.user.id;
  const [data, setData] = useState<WorkspaceData>(DEMO_MODE ? demoWorkspace : emptyWorkspace);
  const [trash, setTrash] = useState<{ questions: StudyQuestion[]; answers: WorkspaceData["answers"]; guides: GuideArticle[] }>({ questions: [], answers: [], guides: [] });
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (DEMO_MODE) {
      setData(demoWorkspace);
      setLoading(false);
      return;
    }
    if (!supabase || !userId) return;
    setLoading(true);
    setError(null);
    const [topics, questions, answers, expressions, notes, guides, progress, favorites, tags, questionTags, documents, trashedQuestions, trashedAnswers, trashedGuides] = await Promise.all([
      supabase.from("topics").select("*").is("archived_at", null).order("sort_order"),
      supabase.from("questions").select("*").is("archived_at", null).order("updated_at", { ascending: false }),
      supabase.from("answers").select("*").is("archived_at", null).order("sort_order"),
      supabase.from("expressions").select("*").is("archived_at", null).order("created_at"),
      supabase.from("study_notes").select("*").is("archived_at", null).order("updated_at", { ascending: false }),
      supabase.from("guide_articles").select("*").is("archived_at", null).order("sort_order"),
      supabase.from("question_progress").select("*"),
      supabase.from("favorites").select("question_id"),
      supabase.from("tags").select("*").is("archived_at", null).order("name"),
      supabase.from("question_tags").select("question_id,tag_id"),
      supabase.from("source_documents").select("*").is("archived_at", null).order("created_at", { ascending: false }),
      supabase.from("questions").select("*").not("archived_at", "is", null).order("archived_at", { ascending: false }),
      supabase.from("answers").select("*").not("archived_at", "is", null).order("archived_at", { ascending: false }),
      supabase.from("guide_articles").select("*").not("archived_at", "is", null).order("archived_at", { ascending: false }),
    ]);
    const firstError = [topics, questions, answers, expressions, notes, guides, progress, favorites, tags, questionTags, documents, trashedQuestions, trashedAnswers, trashedGuides].find((result) => result.error)?.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    setData({
      topics: (topics.data || []) as unknown as WorkspaceData["topics"],
      questions: (questions.data || []) as unknown as WorkspaceData["questions"],
      answers: (answers.data || []) as unknown as WorkspaceData["answers"],
      expressions: (expressions.data || []) as unknown as WorkspaceData["expressions"],
      notes: (notes.data || []) as unknown as WorkspaceData["notes"],
      guides: (guides.data || []) as unknown as WorkspaceData["guides"],
      progress: (progress.data || []) as unknown as WorkspaceData["progress"],
      favorites: (favorites.data || []) as unknown as WorkspaceData["favorites"],
      tags: (tags.data || []) as unknown as WorkspaceData["tags"],
      questionTags: (questionTags.data || []) as unknown as WorkspaceData["questionTags"],
      documents: (documents.data || []) as unknown as WorkspaceData["documents"],
    });
    setTrash({
      questions: (trashedQuestions.data || []) as unknown as StudyQuestion[],
      answers: (trashedAnswers.data || []) as unknown as WorkspaceData["answers"],
      guides: (trashedGuides.data || []) as unknown as GuideArticle[],
    });
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!DEMO_MODE && !userId) {
      setData(emptyWorkspace);
      setLoading(false);
      setError(null);
      return;
    }
    void load();
  }, [load, userId]);

  const updateStatus = async (questionId: string, status: ProgressStatus) => {
    const previous = data.progress;
    const existing = previous.find((item) => item.question_id === questionId);
    const next = existing
      ? previous.map((item) => item.question_id === questionId ? { ...item, status, practice_count: item.practice_count + 1, last_practiced_at: new Date().toISOString() } : item)
      : [...previous, { question_id: questionId, status, practice_count: 1, last_practiced_at: new Date().toISOString(), version: 1 }];
    setData((current) => ({ ...current, progress: next }));
    if (DEMO_MODE) return setNotice("Preview status updated on this device only.");
    const { error: saveError } = await supabase!.from("question_progress").upsert({
      question_id: questionId,
      status,
      practice_count: (existing?.practice_count || 0) + 1,
      last_practiced_at: new Date().toISOString(),
      version: (existing?.version || 0) + 1,
    }, { onConflict: "owner_id,question_id" });
    if (saveError) {
      setData((current) => ({ ...current, progress: previous }));
      setError(`Progress was not saved: ${saveError.message}`);
    } else setNotice("Progress saved.");
  };

  const toggleFavorite = async (questionId: string) => {
    const isFavorite = data.favorites.some((item) => item.question_id === questionId);
    const previous = data.favorites;
    setData((current) => ({
      ...current,
      favorites: isFavorite ? current.favorites.filter((item) => item.question_id !== questionId) : [...current.favorites, { question_id: questionId }],
    }));
    if (DEMO_MODE) return;
    const result = isFavorite
      ? await supabase!.from("favorites").delete().eq("question_id", questionId)
      : await supabase!.from("favorites").insert({ question_id: questionId });
    if (result.error) {
      setData((current) => ({ ...current, favorites: previous }));
      setError(`Favorite was not saved: ${result.error.message}`);
    }
  };

  const saveNote = async (questionId: string, body: string) => {
    if (DEMO_MODE) {
      const existing = data.notes.find((note) => note.question_id === questionId);
      setData((current) => ({
        ...current,
        notes: existing
          ? current.notes.map((note) => note.id === existing.id ? { ...note, body, version: note.version + 1 } : note)
          : [...current.notes, { id: `demo-note-${questionId}`, question_id: questionId, body, version: 1, archived_at: null, updated_at: new Date().toISOString() }],
      }));
      setNotice("Preview note saved on this device only.");
      return;
    }
    const existing = data.notes.find((note) => note.question_id === questionId);
    if (existing) {
      const { data: saved, error: saveError } = await supabase!
        .from("study_notes")
        .update({ body, version: existing.version + 1 })
        .eq("id", existing.id)
        .eq("version", existing.version)
        .select()
        .maybeSingle();
      if (saveError) throw saveError;
      if (!saved) throw new Error("This note changed in another session. Your text is still in the editor; reload before saving again.");
    } else {
      const { error: saveError } = await supabase!.from("study_notes").insert({ question_id: questionId, body });
      if (saveError) throw saveError;
    }
    setNotice("Note saved.");
    await load();
  };

  const saveQuestion = async (input: SaveQuestionInput) => {
    if (DEMO_MODE) {
      const item: StudyQuestion = {
        id: input.id || `demo-${crypto.randomUUID()}`,
        topic_id: input.topicId,
        question_code: input.questionCode || null,
        title: input.title,
        prompt: input.prompt,
        prompt_translation: input.promptTranslation || null,
        question_type: input.questionType,
        source_filename: "manual-entry",
        source_reference: "Created in preview",
        is_supplement: false,
        version: (input.version || 0) + 1,
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setData((current) => ({ ...current, questions: input.id ? current.questions.map((question) => question.id === input.id ? item : question) : [item, ...current.questions] }));
      setNotice("Preview question saved on this device only.");
      return;
    }
    const record = {
      topic_id: input.topicId,
      question_code: input.questionCode || null,
      title: input.title,
      prompt: input.prompt,
      prompt_translation: input.promptTranslation || null,
      question_type: input.questionType,
    };
    if (input.id) {
      const { data: saved, error: saveError } = await supabase!
        .from("questions")
        .update({ ...record, version: (input.version || 1) + 1 })
        .eq("id", input.id)
        .eq("version", input.version || 1)
        .select()
        .maybeSingle();
      if (saveError) throw saveError;
      if (!saved) throw new Error("This question changed in another session. Copy your edits, reload, and compare before saving.");
    } else {
      const { error: saveError } = await supabase!.from("questions").insert(record);
      if (saveError) throw saveError;
    }
    setNotice("Question saved.");
    await load();
  };

  const archiveQuestion = async (question: StudyQuestion) => {
    if (DEMO_MODE) {
      setData((current) => ({ ...current, questions: current.questions.filter((item) => item.id !== question.id) }));
      setTrash((current) => ({ ...current, questions: [{ ...question, archived_at: new Date().toISOString() }, ...current.questions] }));
      return;
    }
    const { data: saved, error: saveError } = await supabase!
      .from("questions")
      .update({ archived_at: new Date().toISOString(), version: question.version + 1 })
      .eq("id", question.id)
      .eq("version", question.version)
      .select()
      .maybeSingle();
    if (saveError) throw saveError;
    if (!saved) throw new Error("This question changed in another session and was not archived.");
    setNotice("Question moved to trash.");
    await load();
  };

  const saveGuide = async (guide: Partial<GuideArticle> & Pick<GuideArticle, "title" | "body">) => {
    if (DEMO_MODE) {
      setNotice("Guide editing is available after Supabase is connected.");
      return;
    }
    const record = { title: guide.title, body: guide.body, section: guide.section || null };
    if (guide.id) {
      const { data: saved, error: saveError } = await supabase!.from("guide_articles").update({ ...record, version: (guide.version || 1) + 1 }).eq("id", guide.id).eq("version", guide.version || 1).select().maybeSingle();
      if (saveError) throw saveError;
      if (!saved) throw new Error("This guide changed in another session and was not overwritten.");
    } else {
      const { error: saveError } = await supabase!.from("guide_articles").insert(record);
      if (saveError) throw saveError;
    }
    setNotice("Guide saved.");
    await load();
  };

  const archiveGuide = async (guide: GuideArticle) => {
    if (DEMO_MODE) {
      setData((current) => ({ ...current, guides: current.guides.filter((item) => item.id !== guide.id) }));
      setTrash((current) => ({ ...current, guides: [{ ...guide, archived_at: new Date().toISOString() }, ...current.guides] }));
      return;
    }
    const { data: saved, error: saveError } = await supabase!.from("guide_articles").update({ archived_at: new Date().toISOString(), version: guide.version + 1 }).eq("id", guide.id).eq("version", guide.version).select().maybeSingle();
    if (saveError) throw saveError;
    if (!saved) throw new Error("This guide changed in another session and was not archived.");
    setNotice("Guide moved to trash.");
    await load();
  };

  const saveAnswer = async (input: { id?: string; version?: number; questionId: string; label: string; englishText: string; koreanExplanation: string }) => {
    if (DEMO_MODE) {
      const existing = data.answers.find((answer) => answer.id === input.id);
      const item: WorkspaceData["answers"][number] = {
        id: input.id || `demo-answer-${crypto.randomUUID()}`,
        question_id: input.questionId,
        label: input.label,
        english_text: input.englishText,
        korean_explanation: input.koreanExplanation || null,
        sort_order: existing?.sort_order || data.answers.filter((answer) => answer.question_id === input.questionId).length + 1,
        version: (input.version || 0) + 1,
        archived_at: null,
      };
      setData((current) => ({ ...current, answers: input.id ? current.answers.map((answer) => answer.id === input.id ? item : answer) : [...current.answers, item] }));
      setNotice("Preview answer saved on this device only.");
      return;
    }
    const record = {
      question_id: input.questionId,
      label: input.label,
      english_text: input.englishText,
      korean_explanation: input.koreanExplanation || null,
    };
    if (input.id) {
      const { data: saved, error: saveError } = await supabase!.from("answers").update({ ...record, version: (input.version || 1) + 1 }).eq("id", input.id).eq("version", input.version || 1).select().maybeSingle();
      if (saveError) throw saveError;
      if (!saved) throw new Error("This answer changed in another session and was not overwritten.");
    } else {
      const { error: saveError } = await supabase!.from("answers").insert(record);
      if (saveError) throw saveError;
    }
    setNotice("Answer saved.");
    await load();
  };

  const archiveAnswer = async (id: string, version: number) => {
    if (DEMO_MODE) {
      const archived = data.answers.find((answer) => answer.id === id);
      setData((current) => ({ ...current, answers: current.answers.filter((answer) => answer.id !== id) }));
      if (archived) setTrash((current) => ({ ...current, answers: [{ ...archived, archived_at: new Date().toISOString() }, ...current.answers] }));
      return;
    }
    const { data: saved, error: saveError } = await supabase!.from("answers").update({ archived_at: new Date().toISOString(), version: version + 1 }).eq("id", id).eq("version", version).select().maybeSingle();
    if (saveError) throw saveError;
    if (!saved) throw new Error("This answer changed in another session and was not archived.");
    setNotice("Answer moved to trash.");
    await load();
  };

  const restoreArchived = async (table: "questions" | "answers" | "guide_articles", id: string, version: number) => {
    if (DEMO_MODE) {
      setNotice("Restore is available after Supabase is connected.");
      return;
    }
    const { data: restored, error: restoreError } = await supabase!.from(table).update({ archived_at: null, version: version + 1 }).eq("id", id).eq("version", version).select().maybeSingle();
    if (restoreError) throw restoreError;
    if (!restored) throw new Error("This archived item changed in another session and was not restored.");
    setNotice("Item restored from trash.");
    await load();
  };

  const saveTopic = async (name: string, description: string) => {
    if (DEMO_MODE) {
      setNotice("Topic management is available after Supabase is connected.");
      return;
    }
    const { error: saveError } = await supabase!.from("topics").insert({ name, description: description || null, sort_order: data.topics.length + 1 });
    if (saveError) throw saveError;
    setNotice("Topic added.");
    await load();
  };

  const saveTag = async (name: string, color: string) => {
    if (DEMO_MODE) {
      setNotice("Tag management is available after Supabase is connected.");
      return;
    }
    const { error: saveError } = await supabase!.from("tags").insert({ name, color });
    if (saveError) throw saveError;
    setNotice("Tag added.");
    await load();
  };

  const assignTag = async (questionId: string, tagId: string, enabled: boolean) => {
    if (DEMO_MODE) {
      setData((current) => ({
        ...current,
        questionTags: enabled
          ? [...current.questionTags.filter((item) => !(item.question_id === questionId && item.tag_id === tagId)), { question_id: questionId, tag_id: tagId }]
          : current.questionTags.filter((item) => !(item.question_id === questionId && item.tag_id === tagId)),
      }));
      return;
    }
    const result = enabled
      ? await supabase!.from("question_tags").upsert({ question_id: questionId, tag_id: tagId }, { onConflict: "owner_id,question_id,tag_id" })
      : await supabase!.from("question_tags").delete().eq("question_id", questionId).eq("tag_id", tagId);
    if (result.error) throw result.error;
    await load();
  };

  const saveExpression = async (questionId: string, phrase: string, meaning: string) => {
    if (DEMO_MODE) {
      setNotice("Expression management is available after Supabase is connected.");
      return;
    }
    const { error: saveError } = await supabase!.from("expressions").insert({ question_id: questionId, phrase, meaning: meaning || null });
    if (saveError) throw saveError;
    setNotice("Expression added.");
    await load();
  };

  const uploadReference = async (file: File) => {
    if (DEMO_MODE || !session || !supabase) throw new Error("Connect Supabase before uploading private files.");
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["docx", "pdf", "json"].includes(extension)) throw new Error("Only DOCX, PDF, and JSON files are accepted.");
    if (file.size > 25 * 1024 * 1024) throw new Error("Files must be 25 MB or smaller.");
    const buffer = await file.arrayBuffer();
    const hash = await sha256Hex(buffer);
    const path = `${session.user.id}/sources/${hash}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from(PRIVATE_BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
    const { error: recordError } = await supabase.from("source_documents").upsert({
      filename: file.name,
      storage_path: path,
      media_type: file.type || "application/octet-stream",
      byte_size: file.size,
      sha256: hash,
    }, { onConflict: "owner_id,sha256", ignoreDuplicates: true });
    if (recordError) throw recordError;
    setNotice(uploadError ? "The existing private source file was reused." : "Private source file uploaded.");
    await load();
    return { path, hash };
  };

  const importPackage = async (value: StudyImportPackage, originalFile?: File) => {
    if (DEMO_MODE || !supabase) throw new Error("Connect Supabase before importing private materials.");
    if (originalFile) await uploadReference(originalFile);
    const payload = selectedImportPayload(value);
    const { data: result, error: importError } = await supabase.rpc("import_study_package", { package: payload });
    if (importError) throw importError;
    setNotice("Import completed without overwriting existing records.");
    await load();
    return result;
  };

  const createSignedDocumentUrl = async (storagePath: string) => {
    if (!supabase) throw new Error("Supabase is not connected.");
    const { data: signed, error: signedError } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(storagePath, 60);
    if (signedError) throw signedError;
    return signed.signedUrl;
  };

  const exportBackup = async () => {
    if (DEMO_MODE || !supabase) {
      downloadJson("opic-study-demo-backup.json", { schemaVersion: 1, exportedAt: new Date().toISOString(), data, attachments: [] });
      return;
    }
    const attachments: Array<{ path: string; filename: string; mediaType: string; base64: string }> = [];
    for (const document of data.documents) {
      const { data: blob, error: downloadError } = await supabase.storage.from(PRIVATE_BUCKET).download(document.storage_path);
      if (downloadError) throw new Error(`Could not back up ${document.filename}: ${downloadError.message}`);
      attachments.push({ path: document.storage_path, filename: document.filename, mediaType: document.media_type, base64: await blobToBase64(blob) });
    }
    downloadJson(`opic-study-backup-${new Date().toISOString().slice(0, 10)}.json`, { schemaVersion: 1, exportedAt: new Date().toISOString(), data, attachments });
    setNotice("Encrypted transport completed; keep the downloaded backup file private.");
  };

  const restoreBackup = async (file: File) => {
    if (DEMO_MODE || !supabase || !session) throw new Error("Connect Supabase before restoring a backup.");
    if (file.size > 100 * 1024 * 1024) throw new Error("Backups must be 100 MB or smaller.");
    const value = JSON.parse(await file.text()) as { schemaVersion?: number; data?: WorkspaceData; attachments?: Array<{ path: string; filename: string; mediaType: string; base64: string }> };
    if (value.schemaVersion !== 1 || !value.data || !Array.isArray(value.attachments)) throw new Error("Unsupported backup format.");
    const { data: result, error: restoreError } = await supabase.rpc("restore_workspace_backup", { backup: value });
    if (restoreError) throw restoreError;
    for (const attachment of value.attachments) {
      if (!attachment.path.startsWith(`${session.user.id}/`)) continue;
      const binary = Uint8Array.from(atob(attachment.base64), (character) => character.charCodeAt(0));
      const { error: uploadError } = await supabase.storage.from(PRIVATE_BUCKET).upload(attachment.path, binary, { contentType: attachment.mediaType, upsert: false });
      if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw new Error(`Records were restored, but ${attachment.filename} failed: ${uploadError.message}`);
    }
    setNotice("Missing backup records and files were restored. Existing records were not overwritten.");
    await load();
    return result;
  };

  return {
    data,
    trash,
    loading,
    error,
    notice,
    clearError: () => setError(null),
    clearNotice: () => setNotice(null),
    reload: load,
    updateStatus,
    toggleFavorite,
    saveNote,
    saveQuestion,
    archiveQuestion,
    saveGuide,
    archiveGuide,
    saveAnswer,
    archiveAnswer,
    restoreArchived,
    saveTopic,
    saveTag,
    assignTag,
    saveExpression,
    uploadReference,
    importPackage,
    createSignedDocumentUrl,
    exportBackup,
    restoreBackup,
    demoMode: DEMO_MODE,
  };
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.readAsDataURL(blob);
  });
}
