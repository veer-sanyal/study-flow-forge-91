-- ============================================
-- Phase 1: Enhanced Question Schema for Robust Grading
-- ============================================

-- Add answer_format enum type (canonical answer formats)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'answer_format') THEN
    CREATE TYPE answer_format AS ENUM (
      'mcq',
      'multi_select', 
      'numeric',
      'expression',
      'short_text',
      'free_response',
      'matching',
      'ordering'
    );
  END IF;
END $$;

-- Add new columns to questions table
ALTER TABLE public.questions 
  ADD COLUMN IF NOT EXISTS answer_format_enum text DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS answer_spec jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS grading_spec jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_locator jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extracted_raw_text text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS render_blocks jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_question_id uuid REFERENCES public.questions(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS edit_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS edited_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone DEFAULT NULL;

-- Add index for parent_question_id for version history queries
CREATE INDEX IF NOT EXISTS idx_questions_parent_id ON public.questions(parent_question_id) WHERE parent_question_id IS NOT NULL;

-- Add index for answer_format filtering
CREATE INDEX IF NOT EXISTS idx_questions_answer_format ON public.questions(answer_format_enum);

-- ============================================
-- COMMENTS documenting the new JSONB schemas
-- ============================================

COMMENT ON COLUMN public.questions.answer_format_enum IS 'Canonical answer format: mcq, multi_select, numeric, expression, short_text, free_response, matching, ordering';

COMMENT ON COLUMN public.questions.answer_spec IS 'Typed correct answer structure. Examples:
MCQ: {"correct_choice_ids": ["c"]}
Multi-select: {"correct_choice_ids": ["b","d"]}
Numeric: {"value": 2.5, "unit": "m/s"}
Expression: {"canonical": "x^2+1", "alt": ["1+x^2"]}
Short text: {"accepted": ["photosynthesis", "photsynthesis"]}
Matching: {"pairs": [["A", "1"], ["B", "2"]]}
Ordering: {"correct_order": ["step1", "step2", "step3"]}';

COMMENT ON COLUMN public.questions.grading_spec IS 'Grading configuration. Structure:
{
  "tolerance_abs": 0.01,
  "tolerance_rel": 0.05,
  "sig_figs": 3,
  "rounding": "round_half_up",
  "units_required": true,
  "units_allowed": ["m/s", "meters per second"],
  "case_sensitive": false,
  "regex_pattern": null,
  "must_simplify": false,
  "allow_pi_symbol": true,
  "partial_credit": true,
  "rubric_items": [
    {"criterion": "Correct setup", "points": 2},
    {"criterion": "Correct calculation", "points": 3}
  ]
}';

COMMENT ON COLUMN public.questions.source_locator IS 'Precise location in source document. Structure:
{
  "page": 7,
  "bboxes": [[x1,y1,x2,y2], ...],
  "rotation": 0,
  "slide": null,
  "shape_ids": null
}';

COMMENT ON COLUMN public.questions.render_blocks IS 'Layout blocks for consistent rendering. Structure:
{
  "blocks": [
    {"type": "stem", "content": "..."},
    {"type": "figure", "url": "...", "caption": "..."},
    {"type": "table", "rows": [...]},
    {"type": "choices", "ref": "choices"}
  ]
}';

COMMENT ON COLUMN public.questions.version IS 'Version number, increments on edit. Start at 1.';
COMMENT ON COLUMN public.questions.parent_question_id IS 'Points to previous version of this question (for edit history).';
COMMENT ON COLUMN public.questions.edit_reason IS 'Explanation for why this version was created.';
COMMENT ON COLUMN public.questions.edited_by IS 'User ID who made this edit.';
COMMENT ON COLUMN public.questions.edited_at IS 'Timestamp of the edit.';