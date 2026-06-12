interface OfferedObjekt {
  collectionId: string;
  member?: string | null;
  season?: string | null;
  class?: string | null;
  artist?: string | null;
}

interface TradeWant {
  isAny: boolean;
  collectionId: string;
  member?: string | null;
  season?: string | null;
  class?: string | null;
  artist?: string | null;
}

function objektMatchesWant(objekt: OfferedObjekt, want: TradeWant): boolean {
  if (!want.isAny) {
    return objekt.collectionId === want.collectionId;
  }
  // Filter want: objekt must satisfy ALL specified fields
  if (want.member && objekt.member !== want.member) return false;
  if (want.season && objekt.season !== want.season) return false;
  if (want.class && objekt.class !== want.class) return false;
  if (want.artist && objekt.artist !== want.artist) return false;
  return true;
}

export function validateWantsOnly(
  objekts: OfferedObjekt[],
  wants: TradeWant[],
): { valid: true } | { valid: false } {
  // At least one offered objekt must match a want
  const hasMatch = objekts.some((objekt) =>
    wants.some((want) => objektMatchesWant(objekt, want)),
  );
  return hasMatch ? { valid: true } : { valid: false };
}
