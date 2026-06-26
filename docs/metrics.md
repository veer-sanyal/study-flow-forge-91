# Product Metrics: North Star, Metric Tree & Guardrails

This is the measurement spec for the app. It exists because **engagement ≠ learning**:
DAU, sessions, and streaks measure habit, not whether knowledge was acquired (MOOC
learning-analytics studies repeatedly find participation predicts *completion* but not
*achievement*). Every metric here is chosen to proxy real, durable learning and to be
computable from the `attempts` + `srs_state` tables.

Computed by the `get_north_star_metrics(p_user_id, p_enrolled_course_ids)` RPC
(`supabase/migrations/20260625000001_north_star_metrics_rpc.sql`), surfaced by
`NorthStarCard` on the Progress page.

## North Star Metric (NSM)

> **Weekly count of items reaching _durable mastery_ per learner** — a question answered
> correctly this week that *also* had a prior correct answer **≥ 7 days earlier**.

Why this one:
- It is an **outcome**, not an input — you can't move it directly by adding a button,
  which is exactly the test of a good NSM (Amplitude / John Cutler).
- "Correct again after a ≥7-day gap" is **spaced-retrieval success at delay** — the
  best-evidenced behavioral signal of durable learning (Roediger & Karpicke; Adesope
  2017; Yang 2021).
- It mirrors Khan Academy's **"skills to proficient"**, which correlates with external
  test gains and *demotes* skills when later performance drops — i.e. it credits
  **retained** mastery, not one-time clicks.

Explicitly rejected NSMs (vanity traps): DAU, questions answered, streak length,
time-on-app.

## Metric Tree (NSM → input metrics)

Inputs chosen by Amplitude's breadth / depth / frequency / efficiency heuristic. Each is
something the product/recommender can actually move.

| Input | Definition (this week) | Lever |
|---|---|---|
| **Topic breadth** | distinct topics with ≥1 attempt | recommend wider coverage, not one topic |
| **New-item accuracy** (depth) | first-attempt correctness on brand-new questions | difficulty targeting, scaffolding (Guide Me) |
| **Promotion rate** (depth) | correctness on *repeat* (review) attempts | spacing schedule, re-test timing |
| **Review-completion rate** (frequency) | reviews done ÷ (reviews done + currently overdue) | due-date nudges, daily plan sizing |

(First-durable-mastery within 7 days of signup is the natural **activation** metric to add
once there's onboarding instrumentation.)

## Guardrail Metrics

Counter-metrics that must not degrade while we push the NSM. Thresholds are starting
points — calibrate against real data.

| Guardrail | Definition | Trips when | Guards against |
|---|---|---|---|
| **Cram rate** | share of attempts taking <8s | > 30% | speed-running / gaming the count |
| **Confident-wrong rate** | confidence=3 & incorrect, ÷ rated attempts | > 20% | illusory knowing; also a hypercorrection targeting signal |
| **30-day retention** | accuracy on items last seen ≥30d ago | < target retention (0.85) | mastery that doesn't actually stick |
| **Max topic share** | share of attempts on the single most-practiced topic | > 60% | NSM gains concentrated in a few easy topics |
| **Active days / attempts** | distinct active days; total attempts | context only | burnout (ballooning load) vs. healthy distribution |

## Calibration knobs (not settled science)

- **7-day** durable-mastery gap and **30-day** retention window are heuristics — tune
  against delayed-quiz outcomes if/when collected.
- The **0.85** target retention is a single source of truth in `src/lib/fsrs.ts`
  (`TARGET_RETENTION`); it feeds scheduling, risk classification, and these metrics.
- Guardrail thresholds (30% / 20% / 60%) are first guesses.

## What we deliberately did NOT build

Per the research, these would be over-engineering with no learning-gain payoff:
- **ML knowledge tracing (DKT/BKT)** — does not beat good heuristics on *learning gains*
  (only on next-step prediction AUC). Kept the heuristic recommender.
- A fixed **"85% success" target** — that rule is specific to gradient-trained
  classifiers/perceptual tasks, not conceptual learning. Difficulty stays per-user
  adaptive (±1 band + Bridge catch-up).
- A precise **new:review ratio** or **session-length** optimum — both under-determined in
  the literature; not worth hardcoding a false precision.
