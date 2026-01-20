import { Button } from "@/components/ui/button";
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

      {/* Secondary controls - always visible */}
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-col h-auto py-3 gap-1"
          onClick={onGuideMe}
        >
          <Compass className="h-4 w-4" />
          <span className="text-xs">Guide</span>
        </Button>

        <Button
          variant={solutionRevealed ? "secondary" : "outline"}
          size="sm"
          className="flex-col h-auto py-3 gap-1"
          onClick={onExplain}
          disabled={!isSubmitted}
        >
          <BookOpen className="h-4 w-4" />
          <span className="text-xs">Explain</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="flex-col h-auto py-3 gap-1"
          onClick={onSimilar}
        >
          <Shuffle className="h-4 w-4" />
          <span className="text-xs">Similar</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="flex-col h-auto py-3 gap-1"
          onClick={onSkip}
        >
          <SkipForward className="h-4 w-4" />
          <span className="text-xs">Skip</span>
        </Button>
      </div>
    </div>
  );
}
