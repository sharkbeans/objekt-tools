import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridTradeDialog } from "@/components/progress/grid-trade-dialog";
import { readHuntParams } from "@/lib/match/hunt-url";
import type { ProgressCollection } from "@/lib/progress/types";
import { installFakeExtension } from "@/test/fake-extension";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  session: null as { user: { id: string } } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: mocks.session }),
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

/** Signed in as the profile's owner: /api/cosmo/status returns its nickname. */
function signInAsOwner() {
  mocks.session = { user: { id: "u1" } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ nickname: "sjarkbean" })),
  );
}

function pushedHunt() {
  expect(mocks.push).toHaveBeenCalledTimes(1);
  const href = String(mocks.push.mock.calls[0][0]);
  expect(href.startsWith("/match?")).toBe(true);
  return readHuntParams(new URL(href, "https://objekt.my").searchParams);
}

const MISSING = [
  "SeoYeon CC103",
  "SeoYeon CC104",
  "SeoYeon CC105",
  "SeoYeon CC107",
];

describe("GridTradeDialog hunt", () => {
  afterEach(() => {
    mocks.push.mockReset();
    mocks.session = null;
    vi.unstubAllGlobals();
  });

  // 101 and 102 have spares; 103/104/105/107 are missing.
  const withDupes = () =>
    firstEdition({ "101": 3, "102": 2, "106": 1, "108": 1 });

  it("sends a visitor to /match in Buy mode with no nickname", () => {
    renderDialog(withDupes());

    expect(screen.queryByRole("button", { name: /Trade/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Find on Discord/ }));

    expect(pushedHunt()).toEqual({
      mode: "wtb",
      wants: MISSING,
      offers: [],
      nickname: "",
    });
  });

  it("defaults the owner to Buy with no dupes offered", async () => {
    signInAsOwner();
    renderDialog(withDupes());

    const buy = await screen.findByRole("button", { name: /Buy/ });
    expect(buy).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("checkbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Find on Discord/ }));
    expect(pushedHunt()).toEqual({
      mode: "wtb",
      wants: MISSING,
      offers: [],
      nickname: "sjarkbean",
    });
  });

  it("offers only the dupes the owner ticks in Trade mode", async () => {
    signInAsOwner();
    renderDialog(withDupes());

    fireEvent.click(await screen.findByRole("button", { name: /Trade/ }));
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).not.toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: /SeoYeon CC101/ }));
    fireEvent.click(screen.getByRole("button", { name: /Find on Discord/ }));

    expect(pushedHunt()).toEqual({
      mode: "wtt",
      wants: MISSING,
      offers: ["SeoYeon CC101"],
      nickname: "sjarkbean",
    });
  });
});

describe("GridTradeDialog saved hunts", () => {
  afterEach(() => {
    mocks.push.mockReset();
    mocks.session = null;
    vi.unstubAllGlobals();
  });

  it("asks a signed-out visitor to sign in to save, returning to this grid", () => {
    renderDialog(firstEdition({ "101": 1 }));
    const link = screen.getByRole("link", {
      name: /Sign in to save this grid and pick it up on desktop/,
    });
    const href = new URL(link.getAttribute("href") ?? "", "https://objekt.my");
    expect(href.pathname).toBe("/sign-in");
    expect(href.searchParams.get("returnTo")).toBe(
      "/collection/sjarkbean/SeoYeon?view=grid&season=Cream02",
    );
    expect(screen.queryByRole("button", { name: /Save grid/ })).toBeNull();
  });

  it("saves the owner's choices, not the wants", async () => {
    signInAsOwner();
    renderDialog(firstEdition({ "101": 3, "102": 2, "106": 1, "108": 1 }));
    expect(screen.queryByRole("link", { name: /Sign in to save/ })).toBeNull();

    // Deselect 105, then save in Trade mode offering 101.
    const slot105 = screen.getByAltText("105").closest("button");
    if (!slot105) throw new Error("slot 105 button not found");
    fireEvent.click(slot105);
    fireEvent.click(await screen.findByRole("button", { name: /Trade/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /SeoYeon CC101/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save grid/ }));

    const fetchMock = vi.mocked(fetch);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === "/api/hunts")).toBe(
        true,
      ),
    );
    const [, init] =
      fetchMock.mock.calls.find(([url]) => url === "/api/hunts") ?? [];
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      nickname: "sjarkbean",
      member: "SeoYeon",
      season: "Cream02",
      edition: 1,
      mode: "wtt",
      skipped: ["cream02-seoyeon-105"],
      offers: ["cream02-seoyeon-101"],
    });
  });
});

describe("GridTradeDialog with the extension", () => {
  afterEach(() => {
    mocks.push.mockReset();
    mocks.session = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("sends the missing list to the extension instead of navigating", async () => {
    const extension = installFakeExtension();
    try {
      renderDialog(firstEdition({ "101": 1, "102": 1, "106": 1, "108": 1 }));
      // "Open in Match" only appears once the extension has answered.
      expect(
        await screen.findByRole("button", { name: /Open in Match/ }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Find on Discord/ }));
      await waitFor(() => expect(extension.hunts).toHaveLength(1));
      expect(extension.hunts[0]).toMatchObject({
        type: "hunt",
        wants: MISSING.join("\n"),
        nickname: "",
      });
      expect(mocks.push).not.toHaveBeenCalled();
    } finally {
      extension.remove();
    }
  });

  it("offers a skippable intro once on desktop Chrome without the extension", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    );
    const { unmount } = renderDialog(firstEdition({}));
    // Let the presence check time out: no extension answered.
    await new Promise((resolve) => setTimeout(resolve, 1600));
    fireEvent.click(screen.getByRole("button", { name: /Find on Discord/ }));

    const install = screen.getByRole("link", { name: /Add to Chrome/ });
    expect(install.getAttribute("href")).toContain(
      "chromewebstore.google.com/detail/objekt-match/",
    );
    expect(install.getAttribute("target")).toBe("_blank");
    expect(mocks.push).not.toHaveBeenCalled();

    // "Not now" carries on to /match — not a dead end.
    fireEvent.click(screen.getByRole("button", { name: /Not now/ }));
    expect(mocks.push).toHaveBeenCalledTimes(1);
    unmount();

    // ...and the intro isn't offered again.
    mocks.push.mockReset();
    renderDialog(firstEdition({}));
    await new Promise((resolve) => setTimeout(resolve, 1600));
    fireEvent.click(screen.getByRole("button", { name: /Find on Discord/ }));
    expect(screen.queryByRole("link", { name: /Add to Chrome/ })).toBeNull();
    expect(mocks.push).toHaveBeenCalledTimes(1);
  }, 10_000);
});
