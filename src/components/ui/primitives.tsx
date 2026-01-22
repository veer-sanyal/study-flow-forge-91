import { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ============================================
// STAT CARD - For displaying metrics/stats
// ============================================

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  trendValue,
  className,
  size = "md",
}: StatCardProps) {
  const sizeClasses = {
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  const valueSizes = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-3xl",
  };

  return (
    <div
      className={cn(
        "rounded-xl bg-surface shadow-surface border border-border/50",
        sizeClasses[size],
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-meta text-muted-foreground">{label}</p>
          <p className={cn("font-bold tabular-nums", valueSizes[size])}>
            {value}
          </p>
          {trendValue && (
            <p
              className={cn("text-meta", {
                "text-success": trend === "up",
                "text-destructive": trend === "down",
                "text-muted-foreground": trend === "neutral",
              })}
            >
              {trend === "up" && "↑ "}
              {trend === "down" && "↓ "}
              {trendValue}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// SURFACE CARD - General purpose elevated card
// ============================================

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  elevation?: "surface" | "raised" | "elevated";
  padding?: "none" | "sm" | "md" | "lg";
  onClick?: () => void;
  hoverable?: boolean;
}

export function SurfaceCard({
  children,
  className,
  elevation = "surface",
  padding = "md",
  onClick,
  hoverable = false,
}: SurfaceCardProps) {
  const elevationClasses = {
    surface: "bg-surface shadow-surface",
    raised: "bg-raised shadow-raised",
    elevated: "bg-elevated shadow-elevated",
  };

  const paddingClasses = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 transition-all",
        elevationClasses[elevation],
        paddingClasses[padding],
        hoverable && "cursor-pointer hover:border-primary/30 hover:shadow-raised",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ============================================
// STICKY ACTIONS - Bottom action bar
// ============================================

interface StickyActionsProps {
  children: ReactNode;
  className?: string;
}

export function StickyActions({ children, className }: StickyActionsProps) {
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 bg-elevated shadow-elevated border-t border-border",
        "px-4 py-3 md:px-6",
        "flex items-center gap-3",
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================
// PILL - Small inline indicator
// ============================================

interface PillProps {
  children: ReactNode;
  variant?: "default" | "primary" | "success" | "warning" | "destructive" | "muted";
  size?: "sm" | "md";
  className?: string;
  onClick?: () => void;
}

export function Pill({
  children,
  variant = "default",
  size = "md",
  className,
  onClick,
}: PillProps) {
  const variantClasses = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/15 text-primary-foreground border border-primary/30",
    success: "bg-success/15 text-success",
    warning: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    destructive: "bg-destructive/15 text-destructive",
    muted: "bg-muted/50 text-muted-foreground",
  };

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-meta",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        variantClasses[variant],
        sizeClasses[size],
        onClick && "cursor-pointer hover:opacity-80",
        className
      )}
      onClick={onClick}
    >
      {children}
    </span>
  );
}

// ============================================
// OPTION ROW - Selectable list item
// ============================================

interface OptionRowProps {
  children: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  rightElement?: ReactNode;
  className?: string;
}

export function OptionRow({
  children,
  selected = false,
  disabled = false,
  onClick,
  rightElement,
  className,
}: OptionRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/30 hover:bg-muted/50",
        disabled && "opacity-50 pointer-events-none",
        onClick && "cursor-pointer",
        className
      )}
      onClick={disabled ? undefined : onClick}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {rightElement && <div className="shrink-0">{rightElement}</div>}
    </div>
  );
}

// ============================================
// SECTION HEADER - Consistent section titles
// ============================================

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-2">
        {icon && (
          <div className="text-primary">{icon}</div>
        )}
        <div>
          <h2 className="text-h3 font-semibold">{title}</h2>
          {subtitle && (
            <p className="text-meta text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ============================================
// PROGRESS RING - Circular progress indicator
// ============================================

interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  showValue?: boolean;
}

export function ProgressRing({
  value,
  size = 40,
  strokeWidth = 4,
  className,
  showValue = true,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-300"
        />
      </svg>
      {showValue && (
        <span className="absolute text-[10px] font-bold tabular-nums">
          {Math.round(value)}%
        </span>
      )}
    </div>
  );
}
