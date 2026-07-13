"use client";

import { Fragment, useMemo } from "react";
import type { Edition } from "@/lib/edition";
import { getCollectionEdition } from "@/lib/edition";
import type { ProgressCollection } from "@/lib/progress/types";
import { GridBoard } from "./grid-board";

interface Props {
  season: string;
  collections: ProgressCollection[];
  address: string;
  nickname: string;
  viewConsumed: boolean;
}

const EDITIONS: Edition[] = [1, 2, 3];

export function GridSection({
  season,
  collections,
  address,
  nickname,
  viewConsumed,
}: Props) {
  const byEdition = useMemo(() => {
    const map = new Map<
      Edition,
      { firsts: ProgressCollection[]; specials: ProgressCollection[] }
    >();
    for (const c of collections) {
      const edition = getCollectionEdition({
        artist: c.artist,
        class: c.class,
        onOffline: c.onOffline,
        collectionNo: c.collectionNo,
        season: c.season,
      });
      if (!edition) continue;
      const entry = map.get(edition) ?? { firsts: [], specials: [] };
      if (c.class === "First") entry.firsts.push(c);
      else if (c.class === "Special") entry.specials.push(c);
      map.set(edition, entry);
    }
    for (const entry of map.values()) {
      entry.firsts.sort((a, b) =>
        a.collectionNo.localeCompare(b.collectionNo, undefined, {
          numeric: true,
        }),
      );
      entry.specials.sort((a, b) =>
        a.collectionNo.localeCompare(b.collectionNo, undefined, {
          numeric: true,
        }),
      );
    }
    return map;
  }, [collections]);

  const editionsWithData = EDITIONS.filter(
    (e) => (byEdition.get(e)?.firsts.length ?? 0) > 0,
  );

  if (editionsWithData.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">{season}</h3>
      <div className="flex flex-wrap items-stretch gap-8">
        {editionsWithData.map((edition, i) => {
          const entry = byEdition.get(edition);
          if (!entry) return null;
          return (
            <Fragment key={edition}>
              {i > 0 && (
                <div className="hidden w-px shrink-0 self-stretch bg-border sm:block" />
              )}
              <GridBoard
                edition={edition}
                firsts={entry.firsts}
                specials={entry.specials}
                address={address}
                nickname={nickname}
                seasonCollections={collections}
                viewConsumed={viewConsumed}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
