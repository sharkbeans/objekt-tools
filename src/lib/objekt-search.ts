import { membersByArtist, shortformMembers } from "@/lib/filters";

export type ObjektSearchItem = {
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  season?: string | null;
  class?: string | null;
  serial?: number | null;
  artist?: string | null;
};

const allMembers = Object.values(membersByArtist).flat();

function getMemberShortKeys(value: string): string[] {
  return Object.keys(shortformMembers).filter(
    (key) => shortformMembers[key] === value,
  );
}

export function resolveObjektMemberAlias(text: string): string | null {
  const lower = text.trim().toLowerCase();
  const shortform = shortformMembers[lower];
  if (shortform) return shortform;
  const exact = allMembers.find((member) => member.toLowerCase() === lower);
  return exact ?? null;
}

export function resolveObjektSearchTerm(text: string): string {
  return resolveObjektMemberAlias(text) ?? text;
}

export function makeObjektSearchTags(item: ObjektSearchItem): string[] {
  if (!item.member || !item.season || !item.class || !item.collectionNo) {
    return [item.collectionId.toLowerCase()];
  }

  const member = item.member;
  const season = item.season;
  const className = item.class;
  const collectionNo = item.collectionNo;

  const seasonCode = season.charAt(0);
  const seasonNumber = season.slice(-2);
  const seasonCodeRepeated = seasonCode.repeat(Number(seasonNumber));
  const collectionNoSliced = collectionNo.slice(0, -1);
  const artist = item.artist;

  return [
    ...getMemberShortKeys(member),
    ...(artist ? [artist] : []),
    collectionNo,
    ...(artist !== "idntt"
      ? [
          `${seasonCodeRepeated}${collectionNo}`,
          `${seasonCodeRepeated}${collectionNoSliced}`,
        ]
      : []),
    collectionNoSliced,
    member.toLowerCase(),
    className.toLowerCase(),
    `${className.charAt(0).toLowerCase()}co`,
    season.toLowerCase(),
    season.slice(0, -2).toLowerCase(),
    seasonCode.toLowerCase() + seasonNumber,
    seasonCode.toLowerCase() + Number(seasonNumber),
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
}

function parseCollectionNo(value: string) {
  const expression = /^([a-zA-Z]*)(\d{3})([azAZ]?)$/;
  const match = value.match(expression);
  if (!match) return null;
  const [, seasonCode = "", collectionNo = "", type = ""] = match;
  return {
    seasonCode: seasonCode.length > 0 ? seasonCode.charAt(0) : "",
    seasonNumber: seasonCode.length,
    collectionNo,
    type,
  };
}

function parseSerial(value: string) {
  const expression = /\d+/;
  const match = value.match(expression);
  if (!match) return null;
  return Number(match[0]);
}

function getItemBreakdown(item: ObjektSearchItem) {
  if (!item.collectionNo || !item.season) return null;
  return {
    collectionNo: item.collectionNo.substring(0, 3).toLowerCase(),
    seasonCode: item.season.charAt(0).toLowerCase(),
    seasonNumber: Number(item.season.slice(-2)),
    type: item.collectionNo.charAt(3).toLowerCase(),
  };
}

function toSeasonKey(seasonCode: string, seasonNumber: number) {
  return String(seasonNumber).padStart(2, "0") + seasonCode;
}

export function objektSearchTermMatches(
  keyword: string,
  item: ObjektSearchItem,
  tags = makeObjektSearchTags(item),
  options: { fuzzy?: boolean } = {},
): boolean {
  const normalizedKeyword = keyword.toLowerCase();

  if (normalizedKeyword.startsWith("#")) {
    if (item.serial == null) return false;
    const [start, end] = normalizedKeyword.split("-").map(parseSerial);
    if (!start) return false;
    return item.serial >= start && item.serial <= (end ?? start);
  }

  if (normalizedKeyword.includes("-")) {
    const [start, end] = normalizedKeyword.split("-").map(parseCollectionNo);
    if (!start || !end) return false;

    const breakdown = getItemBreakdown(item);
    if (!breakdown) return false;

    const hasSeason = start.seasonNumber > 0 || end.seasonNumber > 0;

    if (hasSeason) {
      const startSeasonKey = toSeasonKey(
        start.seasonCode || end.seasonCode || "a",
        start.seasonNumber || end.seasonNumber,
      );
      const endSeasonKey = toSeasonKey(
        end.seasonCode || start.seasonCode || "z",
        end.seasonNumber || start.seasonNumber || 99,
      );
      const objectSeasonKey = toSeasonKey(
        breakdown.seasonCode,
        breakdown.seasonNumber,
      );
      if (objectSeasonKey < startSeasonKey || objectSeasonKey > endSeasonKey) {
        return false;
      }
    }

    return (
      breakdown.collectionNo >= start.collectionNo &&
      breakdown.collectionNo <= end.collectionNo &&
      breakdown.type >= (start.type || "a") &&
      breakdown.type <= (end.type || start.type || "z")
    );
  }

  if (tags.some((value) => value === normalizedKeyword)) return true;
  if (!options.fuzzy) return false;

  return [
    item.member,
    item.collectionNo,
    item.collectionId,
    item.season,
    item.class,
    item.artist,
  ].some((value) => value?.toLowerCase().includes(normalizedKeyword));
}

export function parseObjektSearchGroups(searchText: string): string[][] {
  return searchText
    .toLowerCase()
    .split(",")
    .map((group) =>
      group
        .trim()
        .split(" ")
        .map((term) => term.trim())
        .filter(Boolean),
    )
    .filter((group) => group.length > 0);
}

export function objektMatchesSearch(
  item: ObjektSearchItem,
  searchText: string,
): boolean {
  const groups = parseObjektSearchGroups(searchText);
  if (groups.length === 0) return true;

  const tags = makeObjektSearchTags(item);
  return groups.some((group) =>
    group.every((term) =>
      term.startsWith("!")
        ? !objektSearchTermMatches(term.slice(1), item, tags, { fuzzy: true })
        : objektSearchTermMatches(term, item, tags, { fuzzy: true }),
    ),
  );
}
