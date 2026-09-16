export type ProgressStatus = "not_started" | "practicing" | "confident";

export interface Topic {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  version: number;
  archived_at: string | null;
}

export interface StudyQuestion {
  id: string;
  topic_id: string | null;
  question_code: string | null;
  title: string;
  prompt: string;
  prompt_translation: string | null;
  question_type: string;
  source_filename: string | null;
  source_reference: string | null;
  is_supplement: boolean;
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SampleAnswer {
  id: string;
  question_id: string;
  label: string;
  english_text: string;
  korean_explanation: string | null;
  sort_order: number;
  version: number;
  archived_at: string | null;
}

export interface Expression {
  id: string;
  question_id: string | null;
  phrase: string;
  meaning: string | null;
  usage_note: string | null;
  version: number;
  archived_at: string | null;
}

export interface StudyNote {
  id: string;
  question_id: string | null;
  body: string;
  version: number;
  archived_at: string | null;
  updated_at: string;
}

export interface GuideArticle {
  id: string;
  title: string;
  section: string | null;
  body: string;
  source_filename: string | null;
  source_reference: string | null;
  sort_order: number;
  version: number;
  archived_at: string | null;
  updated_at: string;
}

export interface QuestionProgress {
  question_id: string;
  status: ProgressStatus;
  practice_count: number;
  last_practiced_at: string | null;
  version: number;
}

export interface Favorite {
  question_id: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  version: number;
  archived_at: string | null;
}

export interface QuestionTag {
  question_id: string;
  tag_id: string;
}

export interface SourceDocument {
  id: string;
  filename: string;
  storage_path: string;
  media_type: string;
  byte_size: number;
  sha256: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface WorkspaceData {
  topics: Topic[];
  questions: StudyQuestion[];
  answers: SampleAnswer[];
  expressions: Expression[];
  notes: StudyNote[];
  guides: GuideArticle[];
  progress: QuestionProgress[];
  favorites: Favorite[];
  tags: Tag[];
  questionTags: QuestionTag[];
  documents: SourceDocument[];
}

export interface ImportAnswerCandidate {
  label: string;
  englishText: string;
  koreanExplanation: string;
}

export interface ImportQuestionCandidate {
  clientId: string;
  selected: boolean;
  topic: string;
  questionCode: string | null;
  title: string;
  prompt: string;
  promptTranslation: string | null;
  questionType: string;
  sourceReference: string | null;
  isSupplement: boolean;
  answers: ImportAnswerCandidate[];
  expressions: Array<{ phrase: string; meaning: string | null }>;
  notes: string[];
  reviewReasons: string[];
}

export interface ImportGuideCandidate {
  clientId: string;
  selected: boolean;
  title: string;
  section: string | null;
  body: string;
  sourceReference: string | null;
  reviewReasons: string[];
}

export interface ImportInventory {
  sourceFilename: string;
  sha256: string;
  extractedAt: string;
  paragraphCount: number;
  tableCount: number;
  embeddedImageCount: number;
  questionCount: number;
  guideCount: number;
  selectedCount: number;
  reviewCount: number;
  notConverted: string[];
  messages: string[];
}

export interface StudyImportPackage {
  schemaVersion: 1;
  source: { filename: string; sha256: string; extractedAt: string };
  inventory: ImportInventory;
  questions: ImportQuestionCandidate[];
  guides: ImportGuideCandidate[];
}

export const emptyWorkspace: WorkspaceData = {
  topics: [],
  questions: [],
  answers: [],
  expressions: [],
  notes: [],
  guides: [],
  progress: [],
  favorites: [],
  tags: [],
  questionTags: [],
  documents: [],
};
