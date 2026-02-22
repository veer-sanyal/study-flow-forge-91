import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Compass,
  BookOpen,
  Shuffle,
  SkipForward,
  Send
} from "lucide-react";

interface PlayerControlsProps {
  isSubmitted: boolean;
  hasSelection: boolean;
  solutionRevealed: boolean;
  hasGuide?: boolean;
  hasSimilar?: boolean;
  onSubmit: () => void;
  onGuideMe: () => void;
  onExplain: () => void;
  onSimilar: () => void;
  onSkip: () => void;
}

export function PlayerControls({
  isSubmitted,
  hasSelection,
  solutionRevealed,
  hasGuide = true,
  hasSimilar = false,
  onSubmit,
  onGuideMe,
  onExplain,
  onSimilar,
  onSkip,
}: PlayerControlsProps) {
  return (
    <div className="space-y-4">
      {/* Primary action */}
      {!isSubmitted && (
        <Button
          size="lg"
          className="w-full gap-2"
          disabled={!hasSelection}
          onClick={onSubmit}
        >
          <Send className="h-4 w-4" />
          Submit Answer
        </Button>
      )}

      {/* Secondary controls — inline text links */}
      <div className="flex items-center justify-center gap-5">
        {hasGuide && (
          <button
            onClick={onGuideMe}
            className="flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground transition-colors"
          >
            <Compass className="h-3.5 w-3.5" />
            Guide
          </button>
        )}
        <button
          onClick={onExplain}
          disabled={!isSubmitted}
          className={cn(
            "flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground transition-colors",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          <BookOpen className="h-3.5 w-3.5" />
          Explain
        </button>
        {hasSimilar && (
          <button
            onClick={onSimilar}
            className="flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground transition-colors"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Similar
          </button>
        )}
        {!isSubmitted && (
          <button
            onClick={onSkip}
            className="flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground transition-colors"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
