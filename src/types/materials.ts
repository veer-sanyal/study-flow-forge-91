// Course Materials Types

export type MaterialType = 'exam_pdf' | 'lecture_pdf' | 'lecture_pptx' | 'lecture_notes_text';

export type MaterialStatus = 
  | 'uploaded' 
  | 'analyzing' 
  | 'analyzed' 
  | 'generating_questions' 
  | 'ready' 
  | 'published'
  | 'failed';

export interface CourseMaterial {
  id: string;
  course_pack_id: string;
  edition_id: string | null;
  material_type: MaterialType;
  title: string;
  storage_path: string;
  file_name: string;
  sha256: string;
  content_fingerprint: string | null;
  status: MaterialStatus;
  analysis_json: MaterialAnalysis | unknown | null;
  error_message: string | null;
  topics_extracted_count: number;
  questions_generated_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseEdition {
  id: string;
  course_pack_id: string;
  term: string | null;
  instructor: string | null;
  section: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialChunk {
  id: string;
  material_id: string;
  chunk_index: number;
  chunk_type: 'page' | 'slide';
  text: string;
  title_hint: string | null;
  created_at: string;
}

export interface Objective {
  id: string;
  topic_id: string;
  objective_text: string;
  source_material_id: string | null;
  created_at: string;
}

// Analysis JSON structure from Gemini

/** V1 analysis (legacy single-call pipeline) */
export interface MaterialAnalysis {
  schema_version?: 1 | 2;
  course_guess?: {
    course_code: string;
    confidence: number;
    signals: string[];
  };
  topics: AnalyzedTopic[];
  /** V2 fields — absent on v1 */
  chunk_summaries?: ChunkSummary[];
  outline?: OutlineSection[];
}

export interface AnalyzedTopic {
  topic_code: string | null;
  title: string;
  description: string;
  difficulty_estimate: number;
  recommended_question_types: string[];
  objectives: string[];
  prerequisites: string[];
  supporting_chunks: number[];
}

// --- V2 enriched analysis types ---

export interface OutlineSection {
  section_title: string;
  page_range: [number, number];
  subtopics: string[];
}

export interface ChunkSummary {
  chunk_index: number;
  chunk_type: 'page' | 'slide';
  summary: string;
  key_terms: string[];
}

export interface KeyTerm {
  term: string;
  definition: string;
  page_ref: number | null;
}

export interface Formula {
  name: string;
  expression: string;
  context: string;
}

export interface Misconception {
  description: string;
  correct_concept: string;
}

export interface ExampleQuestion {
  stem: string;
  expected_answer_type: string;
  difficulty: number;
}

export interface QuestionTypeDistribution {
  type: string;
  proportion: number;
}

/** V2 enriched topic with difficulty evidence, question seeds, type distribution */
export interface AnalyzedTopicV2 extends AnalyzedTopic {
  difficulty_rationale: string;
  difficulty_signals: string[];
  key_terms: KeyTerm[];
  formulas: Formula[];
  common_misconceptions: Misconception[];
  example_questions: ExampleQuestion[];
  question_type_distribution: QuestionTypeDistribution[];
}

/** Type guard: check if a topic has v2 enrichments */
export function isAnalyzedTopicV2(topic: AnalyzedTopic): topic is AnalyzedTopicV2 {
  return 'difficulty_rationale' in topic && 'key_terms' in topic;
}

// Question generation request
export interface QuestionGenerationRequest {
  course_pack_id: string;
  edition_id?: string;
  topic_ids: string[];
  question_type_ids: string[];
  difficulty_range: [number, number];
  quantity_per_bucket: number;
  generate_variants?: boolean;
}

// Generated question from Gemini
export interface GeneratedQuestion {
  stem: string;
  answer_format: 'mcq' | 'numeric' | 'short' | 'multi_select';
  choices?: string[];
  correct_answer: string;
  full_solution: string;
  hints: string[];
  common_mistakes: string[];
  tags: string[];
  difficulty: number;
}

// Material status display helpers
export const MATERIAL_STATUS_CONFIG: Record<MaterialStatus, { label: string; color: string }> = {
  uploaded: { label: 'Uploaded', color: 'bg-gray-500' },
  analyzing: { label: 'Analyzing...', color: 'bg-yellow-500' },
  analyzed: { label: 'Analyzed', color: 'bg-blue-500' },
  generating_questions: { label: 'Generating...', color: 'bg-purple-500' },
  ready: { label: 'Ready', color: 'bg-green-500' },
  published: { label: 'Published', color: 'bg-emerald-600' },
  failed: { label: 'Failed', color: 'bg-red-500' },
};

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  exam_pdf: 'Exam PDF',
  lecture_pdf: 'Lecture PDF',
  lecture_pptx: 'Lecture PPTX',
  lecture_notes_text: 'Lecture Notes',
};
