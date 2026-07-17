"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRightIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ImageIcon,
  LibraryIcon,
  LinkIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  SmartphoneIcon,
  SparklesIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LoginCodeDialog } from "@/components/login-code-dialog";
import { ObjektLogo } from "@/components/objekt-logo";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UnlinkCosmoDialog } from "@/components/unlink-cosmo-dialog";
import { useCosmoLink } from "@/hooks/use-cosmo-link";
import { useUserRealtime } from "@/hooks/use-realtime";
import { useSession } from "@/lib/auth-client";
import { type SectionId, sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

function useMatchCount() {
  const { data: session } = useSession();
  const { data: matchData } = useQuery({
    queryKey: ["matches-count"],
    queryFn: async () => {
      const res = await fetch("/api/trades/mine/matches-count");
      return res.json();
    },
    enabled: !!session,
    refetchInterval: 60000,
  });
  return matchData?.count ?? 0;
}

function useUnreadNotificationCount() {
  const { data: session } = useSession();
  const { data } = useQuery({
    queryKey: ["notification-unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count");
      return res.json();
    },
    enabled: !!session,
    refetchInterval: 30000,
  });
  return data?.count ?? 0;
}

export function Navbar({
  currentSection,
}: {
  currentSection: SectionId | null;
}) {
  const { data: session } = useSession();
  const matchCount = useMatchCount();
  const unreadCount = useUnreadNotificationCount();
  const { profileHref, isLinked, refetch: refetchCosmoLink } = useCosmoLink();
  const [loginCodeOpen, setLoginCodeOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  // Emit the right link form for the host we're being served from (internal
  // paths when subdomains are off; clean/absolute URLs when on).
  const href = (internal: string) =>
    sectionHref(internal, currentSection ? { currentSection } : undefined);

  // Subscribe to per-user realtime events so notification count updates without polling
  useUserRealtime(session?.user?.id);

  return (
    <>
      {/* Desktop navbar — hidden on mobile */}
      <header className="hidden sm:block border-b border-border">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              href={href("/")}
              className="flex items-center gap-2 font-bold text-lg"
            >
              <ObjektLogo />
              objekt.my
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href={href("/trades")}
                className="relative text-muted-foreground hover:text-foreground transition-colors"
                title="Browse all trades"
              >
                Trades
                {matchCount > 0 && (
                  <span className="absolute -top-2 -right-4 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                    {matchCount > 99 ? "99+" : matchCount}
                  </span>
                )}
              </Link>
              <Link
                href={href("/list")}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Create and share a have/want list"
              >
                Lists
              </Link>
              <Link
                href={href("/collection")}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Collection
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Tools
                    <ChevronDownIcon className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem asChild>
                    <Link href={href("/objekt-maker")}>Objektify</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={href("/proofshot")}>Proofshot</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={href("/spin")}>Spin Simulator</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {session && (
              <Link
                href={href("/notifications")}
                className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Notifications"
              >
                <BellIcon className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-8 w-8 rounded-full"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {session.user.name?.charAt(0).toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1.5 text-sm">
                    <p className="font-medium">{session.user.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {session.user.email}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={href(profileHref)}>
                      <UserIcon className="size-4 mr-2" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={href("/list/mine")}>
                      <ImageIcon className="size-4 mr-2" />
                      My Lists
                    </Link>
                  </DropdownMenuItem>
                  {isLinked ? (
                    <DropdownMenuItem onClick={() => setUnlinkOpen(true)}>
                      <LinkIcon className="size-4 mr-2" />
                      Unlink Cosmo
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem asChild>
                      <Link href={href("/link")}>
                        <LinkIcon className="size-4 mr-2" />
                        Link Cosmo
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setLoginCodeOpen(true)}>
                    <SmartphoneIcon className="size-4 mr-2" />
                    Login Code
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSignOutConfirmOpen(true)}>
                    <LogOutIcon className="size-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Button size="sm" asChild>
                  <Link href={href("/sign-in")}>Sign in</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile navbar */}
      <MobileNav
        currentSection={currentSection}
        session={session}
        matchCount={matchCount}
        unreadCount={unreadCount}
        profileHref={profileHref}
        isLinked={isLinked}
        onLoginCode={() => setLoginCodeOpen(true)}
        onSignOut={() => setSignOutConfirmOpen(true)}
        onUnlink={() => setUnlinkOpen(true)}
      />

      <UnlinkCosmoDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        onSuccess={() => refetchCosmoLink()}
      />
      <LoginCodeDialog open={loginCodeOpen} onOpenChange={setLoginCodeOpen} />

      <AlertDialog
        open={signOutConfirmOpen}
        onOpenChange={setSignOutConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be signed out of your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={async () => {
                await fetch("/api/auth/logout", {
                  method: "POST",
                  credentials: "include",
                });
                window.location.href = "/";
              }}
            >
              Sign out
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MobileNav({
  currentSection,
  session,
  matchCount,
  unreadCount,
  profileHref,
  isLinked,
  onLoginCode,
  onSignOut,
  onUnlink,
}: {
  currentSection: SectionId | null;
  session: ReturnType<typeof useSession>["data"];
  matchCount: number;
  unreadCount: number;
  profileHref: string;
  isLinked: boolean;
  onLoginCode: () => void;
  onSignOut: () => void;
  onUnlink: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const href = (internal: string) =>
    sectionHref(internal, currentSection ? { currentSection } : undefined);
  // "/" is only the true landing page on the root host — on a section host
  // it's that section's own home, which still needs the mobile chrome.
  const isHomeRoute = !currentSection && pathname === "/";
  // Next's usePathname() may report either the pre-rewrite (external, clean)
  // or post-rewrite (internal) path depending on version/config, so match
  // both forms rather than assume one.
  const isActiveTradeRoute =
    pathname.startsWith("/active-trades") ||
    (currentSection === "trade" &&
      (pathname === "/active" || pathname.startsWith("/active/")));
  const isTradesRoute =
    !isActiveTradeRoute &&
    (currentSection === "trade" ||
      pathname === "/trades" ||
      pathname.startsWith("/trades/"));
  const pathnameSegments = pathname.split("/").filter(Boolean);
  const isCollectionMemberRoute =
    (pathname.startsWith("/collection/") && pathnameSegments.length >= 3) ||
    (currentSection === "collect" && pathnameSegments.length >= 2);
  const isToolsRoute =
    pathname.startsWith("/objekt-maker") ||
    pathname.startsWith("/proofshot") ||
    pathname.startsWith("/spin") ||
    currentSection === "create";
  const [toolsOpen, setToolsOpen] = useState(isToolsRoute);

  if (isHomeRoute || isCollectionMemberRoute) {
    return null;
  }

  if (!isTradesRoute) {
    return (
      <header
        data-mobile-nav
        className="sm:hidden border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75"
      >
        <div className="flex h-14 items-center px-3">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
                return;
              }
              router.push("/");
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Go back"
          >
            <ChevronLeftIcon className="h-7 w-7" strokeWidth={2.5} />
          </button>
          <div className="flex-1 px-2 text-center text-sm font-medium text-foreground truncate">
            {getMobilePageTitle(pathname, currentSection)}
          </div>
          <div className="h-10 w-10" />
        </div>
      </header>
    );
  }

  return (
    <>
      {/* Mobile top bar — burger on the left, logo next to it */}
      <header data-mobile-nav className="sm:hidden border-b border-border">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle menu"
          >
            {open ? (
              <XIcon className="h-5 w-5" />
            ) : (
              <MenuIcon className="h-5 w-5" />
            )}
          </button>
          <Link
            href={href("/")}
            className="flex items-center gap-2 font-bold text-lg"
            onClick={() => setOpen(false)}
          >
            <ObjektLogo />
            objekt.my
          </Link>
        </div>
      </header>

      {/* Sidebar overlay */}
      {open && (
        <button
          type="button"
          aria-label="Close menu overlay"
          className="sm:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar drawer */}
      <aside
        className={cn(
          "sm:hidden fixed top-0 left-0 z-50 h-full w-72 bg-background border-r border-border flex flex-col transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full pointer-events-none",
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center gap-3 px-4 border-b border-border shrink-0">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close menu"
          >
            <XIcon className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2 font-bold text-lg">
            <ObjektLogo />
            objekt.my
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          <MobileNavLink href={href("/trades")} onClick={() => setOpen(false)}>
            <span className="flex items-center gap-2">
              <ArrowLeftRightIcon className="size-4 shrink-0" />
              Trades
              {matchCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                  {matchCount > 99 ? "99+" : matchCount}
                </span>
              )}
            </span>
          </MobileNavLink>
          <MobileNavLink href={href("/list")} onClick={() => setOpen(false)}>
            <ImageIcon className="size-4" />
            Lists
          </MobileNavLink>
          <MobileNavLink
            href={href("/collection")}
            onClick={() => setOpen(false)}
          >
            <LibraryIcon className="size-4" />
            Collection
          </MobileNavLink>
          {session && (
            <MobileNavLink
              href={href("/notifications")}
              onClick={() => setOpen(false)}
            >
              <span className="flex items-center gap-2">
                <BellIcon className="size-4 shrink-0" />
                Notifications
                {unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </span>
            </MobileNavLink>
          )}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setToolsOpen((value) => !value)}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-expanded={toolsOpen}
              aria-controls="mobile-tools-nav"
            >
              <span className="inline-flex items-center gap-2">
                <SparklesIcon className="size-4" />
                Tools
              </span>
              <ChevronDownIcon
                className={cn(
                  "size-4 transition-transform",
                  toolsOpen && "rotate-180",
                )}
              />
            </button>
            {toolsOpen && (
              <div id="mobile-tools-nav" className="mt-1 space-y-1">
                <MobileNavLink
                  href={href("/objekt-maker")}
                  onClick={() => setOpen(false)}
                  className="pl-8"
                >
                  <SparklesIcon className="size-4" />
                  Objektify
                </MobileNavLink>
                <MobileNavLink
                  href={href("/proofshot")}
                  onClick={() => setOpen(false)}
                  className="pl-8"
                >
                  <UserIcon className="size-4" />
                  Proofshot
                </MobileNavLink>
                <MobileNavLink
                  href={href("/spin")}
                  onClick={() => setOpen(false)}
                  className="pl-8"
                >
                  <SparklesIcon className="size-4" />
                  Spin Simulator
                </MobileNavLink>
              </div>
            )}
          </div>
          {!session && (
            <MobileNavLink
              href={href("/sign-in")}
              onClick={() => setOpen(false)}
            >
              <LogInIcon className="size-4" />
              Sign in
            </MobileNavLink>
          )}
        </nav>

        {/* User profile at bottom */}
        {session && (
          <div className="shrink-0 border-t border-border px-4 py-4 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback>
                  {session.user.name?.charAt(0).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {session.user.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {session.user.email}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <MobileNavLink
                href={href(profileHref)}
                onClick={() => setOpen(false)}
              >
                <UserIcon className="size-4" />
                Profile
              </MobileNavLink>
              <MobileNavLink
                href={href("/list/mine")}
                onClick={() => setOpen(false)}
              >
                <ImageIcon className="size-4" />
                My Lists
              </MobileNavLink>
              {isLinked ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onUnlink();
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <LinkIcon className="size-4" />
                  Unlink Cosmo
                </button>
              ) : (
                <MobileNavLink
                  href={href("/link")}
                  onClick={() => setOpen(false)}
                >
                  <LinkIcon className="size-4" />
                  Link Cosmo
                </MobileNavLink>
              )}
              <button
                type="button"
                onClick={() => {
                  onLoginCode();
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-2"
              >
                <SmartphoneIcon className="size-4" />
                Login Code
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-2"
              >
                <LogOutIcon className="size-4" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function MobileNavLink({
  href,
  onClick,
  className,
  children,
}: {
  href: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

// `currentSection` disambiguates clean external paths ("/mine" on
// list.objekt.my) from the internal paths this used to match exclusively
// ("/list/mine") — see the usePathname() form caveat above.
function getMobilePageTitle(
  pathname: string,
  currentSection: SectionId | null,
): string {
  if (
    pathname.startsWith("/active-trades") ||
    (currentSection === "trade" &&
      (pathname === "/active" || pathname.startsWith("/active/")))
  ) {
    return "Active Trade";
  }
  if (pathname.startsWith("/notifications")) return "Notifications";
  if (pathname.startsWith("/objekt-maker") || currentSection === "create") {
    return "Objektify";
  }
  if (pathname.startsWith("/proofshot")) return "Proofshot";
  if (
    pathname.startsWith("/list/mine") ||
    (currentSection === "list" && pathname === "/mine")
  ) {
    return "My Lists";
  }
  if (
    pathname.startsWith("/list") ||
    pathname.startsWith("/post") ||
    currentSection === "list"
  ) {
    return "Lists";
  }
  if (pathname.startsWith("/spin")) return "Spin Simulator";
  if (pathname.startsWith("/collection") || currentSection === "collect") {
    return "Collection";
  }
  if (pathname.startsWith("/link")) return "Link Cosmo";
  if (pathname.startsWith("/sign-in")) return "Sign in";
  if (pathname.startsWith("/@")) return "Profile";
  return "objekt.my";
}
