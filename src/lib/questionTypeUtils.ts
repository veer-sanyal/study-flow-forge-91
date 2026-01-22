// Display name mapping for internal question type names
const TYPE_DISPLAY_NAMES: Record<string, string> = {
  'multiple_choice': 'Multiple Choice',
  'numeric': 'Numeric Answer',
  'multi_select': 'Select All That Apply',
  'short_answer': 'Short Response',
  'true_false': 'True/False',
  'fill_blank': 'Fill in the Blank',
};

export function getQuestionTypeDisplayName(internalName: string): string {
  return TYPE_DISPLAY_NAMES[internalName.toLowerCase()] || internalName;
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
