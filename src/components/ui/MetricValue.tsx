import type { ReactNode } from "react";
import { clsx } from "clsx";
import { AnimatedValue } from "@/components/ui/AnimatedValue";

export type MetricToken = {
  text: string;
  animated?: boolean;
  className?: string;
};

export function MetricValue({
  tokens,
  className,
  ariaLabel,
}: {
  tokens: MetricToken[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <span className={clsx("metric-value-template", className)} aria-label={ariaLabel}>
      {tokens.map((token, index) => {
        return (
          <span
            key={index}
            className={clsx(
              "metric-value-token",
              token.animated && "is-animated",
              token.className,
            )}
            aria-hidden={ariaLabel ? true : undefined}
          >
            {token.animated ? <AnimatedValue text={token.text} /> : token.text}
          </span>
        );
      })}
    </span>
  );
}

export function MetricGroup({ children }: { children: ReactNode }) {
  return <span className="metric-value-group">{children}</span>;
}
