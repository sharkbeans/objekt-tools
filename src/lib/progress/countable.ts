export const PROGRESS_EXCLUDED_CLASS = "Welcome";
export const PROGRESS_EXCLUDED_COLLECTION_NO = "100Z";

type ProgressCountableInput = {
  class?: string | null;
  collectionNo?: string | null;
};

export function isCollectionProgressCountable(
  collection: ProgressCountableInput,
): boolean {
  const className = collection.class?.trim().toLowerCase();
  const collectionNo = collection.collectionNo?.trim().toUpperCase();

  return (
    className !== PROGRESS_EXCLUDED_CLASS.toLowerCase() &&
    collectionNo !== PROGRESS_EXCLUDED_COLLECTION_NO
  );
}
