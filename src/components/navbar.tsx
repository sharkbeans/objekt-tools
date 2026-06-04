"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRightIcon,
  BellIcon,
  ChevronLeftIcon,
  ImageIcon,
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
import { useUserRealtime } from "@/hooks/use-realtime";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface CosmoLinkStatus {
  address: string;
  nickname: string | null;
}

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

function useMyProfileHref() {
  const { data: session } = useSession();
  const { data } = useQuery<CosmoLinkStatus | null>({
    queryKey: ["cosmo-link-status"],
    queryFn: async () => {
      const res = await fetch("/api/cosmo/status");
      if (res.status === 404 || res.status === 401) return null;
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!session,
  });

  if (!session) return "/sign-in";
  if (!data) return "/link";
  return `/@${data.nickname ?? data.address}`;
}

export function Navbar() {
  const { data: session } = useSession();
  const matchCount = useMatchCount();
  const unreadCount = useUnreadNotificationCount();
  const profileHref = useMyProfileHref();
  const [loginCodeOpen, setLoginCodeOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);

  // Subscribe to per-user realtime events so notification count updates without polling
  useUserRealtime(session?.user?.id);

  return (
    <>
      {/* Desktop navbar — hidden on mobile */}
      <header className="hidden sm:block border-b border-border">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-lg"
            >
              <ObjektLogo />
              objekt.my
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/trades"
                className="relative text-muted-foreground hover:text-foreground transition-colors"
              >
                Trades
                {matchCount > 0 && (
                  <span className="absolute -top-2 -right-4 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                    {matchCount > 99 ? "99+" : matchCount}
                  </span>
                )}
              </Link>
              <Link
                href="/post"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Poster
              </Link>
              <Link
                href="/objekt-maker"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Objektify
              </Link>
              <Link
                href="/proofshot"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Proofshot
              </Link>
              <Link
                href="/spin"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Spin
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {session && (
              <Link
                href="/notifications"
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
                    <Link href={profileHref}>
                      <UserIcon className="size-4 mr-2" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/list/mine">
                      <ImageIcon className="size-4 mr-2" />
                      My Lists
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/link">
                      <LinkIcon className="size-4 mr-2" />
                      Link Cosmo
                    </Link>
                  </DropdownMenuItem>
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
                  <Link href="/sign-in">Sign in</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile navbar */}
      <MobileNav
        session={session}
        matchCount={matchCount}
        unreadCount={unreadCount}
        profileHref={profileHref}
        onLoginCode={() => setLoginCodeOpen(true)}
        onSignOut={() => setSignOutConfirmOpen(true)}
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
  session,
  matchCount,
  unreadCount,
  profileHref,
  onLoginCode,
  onSignOut,
}: {
  session: ReturnType<typeof useSession>["data"];
  matchCount: number;
  unreadCount: number;
  profileHref: string;
  onLoginCode: () => void;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isHomeRoute = pathname === "/";
  const isTradesRoute =
    pathname === "/trades" || pathname.startsWith("/trades/");

  if (isHomeRoute) {
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
            {getMobilePageTitle(pathname)}
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
            href="/"
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
          <MobileNavLink href="/trades" onClick={() => setOpen(false)}>
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
          <MobileNavLink href="/post" onClick={() => setOpen(false)}>
            <ImageIcon className="size-4" />
            Poster
          </MobileNavLink>
          <MobileNavLink href="/objekt-maker" onClick={() => setOpen(false)}>
            <SparklesIcon className="size-4" />
            Objektify
          </MobileNavLink>
          <MobileNavLink href="/proofshot" onClick={() => setOpen(false)}>
            <UserIcon className="size-4" />
            Proofshot
          </MobileNavLink>
          <MobileNavLink href="/spin" onClick={() => setOpen(false)}>
            <SparklesIcon className="size-4" />
            Spin
          </MobileNavLink>
          {session && (
            <MobileNavLink href="/notifications" onClick={() => setOpen(false)}>
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
          {!session && (
            <MobileNavLink href="/sign-in" onClick={() => setOpen(false)}>
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
              <MobileNavLink href={profileHref} onClick={() => setOpen(false)}>
                <UserIcon className="size-4" />
                Profile
              </MobileNavLink>
              <MobileNavLink href="/list/mine" onClick={() => setOpen(false)}>
                <ImageIcon className="size-4" />
                My Lists
              </MobileNavLink>
              <MobileNavLink href="/link" onClick={() => setOpen(false)}>
                <LinkIcon className="size-4" />
                Link Cosmo
              </MobileNavLink>
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
  children,
}: {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {children}
    </Link>
  );
}

function getMobilePageTitle(pathname: string): string {
  if (pathname.startsWith("/active-trades")) return "Active Trade";
  if (pathname.startsWith("/notifications")) return "Notifications";
  if (pathname.startsWith("/objekt-maker")) return "Objektify";
  if (pathname.startsWith("/proofshot")) return "Proofshot";
  if (pathname.startsWith("/list/mine")) return "My Lists";
  if (pathname.startsWith("/post")) return "Poster";
  if (pathname.startsWith("/spin")) return "Spin";
  if (pathname.startsWith("/link")) return "Link Cosmo";
  if (pathname.startsWith("/sign-in")) return "Sign in";
  if (pathname.startsWith("/@")) return "Profile";
  return "objekt.my";
}
