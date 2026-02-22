# Study Hub — Interface Design System

## Direction
"Lecture Room + Editorial Pipeline." Serious, organized, paper-like warmth.
Cream page background. White cards that lift off it. Old Gold for primary actions only.
Every status signal uses semantic color — never decoration.

## Palette (all CSS vars from index.css)
- Page background: `bg-background` (40 25% 96%) — warm cream
- Cards: `bg-surface border border-border` + `shadow-surface`
- Brand/CTA: `text-primary` / `bg-primary` (Old Gold, 42 68% 52%) — CTAs and active states only
- Published/success: `text-success` / `bg-success` (142 71% 40%)
- Needs attention: `text-warning` / `bg-warning` (32 95% 44%)
- Urgent: `text-destructive` / `bg-destructive` (0 72% 51%)
- Secondary text: `text-muted-foreground` (220 10% 40%)

## Depth strategy: Subtle shadows + border on cards
- Standard card: `bg-surface border border-border shadow-surface rounded-xl overflow-hidden`
- Hover: `hover:shadow-raised transition-shadow duration-200`
- Popovers/dialogs: `shadow-elevated` (handled by shadcn defaults)
- NO mixed approaches — never shadows + strong borders together, never border-0 + heavy shadow

## Spacing
- Base: 4px. Grid: 4, 8, 12, 16, 20, 24, 32, 48px.
- Card padding: `p-4` (16px all sides)
- Section gaps: `gap-3` (12px) within cards, `gap-6` (24px) between grid items

## Typography
- Page h1: `text-2xl font-bold tracking-tight`
- Card title: `font-semibold text-sm leading-snug line-clamp-2`
- Stat number: `text-lg font-bold leading-none tabular-nums`
- Stat label: `text-[10px] text-muted-foreground uppercase tracking-wide`
- Body text: `text-sm text-foreground`
- Supporting: `text-xs text-muted-foreground`

## Card anatomy (canonical pattern)
```
rounded-xl overflow-hidden bg-surface border border-border shadow-surface
├── Status strip: h-1 (bg-success when live, bg-border when draft, bg-warning when needing attention)
├── CardContent p-4 flex flex-col gap-3
│   ├── Header row: title (font-semibold text-sm line-clamp-2 flex-1) + badge (shrink-0)
│   ├── Supporting text (text-xs text-muted-foreground, optional)
│   ├── Stats: tabular-nums bold numbers + text-[10px] uppercase labels, w-px dividers
│   ├── Signature element (per-page — health bar, urgency number, etc.)
│   ├── Callout strip (conditional): bg-warning/10 border-warning/20 when action needed
│   └── Action row: primary Button flex-1 + icon DropdownMenuTrigger
```

## Badge conventions
- Live/Published: `bg-success/10 text-success border border-success/20`
- Draft/Unpublished: `bg-muted text-muted-foreground border border-border`
- Warning/Needs work: `bg-warning/10 text-warning border border-warning/20`
- Destructive: `bg-destructive/10 text-destructive border border-destructive/20`

## Signature element — Editorial health bar (Admin Courses)
```tsx
{course.questionCount > 0 && (
  <div className="space-y-1">
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all",
          course.needsReviewCount === 0 ? "bg-success" : "bg-warning"
        )}
        style={{ width: `${Math.round(((course.questionCount - course.needsReviewCount) / course.questionCount) * 100)}%` }}
      />
    </div>
    <p className="text-[10px] text-muted-foreground">
      {course.questionCount - course.needsReviewCount} of {course.questionCount} approved
    </p>
  </div>
)}
```

## Signature element — Session Progress Dots (Study)
```tsx
<div className="flex flex-wrap gap-1 py-2 px-4">
  {Array.from({ length: totalQuestions }).map((_, i) => (
    <button key={i} onClick={() => onNavigate?.(i)}
      className={cn("w-2.5 h-2.5 rounded-full transition-all",
        i === currentIndex && "ring-2 ring-primary/40 bg-primary",
        outcomes[i] === 'correct' && "bg-success",
        outcomes[i] === 'incorrect' && "bg-destructive",
        outcomes[i] === 'skipped' && "bg-muted-foreground/40",
        !outcomes[i] && i !== currentIndex && "bg-muted border border-border"
      )}
    />
  ))}
</div>
```
One dot per question. Outcome visible at a glance. Clickable to navigate. Reused read-only in CompletionCard.

## Phase scope
- Phase 1 (complete): Admin Courses — card system established, health bar signature
- Phase 2 (complete): Study.tsx + StudyFocus.tsx — session progress dots, token fixes, white course cards
- Phase 3: Progress.tsx, Settings.tsx
