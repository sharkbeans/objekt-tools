"use client";

import { useEffect, useState } from "react";
import {
  type FilterOptions,
  fallbackFilterOptions,
} from "@/lib/filter-options";

export function useFilterOptions() {
  const [options, setOptions] = useState<FilterOptions>(fallbackFilterOptions);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/objekts/filter-options")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.artists) setOptions(data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return options;
}
