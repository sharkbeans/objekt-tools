import { Loader2Icon } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WIDTHS = {
  narrow: "max-w-xl",
  default: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-7xl",
} as const;

/** Standard centered page column. Keeps widths and vertical rhythm uniform. */
function PageContainer({
  width = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & { width?: keyof typeof WIDTHS }) {
  return (
    <div
      className={cn("mx-auto w-full space-y-6", WIDTHS[width], className)}
      {...props}
    />
  );
}

/** Standard page heading: optional eyebrow, title, description and actions. */
function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/** Standard inline loading indicator. */
function LoadingState({
  label = "Loading...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground",
        className,
      )}
    >
      <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

/** Standard centered message for empty / not-found / signed-out states. */
function EmptyState({
  title,
  description,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 py-12 text-center",
        className,
      )}
    >
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      {description && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {children && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

/** Standard Previous / Page X of Y control. */
function PagePagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-3", className)}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}

export { EmptyState, LoadingState, PageContainer, PageHeader, PagePagination };
