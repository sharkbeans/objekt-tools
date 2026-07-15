import {
  and,
  eq,
  exists,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { normalizeArtistId } from "@/lib/artist-utils";
import { db } from "@/lib/db";
import { tradePost, tradePostHave, tradePostWant } from "@/lib/db/schema";
import { membersByArtist, type ValidArtist } from "@/lib/filters";
import { decodeGroupedFilterValues } from "@/lib/objekt-filters/grouped";
import type { ObjektFilterState } from "@/lib/objekt-filters/types";

type ItemTable = typeof tradePostHave | typeof tradePostWant;

function rosterForArtist(artistId: string): string[] {
  const normalized = normalizeArtistId(artistId) as ValidArtist;
  return membersByArtist[normalized] ?? [];
}

/** True when `table` has the want-only `artist` column (isAny rows). */
function isWantTable(table: ItemTable): table is typeof tradePostWant {
  return "artist" in table;
}

/** Matches items whose resolved artist equals `artistId`. */
function artistCondition(table: ItemTable, artistId: string): SQL | undefined {
  const roster = rosterForArtist(artistId);
  const memberCond = roster.length ? inArray(table.member, roster) : undefined;

  if (!isWantTable(table)) return memberCond;

  // isAny want rows have no member — fall back to the stored artist column.
  const artistCond = sql`lower(${table.artist}) = ${normalizeArtistId(artistId).toLowerCase()}`;
  return memberCond ? or(memberCond, artistCond) : artistCond;
}

function memberOrSeasonOrClassCondition(
  table: ItemTable,
  column: ItemTable["member"] | ItemTable["season"] | ItemTable["class"],
  values: string[],
): SQL | undefined {
  const { pairs, plain } = decodeGroupedFilterValues(values);
  const conditions: SQL[] = [];
  if (plain.length) conditions.push(inArray(column, plain));
  for (const pair of pairs) {
    const artistCond = artistCondition(table, pair.artistId);
    conditions.push(
      artistCond
        ? (and(eq(column, pair.item), artistCond) as SQL)
        : eq(column, pair.item),
    );
  }
  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : or(...conditions);
}

/** SQL expression: does the item resolve to "online" or "offline"? Mirrors
 * getOnOffline() — trailing 'z' (case-insensitive) on collectionNo, falling
 * back to collectionId when collectionNo is null. */
function onOfflineCondition(
  table: ItemTable,
  onOffline: string[],
): SQL | undefined {
  if (onOffline.length !== 1) return undefined;
  const isOffline = sql`lower(right(coalesce(${table.collectionNo}, ${table.collectionId}), 1)) = 'z'`;
  return onOffline[0] === "offline" ? isOffline : sql`not (${isOffline})`;
}

export function buildItemConditions(
  table: ItemTable,
  filters: ObjektFilterState,
): SQL[] {
  const conditions: SQL[] = [isNull(table.deletedAt) as SQL];

  if (filters.member.length) {
    conditions.push(inArray(table.member, filters.member) as SQL);
  }

  if (filters.artist.length) {
    const artistConds = filters.artist
      .map((a) => artistCondition(table, a))
      .filter((c): c is SQL => c !== undefined);
    if (artistConds.length) {
      conditions.push(
        (artistConds.length === 1 ? artistConds[0] : or(...artistConds)) as SQL,
      );
    } else {
      conditions.push(sql`false`);
    }
  }

  const seasonCond = memberOrSeasonOrClassCondition(
    table,
    table.season,
    filters.season,
  );
  if (seasonCond) conditions.push(seasonCond);

  const classCond = memberOrSeasonOrClassCondition(
    table,
    table.class,
    filters.class,
  );
  if (classCond) conditions.push(classCond);

  const onOfflineCond = onOfflineCondition(table, filters.on_offline);
  if (onOfflineCond) conditions.push(onOfflineCond);

  return conditions;
}

function itemExists(table: ItemTable, filters: ObjektFilterState): SQL {
  const conditions = buildItemConditions(table, filters);
  const subquery = db
    .select({ x: sql`1` })
    .from(table)
    .where(and(eq(table.tradePostId, tradePost.id), ...conditions));
  return exists(subquery);
}

export function hasStructuralFilters(filters: ObjektFilterState): boolean {
  return (
    filters.artist.length > 0 ||
    filters.member.length > 0 ||
    filters.season.length > 0 ||
    filters.class.length > 0 ||
    filters.on_offline.length > 0
  );
}

/**
 * SQL condition matching trade posts with at least one have/want item that
 * satisfies the structural filters, scoped by filterMode. Returns undefined
 * when no structural filters are set.
 */
export function buildTradeStructuralWhere(
  filters: ObjektFilterState,
  filterMode: "haves" | "wants" | "both",
): SQL | undefined {
  if (!hasStructuralFilters(filters)) return undefined;

  const haveExists = () => itemExists(tradePostHave, filters);
  const wantExists = () => itemExists(tradePostWant, filters);

  if (filterMode === "haves") return haveExists();
  if (filterMode === "wants") return wantExists();
  return or(haveExists(), wantExists()) as SQL;
}
