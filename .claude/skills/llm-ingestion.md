# LLM Ingestion Skill (Gemini)
- Deduplicate by file hash BEFORE spending tokens
- Store provenance: source id + page ranges + model version
- Force strict JSON outputs; retry once with repair prompt
- Fail gracefully; store job failure with trace id
