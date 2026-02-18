// Display name mapping for internal question type names
const TYPE_DISPLAY_NAMES: Record<string, string> = {
  'multiple_choice': 'Multiple Choice',
  'numeric': 'Numeric Answer',
  'multi_select': 'Select All That Apply',
  'short_answer': 'Short Response',
  'true_false': 'True/False',
  'fill_blank': 'Fill in the Blank',
};

// Human-readable descriptions for each question type
const TYPE_DESCRIPTIONS: Record<string, string> = {
  'multiple_choice': 'Pick the single best answer from a list of options. Tests recognition and quick recall of key concepts.',
  'numeric': 'Calculate or estimate a numerical value. Tests quantitative reasoning and formula application.',
  'multi_select': 'Choose all correct answers from a list. Tests deeper understanding by requiring identification of every valid option.',
  'short_answer': 'Write a brief free-text response. Tests ability to explain concepts in your own words.',
  'true_false': 'Decide whether a statement is correct or incorrect. Tests precise understanding of facts and definitions.',
  'fill_blank': 'Supply the missing word or phrase. Tests exact recall of terminology and key details.',
};

export function getQuestionTypeDisplayName(internalName: string): string {
  return TYPE_DISPLAY_NAMES[internalName.toLowerCase()] || internalName;
}

export function getQuestionTypeDescription(internalName: string): string {
  return TYPE_DESCRIPTIONS[internalName.toLowerCase()] || '';
}

// Get midterm label from midterm number
export function getMidtermLabel(midtermNumber: number | null): string {
  if (midtermNumber === null) return 'Unassigned';
  if (midtermNumber === 0) return 'Final Topics';
  return `Midterm ${midtermNumber}`;
}

// Get exam period label (same but for UI contexts)
export function getExamPeriodLabel(midtermCoverage: number | null): string {
  if (midtermCoverage === null) return 'Uncategorized';
  if (midtermCoverage === 0) return 'Final';
  return `Midterm ${midtermCoverage}`;
}
