# Frontend Design Skill

This skill guides all visual design and styling for Study Flow Forge.

---

## Typography

### Font Family
- Primary: Inter (via CSS variable)
- Fallback: system-ui, sans-serif
- Code: JetBrains Mono or monospace

### Font Sizes (Tailwind Classes)
| Use Case | Class | Size | Line Height |
|----------|-------|------|-------------|
| Display | `text-h1` | var(--text-h1) | var(--leading-h1) |
| Title | `text-h2` | var(--text-h2) | var(--leading-h2) |
| Subtitle | `text-h3` | var(--text-h3) | var(--leading-h3) |
| Body | `text-body` | var(--text-body) | var(--leading-body) |
| Meta/Caption | `text-meta` | var(--text-meta) | var(--leading-meta) |

### Typography Patterns
```tsx
// Page title
<h1 className="text-h1 font-bold tracking-tight">Dashboard</h1>

// Section title
<h2 className="text-h2 font-semibold">Today's Plan</h2>

// Card title
<h3 className="text-h3 font-medium">Topic Mastery</h3>

// Body text
<p className="text-body text-foreground">Regular content here.</p>

// Muted/secondary text
<p className="text-meta text-muted-foreground">Last updated 2 hours ago</p>
```

---

## Color System

### Brand Colors (Amber Accent)
```tsx
// Primary actions
className="bg-primary text-primary-foreground"

// Hover state
className="hover:bg-primary/90"

// Subtle background
className="bg-primary/10 text-primary"

// Glow effect (cards, focus)
className="shadow-[0_0_20px_hsl(var(--primary-glow))]"
```

### Neutral Palette (Slate)
```tsx
// Background layers
className="bg-background"     // Page background
className="bg-surface"        // Elevated surface
className="bg-raised"         // Cards, modals
className="bg-elevated"       // Dropdowns, popovers

// Text colors
className="text-foreground"        // Primary text
className="text-muted-foreground"  // Secondary text

// Borders
className="border-border"          // Default border
className="border-input"           // Form inputs
```

### Semantic Colors
```tsx
// Success (correct answers, completed)
className="bg-success text-success-foreground"
className="text-success"

// Warning (hints, caution)
className="bg-warning text-warning-foreground"
className="text-warning"

// Destructive (errors, wrong answers)
className="bg-destructive text-destructive-foreground"
className="text-destructive"
```

### Color Guidelines
- Avoid pure black (`#000`); use `slate-900` or `foreground`
- Ensure WCAG 2.1 AA contrast (4.5:1 for text)
- Use amber sparingly for emphasis
- Keep UI mostly neutral with accent highlights

---

## Spacing Scale

### Tailwind Spacing
| Class | Size | Use Case |
|-------|------|----------|
| `p-1` / `m-1` | 4px | Tight spacing, icons |
| `p-2` / `m-2` | 8px | Button padding, compact |
| `p-3` / `m-3` | 12px | Form inputs |
| `p-4` / `m-4` | 16px | Standard spacing |
| `p-6` / `m-6` | 24px | Card padding |
| `p-8` / `m-8` | 32px | Section gaps |
| `p-12` / `m-12` | 48px | Page sections |
| `p-16` / `m-16` | 64px | Major sections |

### Card Patterns
```tsx
// Standard card
<Card className="p-6">
  <CardContent className="space-y-4">
    {/* Content */}
  </CardContent>
</Card>

// Compact card
<Card className="p-4">
  <CardContent className="space-y-2">
    {/* Compact content */}
  </CardContent>
</Card>

// Section card with header
<Card>
  <CardHeader className="pb-4">
    <CardTitle>Section Title</CardTitle>
  </CardHeader>
  <CardContent className="pt-0">
    {/* Content */}
  </CardContent>
</Card>
```

### Gap Patterns
```tsx
// Vertical stack
<div className="space-y-4">

// Horizontal row
<div className="flex items-center gap-2">

// Grid with gap
<div className="grid grid-cols-2 gap-4">
```

---

## Elevation System

### Surface Layers
```tsx
// Level 0: Page background
className="bg-background"

// Level 1: Content surface
className="bg-surface shadow-surface"

// Level 2: Cards, raised elements
className="bg-raised shadow-raised"

// Level 3: Modals, dropdowns
className="bg-elevated shadow-elevated"
```

