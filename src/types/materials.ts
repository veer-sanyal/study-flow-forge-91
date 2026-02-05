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

/** V1/V2 analysis (legacy pipelines) */
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

/** Union type for all analysis versions */
export type AnyMaterialAnalysis = MaterialAnalysis | MaterialAnalysisV4;

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

// ===== V4 Question-Ready Facts Pipeline Types =====

/** Evidence span linking content to exact source text */
export interface EvidenceSpan {
  span_id: string;  // "e_{chunk_index}_{seq}"
  text: string;     // Exact excerpt <= 50 words
}

/** Atomic fact with evidence grounding */
export interface AtomicFact {
  fact_id: string;  // "f_{chunk_index}_{seq}"
  statement: string;
  fact_type: 'definition' | 'property' | 'relationship' | 'procedure' | 'example' | 'constraint';
  evidence_span_id: string;
}

/** Definition extracted from material */
export interface ChunkDefinition {
  term: string;
  definition: string;
  evidence_span_id: string;
}

/** Formula with complete variable bindings */
export interface ChunkFormula {
  name: string;
  expression: string;  // LaTeX
  variables: { symbol: string; meaning: string; domain: string | null }[];
  conditions: string[];
  evidence_span_id: string;
}

/** Constraint or rule from material */
export interface ChunkConstraint {
  constraint: string;
  context: string;
  evidence_span_id: string;
}

/** Worked example with full solution steps */
export interface WorkedExample {
  problem_statement: string;
  given: { quantity: string; value: string; unit: string | null }[];
  asked: string;
  steps: { step_number: number; action: string; formula_used: string | null; intermediate_result: string | null }[];
  final_answer: string;
  evidence_span_id: string;
}

/** Common misconception for distractor generation */
export interface ChunkMisconception {
  misconception_id: string;  // "m_{chunk_index}_{seq}"
  description: string;
  correct_concept: string;
  evidence_span_id: string;
}

/** V4 Question-Ready Chunk replacing shallow ChunkSummary */
export interface QuestionReadyChunk {
  chunk_index: number;
  chunk_type: 'page' | 'slide';
  summary: string;  // Kept for backward compat

  // QUESTION-READY FACTS
  atomic_facts: AtomicFact[];
  definitions: ChunkDefinition[];
  formulas: ChunkFormula[];
  constraints: ChunkConstraint[];
  worked_examples: WorkedExample[];
  common_misconceptions: ChunkMisconception[];

  // EVIDENCE & GROUNDING
  evidence_spans: EvidenceSpan[];
  key_terms: string[];

  // METADATA
  content_density: 'sparse' | 'normal' | 'dense';
  question_potential: 'low' | 'medium' | 'high';
}

/** Source evidence for grounded questions */
export interface SourceEvidence {
  evidence_span_ids: string[];
  fact_ids: string[];
  page_refs: number[];
}

/** Grounding verification for questions */
export interface GroundingCheck {
  all_facts_cited: boolean;
  uses_material_context: boolean;
  reasoning_steps: number;
}

/** Distractor rationale for MCQ wrong choices */
export interface DistractorRationale {
  choice_id: string;
  rationale_type: 'misconception' | 'computation_error' | 'partial_understanding';
  misconception_id?: string;
  error_description: string;
}

/** V4 Candidate Question with grounding */
export interface CandidateQuestionV4 {
  stem: string;
  type: 'mcq_single' | 'mcq_multi' | 'short_answer';

  // GROUNDING (new required fields)
  source_evidence: SourceEvidence;
  grounding_check: GroundingCheck;

  choices?: { id: string; text: string; is_correct: boolean }[];
  correct_answer: string;
  correct_choice_index?: number;
  solution_steps: string[];
  full_solution: string;
  difficulty: number;
  objective_index: number;

  // MCQ distractor rationales
  distractor_rationales?: DistractorRationale[];
}

/** V4 8-dimension quality flags */
export interface QualityFlagsV4 {
  // Binary (0 = fail, 1 = pass)
  grounded: number;
  answerable_from_context: number;
  has_single_clear_correct: number;
  format_justified: number;

  // Likert (1-5)
  non_trivial: number;
  distractors_plausible: number;
  clarity: number;
  context_authentic: number;

  issues: string[];
  pipeline_version: 4;
  was_repaired: boolean;
}

/** V4 Material Analysis with question-ready chunks */
export interface MaterialAnalysisV4 {
  schema_version: 4;
  course_guess?: {
    course_code: string;
    confidence: number;
    signals: string[];
  };
  lecture_date_guess?: {
    date: string;
    confidence: number;
    reasoning: string;
  };
  question_ready_chunks: QuestionReadyChunk[];
  outline: OutlineSection[];
  topics: AnalyzedTopicV2[];
}

/** Type guard for V4 analysis */
export function isMaterialAnalysisV4(analysis: unknown): analysis is MaterialAnalysisV4 {
  return (
    typeof analysis === 'object' &&
    analysis !== null &&
    'schema_version' in analysis &&
    (analysis as { schema_version: unknown }).schema_version === 4 &&
    'question_ready_chunks' in analysis
  );
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
  /** @deprecated Use `type` instead. Kept for backward compat with v1/v2 pipeline data. */
  answer_format?: 'mcq' | 'numeric' | 'short' | 'multi_select';
  /** v3 pipeline type field */
  type: 'mcq_single' | 'mcq_multi' | 'short_answer';
  choices?: string[];
  correct_answer: string;
  full_solution: string;
  hints: string[];
  common_mistakes: string[];
  tags: string[];
  difficulty: number;
  why_this_question?: string;
}

/** Quality flags stored in questions.quality_flags (v3 pipeline) */
export interface QualityFlags {
  answerable_from_context: number;   // 0 | 1
  has_single_clear_correct: number;  // 0 | 1
  format_justified: number;          // 0 | 1
  distractors_plausible: number;     // 1-5
  clarity: number;                   // 1-5
  difficulty_appropriate: number;    // 1-5
  issues: string[];
  pipeline_version: number;
  was_repaired: boolean;
}

/** Union type for all quality flags versions */
export type AnyQualityFlags = QualityFlags | QualityFlagsV4;

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
