import type {
  ImportGuideCandidate,
  ImportQuestionCandidate,
  StudyImportPackage,
} from "../domain";

const MAX_DOCX_BYTES = 25 * 1024 * 1024;
const MAX_JSON_BYTES = 50 * 1024 * 1024;

function clean(value: string | null | undefined): string {
  return (value || "").replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseQuestionHeading(text: string) {
  const match = text.match(/^([A-Z]?Q?\d+)\s*[|·-]\s*([^|·]+?)(?:\s*[|·]\s*(.+))?$/i);
  if (!match) return { code: null, type: "Unclassified", title: text, review: "Question heading could not be parsed reliably." };
  return {
    code: clean(match[1]),
    type: clean(match[2]),
    title: clean(match[3]) || clean(match[2]),
    review: null,
  };
}

function prefixedValue(lines: string[], prefix: string): string {
  const line = lines.find((value) => value.startsWith(prefix));
  return line ? clean(line.slice(prefix.length)) : "";
}

function splitExpressions(value: string): Array<{ phrase: string; meaning: string | null }> {
  if (!value) return [];
  return value
    .split(/\s*\/\s*/)
    .map((part) => {
      const [phrase, meaning] = part.split(/\s*=\s*/, 2);
      return { phrase: clean(phrase), meaning: clean(meaning) || null };
    })
    .filter((entry) => entry.phrase.length > 0);
}

function finalizeQuestion(
  heading: string,
  topic: string,
  sourceFilename: string,
  paragraphs: Array<{ kind: string; text: string }>,
  index: number,
): ImportQuestionCandidate {
  const parsed = parseQuestionHeading(heading);
  const questions = paragraphs.filter((item) => item.kind === "question").map((item) => item.text);
  const answerLines = paragraphs.filter((item) => item.kind === "answer").map((item) => item.text);
  const analysis = paragraphs.filter((item) => item.kind === "analysis").map((item) => item.text);
  const small = paragraphs.filter((item) => item.kind === "small").map((item) => item.text);
  const promptTranslation = small.find((line) => line.startsWith("English translation"));
  const sourceReference = small.find((line) => /^(원자료 문항|추가·재구성 문항|Source)/i.test(line));
  const explanationParts = [
    prefixedValue(analysis, "질문 의도"),
    prefixedValue(analysis, "구조 분석"),
    prefixedValue(analysis, "말하기 큐"),
    prefixedValue(analysis, "주의할 점"),
  ].filter(Boolean);
  const reviewReasons = [parsed.review].filter((item): item is string => Boolean(item));
  if (!questions.length) reviewReasons.push("No Question-style paragraph was found.");
  if (!answerLines.length) reviewReasons.push("No answer was found; it will remain marked as missing.");
  if (!sourceReference) reviewReasons.push("No source reference was detected.");
  if (questions.length > 1) reviewReasons.push("Multiple question paragraphs were preserved and should be reviewed as possible subquestions.");

  return {
    clientId: `question-${index + 1}`,
    selected: true,
    topic: clean(topic) || "Uncategorized",
    questionCode: parsed.code,
    title: parsed.title,
    prompt: questions.join("\n\n"),
    promptTranslation: promptTranslation ? clean(promptTranslation.replace(/^English translation\s*/i, "")) : null,
    questionType: parsed.type,
    sourceReference: sourceReference || null,
    isSupplement: Boolean(sourceReference?.includes("추가·재구성") || /supplement/i.test(sourceReference || "")),
    answers: answerLines.length
      ? [{ label: "Model answer", englishText: answerLines.join("\n\n"), koreanExplanation: explanationParts.join("\n\n") }]
      : [],
    expressions: splitExpressions(prefixedValue(analysis, "재사용 표현")),
    notes: [prefixedValue(analysis, "내용 근거"), prefixedValue(analysis, "MP")].filter(Boolean),
    reviewReasons,
  };
}

export function parseStudyGuideHtml(html: string, sourceFilename: string, sha256: string, messages: string[] = []): StudyImportPackage {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const elements = Array.from(documentNode.body.querySelectorAll(":scope > *"));
  const questions: ImportQuestionCandidate[] = [];
  const guides: ImportGuideCandidate[] = [];
  let section = "";
  let topic = "";
  let questionHeading = "";
  let questionParagraphs: Array<{ kind: string; text: string }> = [];
  let guideTitle = "";
  let guideParagraphs: string[] = [];

  const flushGuide = () => {
    const body = clean(guideParagraphs.join("\n\n"));
    if (guideTitle && body) {
      guides.push({
        clientId: `guide-${guides.length + 1}`,
        selected: true,
        title: guideTitle,
        section: section || null,
        body,
        sourceReference: `Section: ${[section, guideTitle].filter(Boolean).join(" / ")}`,
        reviewReasons: [],
      });
    }
    guideParagraphs = [];
  };

  const flushQuestion = () => {
    if (!questionHeading) return;
    questions.push(finalizeQuestion(questionHeading, topic, sourceFilename, questionParagraphs, questions.length));
    questionHeading = "";
    questionParagraphs = [];
  };

  for (const element of elements) {
    const text = clean(element.textContent);
    if (!text) continue;
    const tag = element.tagName.toLowerCase();
    if (tag === "h1") {
      flushQuestion();
      flushGuide();
      section = text;
      topic = "";
      guideTitle = text;
      continue;
    }
    if (tag === "h2") {
      flushQuestion();
      flushGuide();
      topic = text;
      guideTitle = text;
      continue;
    }
    if (tag === "h3") {
      flushQuestion();
      flushGuide();
      questionHeading = text;
      continue;
    }
    if (questionHeading) {
      const className = element.className;
      const kind = className.includes("question")
        ? "question"
        : className.includes("answer")
          ? "answer"
          : className.includes("analysis")
            ? "analysis"
            : className.includes("small")
              ? "small"
              : "other";
      questionParagraphs.push({ kind, text });
    } else {
      guideParagraphs.push(text);
    }
  }
  flushQuestion();
  flushGuide();

  const promptGroups = new Map<string, number>();
  questions.forEach((question) => {
    const key = question.prompt.toLocaleLowerCase().replace(/[^a-z0-9가-힣]+/g, " ").trim();
    if (key) promptGroups.set(key, (promptGroups.get(key) || 0) + 1);
  });
  questions.forEach((question) => {
    const key = question.prompt.toLocaleLowerCase().replace(/[^a-z0-9가-힣]+/g, " ").trim();
    if (key && (promptGroups.get(key) || 0) > 1) question.reviewReasons.push("Possible duplicate prompt in this import.");
  });

  const reviewCount = questions.filter((item) => item.reviewReasons.length).length + guides.filter((item) => item.reviewReasons.length).length;
  const extractedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    source: { filename: sourceFilename, sha256, extractedAt },
    inventory: {
      sourceFilename,
      sha256,
      extractedAt,
      paragraphCount: documentNode.body.querySelectorAll("p").length,
      tableCount: documentNode.body.querySelectorAll("table").length,
      embeddedImageCount: documentNode.body.querySelectorAll("img").length,
      questionCount: questions.length,
      guideCount: guides.length,
      selectedCount: questions.length + guides.length,
      reviewCount,
      notConverted: ["Comments and tracked-change metadata are not imported.", "PDF text and OCR are not extracted."],
      messages,
    },
    questions,
    guides,
  };
}

