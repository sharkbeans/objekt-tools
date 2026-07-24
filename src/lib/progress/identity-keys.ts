export function progressOverviewQueryKey(address: string) {
  return ["progress", "address", address.toLowerCase()] as const;
}

export function progressMemberQueryKey(address: string, member: string) {
  return ["progress", "address", address.toLowerCase(), member] as const;
}

export function progressSelectionStorageKey(
  address: string,
  member: string,
): string {
  return `collection-selection:address:${address.toLowerCase()}:${member.toLowerCase()}`;
}