### Shadow Tokens
```css
--shadow-surface: 0 1px 2px rgba(0,0,0,0.05);
--shadow-raised: 0 2px 4px rgba(0,0,0,0.1);
--shadow-elevated: 0 4px 12px rgba(0,0,0,0.15);
```

---

## Motion Guidelines

### When to Animate
- Page transitions (route changes)
- Modal/drawer open/close
- Accordion expand/collapse
- Hover states on interactive elements
- Loading states

### When NOT to Animate
- Every button click
- Text content changes
- Form validation errors
- Data table updates
- Frequent state changes

### Timing
```tsx
// Fast (hover, focus)
className="transition-colors duration-150"

// Standard (modal, drawer)
className="transition-all duration-200"

// Slow (page transitions)
className="transition-all duration-300"
```

### Reduced Motion Support
```tsx
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export function AnimatedComponent() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className={prefersReducedMotion ? '' : 'animate-fade-in'}>
      {/* Content */}
    </div>
  );
}
```

Or via CSS:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Animation Patterns
```tsx
// Accordion (built-in)
className="animate-accordion-down"
className="animate-accordion-up"

// Fade in
className="animate-in fade-in duration-200"

// Slide in
className="animate-in slide-in-from-bottom-4 duration-300"
```

---

## Responsive Breakpoints

### Mobile-First Pattern
```tsx
// Base (mobile) → sm → md → lg → xl → 2xl
<div className="
  grid grid-cols-1      // Mobile: single column
  sm:grid-cols-2        // 640px+: 2 columns
  lg:grid-cols-3        // 1024px+: 3 columns
  xl:grid-cols-4        // 1280px+: 4 columns
">
```

### Breakpoint Values
| Prefix | Min Width | Typical Device |
|--------|-----------|----------------|
| (none) | 0px | Mobile |
| `sm:` | 640px | Large phone / small tablet |
| `md:` | 768px | Tablet |
| `lg:` | 1024px | Laptop |
| `xl:` | 1280px | Desktop |
| `2xl:` | 1400px | Large desktop |

### Responsive Patterns
```tsx
// Hide on mobile, show on desktop
className="hidden md:block"

// Show on mobile, hide on desktop
className="block md:hidden"

// Responsive padding
className="px-4 md:px-6 lg:px-8"

// Responsive text
className="text-sm md:text-base lg:text-lg"
```

---

## Component Styling Decision Tree

1. **Is it a UI primitive (button, input, card)?**
   → Use ShadCN component from `src/components/ui/`

2. **Need custom styling on UI component?**
   → Use `className` prop with Tailwind
   ```tsx
   <Button className="w-full">Submit</Button>
   ```

3. **Need conditional styling?**
   → Use `cn()` utility
   ```tsx
   <div className={cn(
     'p-4 rounded-lg',
     isActive && 'bg-primary/10 border-primary',
     isDisabled && 'opacity-50 cursor-not-allowed'
   )}>
   ```

4. **Need variant styling?**
   → Use component variants (built into ShadCN)
   ```tsx
   <Button variant="destructive">Delete</Button>
   <Badge variant="secondary">Draft</Badge>
   ```

5. **Need animation?**
   → Use Tailwind animation utilities or `tailwindcss-animate`

---

## Icon Usage

### Library
Use Lucide React icons:
```tsx
import { Check, X, ChevronDown, Loader2 } from 'lucide-react';
```

### Sizing
```tsx
// Small (inline, buttons)
<Check className="h-4 w-4" />

// Medium (standalone)
<Check className="h-5 w-5" />

// Large (hero, empty states)
<Check className="h-8 w-8" />
```

### With Text
```tsx
<Button>
  <Check className="h-4 w-4 mr-2" />
  Save
</Button>
```

---

## Anti-Patterns

1. **Don't use inline styles**
```tsx
// Bad
<div style={{ padding: '16px' }}>

// Good
<div className="p-4">
```

2. **Don't create custom colors**
```tsx
// Bad
className="text-[#ff5500]"

// Good
className="text-primary"
```

3. **Don't skip responsive design**
```tsx
// Bad
<div className="grid grid-cols-4">

// Good
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
```

4. **Don't animate everything**
```tsx
// Bad
<div className="transition-all animate-pulse hover:animate-bounce">

// Good
<div className="transition-colors hover:bg-accent">
```

5. **Don't use arbitrary values**
```tsx
// Bad
className="p-[13px] text-[15px]"

// Good
className="p-3 text-sm"
```
