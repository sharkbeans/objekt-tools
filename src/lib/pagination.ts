export type PaginationOptions = {
  defaultLimit?: number;
  maxLimit?: number;
};

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
}

export function parsePaginationParams(
  params: URLSearchParams,
  { defaultLimit = 12, maxLimit = 24 }: PaginationOptions = {},
) {
  const page = parsePositiveInt(params.get("page"), 1);
  const limit = Math.min(
    parsePositiveInt(params.get("limit"), defaultLimit),
    maxLimit,
  );
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}
