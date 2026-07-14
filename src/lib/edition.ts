// Edition derivation ported from objekt-explorer's collection-grid.ts —
// there's no `edition` column in the shared indexer DB, so it's derived
// from the class + numeric collectionNo range.
// https://github.com/izrin96/objekt-explorer

export type Edition = 1 | 2 | 3;

export const EDITION_LABELS: Record<Edition, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
};

interface EditionInput {
  artist?: string | null;
  class: string;
  onOffline: string;
  collectionNo: string;
  season: string;
}

function getScoEdition(
  input: EditionInput,
  collectionNo: number,
): Edition | null {
  // tripleS Atom01 SCOs for 2nd/3rd edition start from 216z instead of 203/205.
  if (
    input.artist === "tripleS" &&
    input.season === "Atom01" &&
    ![201, 202].includes(collectionNo)
  ) {
    if ([216, 217].includes(collectionNo)) return 2;
    if ([218, 219].includes(collectionNo)) return 3;
    return null;
  }

  if ([201, 202].includes(collectionNo)) return 1;
  if ([203, 204].includes(collectionNo)) return 2;
  if ([205, 206].includes(collectionNo)) return 3;
  return null;
}

function getFirstEdition(collectionNo: number): Edition | null {
  if (collectionNo >= 101 && collectionNo <= 108) return 1;
  if (collectionNo >= 109 && collectionNo <= 116) return 2;
  if (collectionNo >= 117 && collectionNo <= 120) return 3;
  return null;
}

function getMotionEdition(collectionNo: number): Edition | null {
  if (collectionNo === 501) return 1;
  if (collectionNo === 502) return 2;
  if (collectionNo === 503) return 3;
  return null;
}

/** Derive the Cosmo "edition" (1st/2nd/3rd) for a collection, or null if the
 * class/artist has no edition concept (e.g. idntt, or non-editioned classes). */
export function getCollectionEdition(input: EditionInput): Edition | null {
  if (input.artist === "idntt") return null;

  const collectionNo = Number.parseInt(input.collectionNo, 10);
  if (!Number.isFinite(collectionNo)) return null;

  if (input.class === "Special" && input.onOffline === "online") {
    return getScoEdition(input, collectionNo);
  }
  if (input.class === "Motion") return getMotionEdition(collectionNo);
  if (input.class === "First") return getFirstEdition(collectionNo);
  return null;
}
