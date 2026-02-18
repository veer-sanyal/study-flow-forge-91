-- Update seed question types with richer user-facing descriptions
UPDATE question_types SET description = 'Pick the single best answer from a list of options. Tests recognition and quick recall of key concepts.'
WHERE name = 'multiple_choice' AND (description IS NULL OR description = '');

UPDATE question_types SET description = 'Calculate or estimate a numerical value. Tests quantitative reasoning and formula application.'
WHERE name = 'numeric' AND (description IS NULL OR description = '');

UPDATE question_types SET description = 'Choose all correct answers from a list. Tests deeper understanding by requiring identification of every valid option.'
WHERE name = 'multi_select' AND (description IS NULL OR description = '');

UPDATE question_types SET description = 'Write a brief free-text response. Tests ability to explain concepts in your own words.'
WHERE name = 'short_answer' AND (description IS NULL OR description = '');

UPDATE question_types SET description = 'Decide whether a statement is correct or incorrect. Tests precise understanding of facts and definitions.'
WHERE name = 'true_false' AND (description IS NULL OR description = '');

UPDATE question_types SET description = 'Supply the missing word or phrase. Tests exact recall of terminology and key details.'
WHERE name = 'fill_blank' AND (description IS NULL OR description = '');
