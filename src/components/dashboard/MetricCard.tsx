import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "success" | "warning" | "primary";
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = "default",
  className,
}: MetricCardProps) {
  const glowClasses = {
    default: "",
    success: "hover:shadow-glow-success",
    warning: "hover:shadow-glow-warning",
    primary: "hover:shadow-glow-primary",
  };

  const iconBgClasses = {
    default: "bg-secondary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    primary: "bg-primary/10 text-primary",
  };

  return (
    <div
      className={cn(
        "metric-card group transition-all duration-300",
        glowClasses[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-semibold font-mono tracking-tight animate-count-up">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            "p-3 rounded-lg transition-transform duration-300 group-hover:scale-110",
            iconBgClasses[variant]
          )}
        >
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5 text-sm">
          <span
            className={cn(
              "font-mono",
              trend.isPositive ? "text-success" : "text-destructive"
            )}
          >
            {trend.isPositive ? "+" : ""}
            {trend.value}%
          </span>
          <span className="text-muted-foreground">vs last week</span>
        </div>
      )}
    </div>
  );
}
