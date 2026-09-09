export function channelIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (id): id is string => typeof id === "string" && /^\d+$/.test(id),
      )
    : [];
}
