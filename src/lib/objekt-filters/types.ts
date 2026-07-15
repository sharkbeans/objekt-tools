export type ObjektFilterState = {
  search: string;
  artist: string[];
  member: string[];
  season: string[];
  class: string[];
  on_offline: string[];
  sort: string;
  filterMode: "haves" | "wants";
};

export const defaultFilters: ObjektFilterState = {
  search: "",
  artist: [],
  member: [],
  season: [],
  class: [],
  on_offline: [],
  sort: "newest",
  filterMode: "haves",
};

/** Structural filters used by the inventory/global pickers (no sort/filterMode). */
export type ObjektStructuralFilters = {
  artist: string[];
  member: string[];
  season: string[];
  class: string[];
  on_offline: string[];
  search?: string;
};

export function toStructuralFilters(
  filters: ObjektFilterState,
): ObjektStructuralFilters {
  return {
    artist: filters.artist,
    member: filters.member,
    season: filters.season,
    class: filters.class,
    on_offline: filters.on_offline,
    search: filters.search,
  };
}
