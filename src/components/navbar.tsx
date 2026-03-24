"use client";

import { useQuery } from "@tanstack/react-query";
import { BellIcon, MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface CosmoLinkStatus {
  nickname: string;
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
  return data?.nickname
    ? `/@${encodeURIComponent(data.nickname)}`
    : "/link";
}

export function Navbar() {
  const { data: session } = useSession();
  const matchCount = useMatchCount();
  const unreadCount = useUnreadNotificationCount();
  const profileHref = useMyProfileHref();

  return (
    <>
      {/* Desktop navbar — hidden on mobile */}
      <header className="hidden sm:block border-b border-border">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-bold text-lg">
              Objekt Trade
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/trades"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Browse Trades
              </Link>
              {session && (
                <Link
                  href="/trades/mine"
                  className="relative text-muted-foreground hover:text-foreground transition-colors"
                >
                  My Trades
                  {matchCount > 0 && (
                    <span className="absolute -top-2 -right-4 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                      {matchCount > 99 ? "99+" : matchCount}
                    </span>
                  )}
                </Link>
              )}
              {session && (
                <Link
                  href="/trades/history"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Trade History
                </Link>
              )}
              {session && (
                <Link
                  href="/trades/new"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  New Trade
                </Link>
              )}
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
                    <Link href={profileHref}>Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/link">Link Cosmo</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/sign-up">Sign up</Link>
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
      />
    </>
  );
}

function MobileNav({
  session,
  matchCount,
  unreadCount,
  profileHref,
}: {
  session: ReturnType<typeof useSession>["data"];
  matchCount: number;
  unreadCount: number;
  profileHref: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — burger on the left, logo next to it */}
      <header className="sm:hidden border-b border-border">
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
            className="font-bold text-lg"
            onClick={() => setOpen(false)}
          >
            Objekt Trade
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
          open ? "translate-x-0" : "-translate-x-full",
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
          <span className="font-bold text-lg">Objekt Trade</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          <MobileNavLink href="/trades" onClick={() => setOpen(false)}>
            Browse Trades
          </MobileNavLink>
          {session && (
            <MobileNavLink href="/trades/mine" onClick={() => setOpen(false)}>
              <span className="flex items-center gap-2">
                My Trades
                {matchCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                    {matchCount > 99 ? "99+" : matchCount}
                  </span>
                )}
              </span>
            </MobileNavLink>
          )}
          {session && (
            <MobileNavLink
              href="/trades/history"
              onClick={() => setOpen(false)}
            >
              Trade History
            </MobileNavLink>
          )}
          {session && (
            <MobileNavLink href="/trades/new" onClick={() => setOpen(false)}>
              New Trade
            </MobileNavLink>
          )}
          {session && (
            <MobileNavLink href="/notifications" onClick={() => setOpen(false)}>
              <span className="flex items-center gap-2">
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
            <>
              <MobileNavLink href="/sign-in" onClick={() => setOpen(false)}>
                Sign in
              </MobileNavLink>
              <MobileNavLink href="/sign-up" onClick={() => setOpen(false)}>
                Sign up
              </MobileNavLink>
            </>
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
                Profile
              </MobileNavLink>
              <MobileNavLink href="/link" onClick={() => setOpen(false)}>
                Link Cosmo
              </MobileNavLink>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
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
      className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {children}
    </Link>
  );
}
