"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TradePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

export function TradePagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  itemLabel = "trades",
}: TradePaginationProps) {
  if (total === 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  // Build page numbers to show: always show first, last, and pages around current
  function getPageNumbers() {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);

    if (page > 3) pages.push("ellipsis");

    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    if (page < totalPages - 2) pages.push("ellipsis");

    pages.push(totalPages);
    return pages;
  }

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <p className="text-sm text-muted-foreground">
        Showing {from}–{to} of {total} {itemLabel}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-xs"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-xs"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeftIcon />
          </Button>

          {pageNumbers.map((p, i) =>
            p === "ellipsis" ? (
              <span
                key={`ellipsis-${pageNumbers[i - 1] ?? "start"}-${pageNumbers[i + 1] ?? "end"}`}
                className="px-1 text-sm text-muted-foreground"
              >
                ...
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="icon-xs"
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ),
          )}

          <Button
            variant="outline"
            size="icon-xs"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-xs"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
