/**
 * analysis-schema.ts — Runtime validation for MaterialAnalysis at the
 * boundary between Phase 2 (analyze-material) and Phase 3 (generate-questions).
 *
 * Validates both schema_version 2 (legacy) and schema_version 3 (two-call pipeline).
 * Ensures the analysis_json blob has the expected shape before we feed it
 * into prompt construction.
 */

import type { MaterialAnalysis } from "./prompts.ts";

interface ValidationError {
  path: string;
  message: string;
}

/**
 * Validate an analysis_json blob against schema_version 2 or 3 shape.
 * Returns { valid: true, data } on success, { valid: false, errors } on failure.
 */
export function validateAnalysisSchema(
  raw: unknown,
): { valid: true; data: MaterialAnalysis } | { valid: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (typeof raw !== "object" || raw === null) {
    return { valid: false, errors: [{ path: "root", message: "analysis_json must be a non-null object" }] };
  }

  const obj = raw as Record<string, unknown>;

  // schema_version
  if (typeof obj.schema_version !== "number" || obj.schema_version < 2) {
    errors.push({
      path: "schema_version",
      message: `Expected schema_version >= 2, got ${JSON.stringify(obj.schema_version)}`,
    });
  }

  // course_type
  const validCourseTypes = [
    "stem_quantitative",
    "stem_conceptual",
    "humanities",
    "social_science",
    "applied_professional",
  ];
  if (typeof obj.course_type !== "string" || obj.course_type.length === 0) {
    errors.push({ path: "course_type", message: "course_type must be a non-empty string" });
  } else if (!validCourseTypes.includes(obj.course_type)) {
    // Warn but don't fail — Gemini may produce new values
    console.warn(
      `[analysis-schema] Unexpected course_type "${obj.course_type}". Expected one of: ${validCourseTypes.join(", ")}`,
    );
  }

  // topics
  if (!Array.isArray(obj.topics) || obj.topics.length === 0) {
    errors.push({ path: "topics", message: "topics must be a non-empty array" });
  } else {
    for (let i = 0; i < obj.topics.length; i++) {
      const topic = obj.topics[i] as Record<string, unknown>;
      if (typeof topic !== "object" || topic === null) {
        errors.push({ path: `topics[${i}]`, message: "each topic must be an object" });
        continue;
      }
      if (typeof topic.name !== "string" || topic.name.length === 0) {
        errors.push({ path: `topics[${i}].name`, message: "topic name must be a non-empty string" });
      }
      if (!Array.isArray(topic.subtopics)) {
        errors.push({ path: `topics[${i}].subtopics`, message: "subtopics must be an array" });
      }
      if (typeof topic.density !== "string") {
        errors.push({ path: `topics[${i}].density`, message: "density must be a string" });
      }
      // cognitive_levels required for both v2 and v3
      if (!Array.isArray(topic.cognitive_levels)) {
        errors.push({ path: `topics[${i}].cognitive_levels`, message: "cognitive_levels must be an array" });
      }
    }
  }

  // total_pages
  if (typeof obj.total_pages !== "number" || obj.total_pages <= 0) {
    errors.push({ path: "total_pages", message: "total_pages must be a positive number" });
  }

  // recommended_question_count
  if (typeof obj.recommended_question_count !== "number" || obj.recommended_question_count <= 0) {
    errors.push({
      path: "recommended_question_count",
      message: "recommended_question_count must be a positive number",
    });
  }

  // key_formulas, key_terms — arrays of strings (can be empty)
  for (const field of ["key_formulas", "key_terms"] as const) {
    if (obj[field] !== undefined && !Array.isArray(obj[field])) {
      errors.push({ path: field, message: `${field} must be an array if present` });
    }
  }

  // worked_examples — array of { description, page }
  if (obj.worked_examples !== undefined) {
    if (!Array.isArray(obj.worked_examples)) {
      errors.push({ path: "worked_examples", message: "worked_examples must be an array" });
    } else {
      for (let i = 0; i < obj.worked_examples.length; i++) {
        const ex = obj.worked_examples[i] as Record<string, unknown>;
        if (typeof ex?.description !== "string") {
          errors.push({ path: `worked_examples[${i}].description`, message: "must be a string" });
        }
        if (typeof ex?.page !== "number") {
          errors.push({ path: `worked_examples[${i}].page`, message: "must be a number" });
        }
      }
    }
  }

  // construct_map — v2: array of strings, v3: array of {claim, conditions, evidence}
  if (obj.construct_map !== undefined && !Array.isArray(obj.construct_map)) {
    errors.push({ path: "construct_map", message: "construct_map must be an array if present" });
  }

  // v3-specific: test_spec (optional, only present in v3)
  if (obj.schema_version === 3 && obj.test_spec !== undefined) {
    if (typeof obj.test_spec !== "object" || obj.test_spec === null) {
      errors.push({ path: "test_spec", message: "test_spec must be an object if present" });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: raw as MaterialAnalysis };
}