export async function parseDocxFile(file: File): Promise<StudyImportPackage> {
  if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("Choose a DOCX file.");
  if (file.size > MAX_DOCX_BYTES) throw new Error("DOCX files must be 25 MB or smaller.");
  const arrayBuffer = await file.arrayBuffer();
  const sha256 = await sha256Hex(arrayBuffer);
  const { default: mammoth } = await import("mammoth/mammoth.browser");
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1.document-title:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Question'] => p.question:fresh",
        "p[style-name='Answer'] => p.answer:fresh",
        "p[style-name='Analysis'] => p.analysis:fresh",
        "p[style-name='Small'] => p.small:fresh",
        "p[style-name='Caption'] => p.caption:fresh",
      ],
      includeDefaultStyleMap: true,
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "", alt: "Image omitted from preview" })),
    },
  );
  return parseStudyGuideHtml(result.value, file.name, sha256, result.messages.map((message) => `${message.type}: ${message.message}`));
}

export async function parseJsonFile(file: File): Promise<StudyImportPackage> {
  if (!file.name.toLowerCase().endsWith(".json")) throw new Error("Choose a JSON backup or import file.");
  if (file.size > MAX_JSON_BYTES) throw new Error("JSON files must be 50 MB or smaller.");
  const value = JSON.parse(await file.text()) as Partial<StudyImportPackage>;
  if (value.schemaVersion !== 1 || !Array.isArray(value.questions) || !Array.isArray(value.guides) || !value.source || !value.inventory) {
    throw new Error("This is not a supported OPIc Study Studio import package.");
  }
  return value as StudyImportPackage;
}

export function selectedImportPayload(value: StudyImportPackage) {
  const questions = value.questions.filter((item) => item.selected);
  const guides = value.guides.filter((item) => item.selected);
  return {
    ...value,
    inventory: { ...value.inventory, selectedCount: questions.length + guides.length },
    questions,
    guides,
  };
}
