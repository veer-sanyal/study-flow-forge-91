

# Fix Plan: Build Errors, Missing Hooks, and Clear Data Issues

## Issues Identified

### 1. Build Errors - Missing `useAnalyzeMaterial` Hook
**Root Cause:** Two pages (`AdminMaterials.tsx` and `AdminExamsList.tsx`) import `useAnalyzeMaterial` from `@/hooks/use-materials`, but this hook does not exist in the file.

**Files affected:**
- `src/pages/AdminMaterials.tsx` (line 3)
- `src/pages/AdminExamsList.tsx` (line 76)

### 2. Build Errors - Type Mismatches in `use-generate-one-question.ts`
**Root Cause:** 
- Line 166: Accessing `.error` on `GenerateOneQuestionResult`, but that property only exists on the error variant (`GenerateOneQuestionError`)
- Line 276: Inserting `dbQuestion as unknown` which doesn't match the expected insert type

### 3. Clear Data Not Fully Working
**Root Cause:** The `ClearDataCard` deletes data from `srs_state`, `attempts`, `topic_mastery`, and `user_enrollments`, but:
- The "Pick up where you left off" card derives from the `attempts` table - if `attempts` are deleted but the query cache isn't properly refreshed, old data persists
- The "overdue reviews" count comes from `srs_state` - same issue with cache
- The query invalidation keys may not match what the dashboard hook uses (`study-dashboard`)

**Missing invalidation:** The key `study-dashboard` is not being invalidated after clearing data.

### 4. Edge Function Visibility
**Finding:** The `generate-one-question` edge function **does exist** in `supabase/functions/generate-one-question/index.ts` and is configured in `supabase/config.toml`. It should be deployed. The old functions `analyze-material` and `generate-questions` are NOT in the current file listing, suggesting they were already removed.

---

## Fix Plan

### Step 1: Create Missing `useAnalyzeMaterial` Hook
Add the `useAnalyzeMaterial` mutation hook to `src/hooks/use-materials.ts`. This hook should call an edge function or update the material status to trigger analysis.

```typescript
// Add to use-materials.ts
export function useAnalyzeMaterial() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (materialId: string) => {
      // Call the appropriate edge function or update status
      const { error } = await supabase.functions.invoke('process-exam-pdf', {
        body: { materialId }
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-materials"] });
    },
  });
}
```

### Step 2: Fix Type Errors in `use-generate-one-question.ts`
**Line 166:** Use the type guard or check `success` before accessing `error`:
```typescript
} else if (!data.success) {
  generationErrors.push(`Question ${i + 1}: ${(data as GenerateOneQuestionError).error}`);
}
```

**Line 276:** Use proper typing for the insert:
```typescript
const { error: insertError } = await supabase
  .from("questions")
  .insert(dbQuestion as any);  // or properly type the object
```

### Step 3: Fix Clear Data Cache Invalidation
Add `study-dashboard` to the list of invalidated query keys in `ClearDataCard.tsx`:
```typescript
queryClient.invalidateQueries({ queryKey: ['study-dashboard'] });
```

Also ensure we're clearing and refreshing data atomically by using `await queryClient.resetQueries()` for critical keys.

### Step 4: Verify Edge Function Deployment
Trigger a redeployment of `generate-one-question` to ensure it's live.

---

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| `src/hooks/use-materials.ts` | Add `useAnalyzeMaterial` hook |
| `src/hooks/use-generate-one-question.ts` | Fix type error on line 166, fix insert type on line 276 |
| `src/components/settings/ClearDataCard.tsx` | Add `study-dashboard` query invalidation |
| `supabase/functions/generate-one-question/index.ts` | Trigger redeployment (no code changes needed) |

### Query Keys That Need Invalidation After Clear Data
Current:
- `srs-state`, `attempts`, `topic-mastery`, `enrollments`, `user-settings`, `daily-plan`, `study-recommendations`, `progress-stats`, `review-forecast`

Missing:
- `study-dashboard` (powers the "pick up where you left off" and "overdue reviews" UI)

### Edge Function Status
- `generate-one-question` - EXISTS, needs deployment verification
- `analyze-material` - Does NOT exist (may have been renamed/merged)
- `generate-questions` - Does NOT exist (replaced by V5 evidence-based pipeline in `process-exam-pdf`)

