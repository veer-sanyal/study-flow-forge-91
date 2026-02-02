# Daily FSRS Maintenance Function

This edge function runs daily to:
1. Update FSRS `elapsed_days` based on time passage (even when users don't submit questions)
2. Update topic `scheduled_date` from calendar events

## Setup

### Option 1: Supabase Cron (Recommended)

Add this to your Supabase dashboard under Database > Cron Jobs:

```sql
-- Run daily at 2 AM UTC
SELECT cron.schedule(
  'daily-fsrs-maintenance',
  '0 2 * * *', -- 2 AM UTC daily
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-fsrs-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### Option 2: External Cron Service

Use a service like:
- GitHub Actions (scheduled workflow)
- Vercel Cron
- AWS EventBridge
- Any cron service that can call HTTP endpoints

Call: `POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-fsrs-maintenance`

With header: `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`

## What It Does

1. **FSRS Recalculation**: Updates `elapsed_days` for all SRS states based on time since `last_reviewed_at`
2. **Topic Date Updates**: Updates `scheduled_date` for topics based on calendar events

## Manual Execution

You can also call it manually:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-fsrs-maintenance \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```
