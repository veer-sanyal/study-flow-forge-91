import { useState } from "react";
import { Loader2 } from "lucide-react";

interface ChoiceImageProps {
  src: string;
  alt?: string;
  isProcessing?: boolean;
  className?: string;
}

/**
 * Displays a choice image with:
 * 1. Dark mode inversion for line drawings
 * 2. Loading state
 * 3. Error handling
 */
export function ChoiceImage({ 
  src, 
  alt = "Choice image", 
  isProcessing = false,
  className = ""
}: ChoiceImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return null;
  }

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {(isProcessing || isLoading) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <img 
        src={src} 
        alt={alt}
        className={`max-h-20 object-contain transition-opacity duration-200
          dark:invert dark:brightness-90 dark:contrast-110
          ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </div>
  );
}
