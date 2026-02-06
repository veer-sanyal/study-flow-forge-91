const fs = require('fs');
const path = require('path');

const dir = 'supabase/migrations';
console.log(`Scanning ${dir}...`);
const files = fs.readdirSync(dir).sort();

const counts = {};

files.forEach(file => {
    if (!file.endsWith('.sql')) return;

    // Match exactly 8 digits at start followed by underscore
    // This avoids matching 14-digit timestamps
    const match = file.match(/^(\d{8})_/);
    if (match) {
        const datePart = match[1];
        if (!counts[datePart]) counts[datePart] = 0;
        counts[datePart]++;

        const sequence = counts[datePart];
        // Append HHMMSS. e.g. 000001, 000002. Use sequence for seconds.
        // This ensures unique versions while preserving alphabetical order relative to each other.
        const timePart = sequence.toString().padStart(6, '0');

        // We replace "YYYYMMDD_" with "YYYYMMDDHHMMSS_"
        // But wait, "20260130_foo.sql" -> "20260130000001_foo.sql"
        // Regex replace is safe.
        const newName = file.replace(datePart + '_', datePart + timePart + '_');

        console.log(`Renaming ${file} -> ${newName}`);
        fs.renameSync(path.join(dir, file), path.join(dir, newName));
    }
});
console.log('Renaming complete.');
