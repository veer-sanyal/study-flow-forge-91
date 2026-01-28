# Blueprint: Ingest Material (Deduped)
Goal: Add PDFs/slides without wasting Gemini credits.

Steps:
1) Hash file
2) Check Supabase for existing source_hash
3) If exists → link + stop
4) Else → create source_material + extraction_job (pending)
5) Extract (Gemini) → store normalized questions + provenance
6) Mark job complete/fail

Edge cases:
- Huge PDFs → chunk and map chunks
- Re-uploads with new name → hash catches it
- Invalid model JSON → one repair retry then fail job
