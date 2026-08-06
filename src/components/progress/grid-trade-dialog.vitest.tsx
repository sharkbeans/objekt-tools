import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GridTradeDialog } from "@/components/progress/grid-trade-dialog";
import type { ProgressCollection } from "@/lib/progress/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: null }),
}));

function fco(
  collectionNo: string,
  counts: { owned: number; transferable?: number } = { owned: 0 },
): ProgressCollection {
  return {
    collectionId: `cream02-seoyeon-${collectionNo}`,
    collectionNo,
    season: "Cream02",
    class: "First",
    onOffline: "online",
    thumbnailImage: `https://imagedelivery.example/${collectionNo}`,
    frontImage: "",
    backImage: "",
    accentColor: "#000000",
    ownedCount: counts.owned,
    transferableCount: counts.transferable ?? counts.owned,
    globalTotalCount: 100,
    globalTradableCount: 100,
    gridMintCount: 0,
    progressCountable: true,
    member: "SeoYeon",
    artist: "tripleS",
  };
}

/** 1st-edition slots 101-108 with the given owned counts (0 = not owned). */
function firstEdition(owned: Record<string, number>) {
  return Array.from({ length: 8 }, (_, i) => {
    const no = String(101 + i);
    return fco(no, { owned: owned[no] ?? 0 });
  });
}

/** Selected slots carry a green check badge; unselected ones don't. */
function selectedCount(container: HTMLElement) {
  return container.querySelectorAll(".bg-green-500").length;
}

function renderDialog(firsts: ProgressCollection[]) {
  return render(
    <GridTradeDialog
      open
      onOpenChange={vi.fn()}
      edition={1}
      firsts={firsts}
      gridded={0}
      nickname="sjarkbean"
      seasonCollections={firsts}
    />,
  );
}

describe("GridTradeDialog want selection", () => {
  it("selects only the slots the user is missing", () => {
    const { baseElement } = renderDialog(
      firstEdition({ "101": 1, "102": 1, "106": 1, "108": 1 }),
    );

    expect(selectedCount(baseElement as HTMLElement)).toBe(4);
  });

  // Regression: the board (and this dialog) mount as soon as the grid-mint
  // query resolves, which can beat the ownership query. Every FCO then reads
  // ownedCount 0 and the default selection is all 8 slots — it must not stay
  // that way once the real counts land.
  it("re-seeds the selection when ownership counts arrive late", () => {
    const { baseElement, rerender } = renderDialog(firstEdition({}));

    expect(selectedCount(baseElement as HTMLElement)).toBe(8);

    const loaded = firstEdition({ "101": 1, "102": 1, "106": 1, "108": 1 });
    rerender(
      <GridTradeDialog
        open
        onOpenChange={vi.fn()}
        edition={1}
        firsts={loaded}
        gridded={0}
        nickname="sjarkbean"
        seasonCollections={loaded}
      />,
    );

    expect(selectedCount(baseElement as HTMLElement)).toBe(4);
  });

  it("keeps the user's own picks when counts refresh afterwards", () => {
    const owned = { "101": 1, "102": 1, "106": 1, "108": 1 };
    const { baseElement, rerender } = renderDialog(firstEdition(owned));

    // Deselect one of the four defaults.
    const slot103 = screen.getByAltText("103").closest("button");
    if (!slot103) throw new Error("slot 103 button not found");
    fireEvent.click(slot103);
    expect(selectedCount(baseElement as HTMLElement)).toBe(3);

    const refreshed = firstEdition(owned);
    rerender(
      <GridTradeDialog
        open
        onOpenChange={vi.fn()}
        edition={1}
        firsts={refreshed}
        gridded={0}
        nickname="sjarkbean"
        seasonCollections={refreshed}
      />,
    );

    expect(selectedCount(baseElement as HTMLElement)).toBe(3);
  });
});
