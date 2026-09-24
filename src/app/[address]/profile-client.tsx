"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LinkIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { UnlinkCosmoDialog } from "@/components/auth/unlink-cosmo-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { decodeRouteParam } from "@/lib/route-params";
import { sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

interface UserProfile {
  linked: boolean;
  address: string;
  nickname: string | null;
  email: string | null;
  image: string | null;
  linkedAt: string | null;
  discordId: string | null;
  discordUsername: string | null;
  viewer: {
    isOwner: boolean;
    userId: string | null;
  };
}

export function ProfileClient({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: rawAddress } = use(params);
  const decoded = decodeRouteParam(rawAddress);
  const router = useRouter();

  const hasProfilePrefix = decoded.startsWith("@");
  const identifier = hasProfilePrefix ? decoded.slice(1) : decoded;
  const isValidProfile = identifier.trim().length > 0;

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery<UserProfile | null>({
    queryKey: ["user-profile", identifier, hasProfilePrefix],
    queryFn: async () => {
      const res = await fetch(`/api/users/${encodeURIComponent(identifier)}`);
      if (res.status === 301) {
        const json = await res.json();
        if (json.nickname) {
          router.replace(`/@${encodeURIComponent(json.nickname)}`);
          return null;
        }
        if (json.address) {
          router.replace(`/@${encodeURIComponent(json.address)}`);
          return null;
        }
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "User not found");
      }
      const json = (await res.json()) as UserProfile;
      if (!hasProfilePrefix && json.nickname) {
        router.replace(`/@${encodeURIComponent(json.nickname)}`);
        return null;
      }
      return json;
    },
    enabled: isValidProfile,
  });

  const isOwner = !!profile?.viewer.isOwner;
  const queryClient = useQueryClient();
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  if (!isValidProfile) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-muted-foreground">
          Looking for a user profile? Try{" "}
          <span className="font-mono">/@username</span>
        </p>
      </div>
    );
  }

  if (isLoading || profile === null) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error || !profile) {
    const message = error instanceof Error ? error.message : "User not found";
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h1 className="text-2xl font-bold mb-2">{message}</h1>
        {message === "User not found" && (
          <p className="text-muted-foreground">
            No Cosmo user or linked objekt.my account named &quot;{identifier}
            &quot; exists.
          </p>
        )}
      </div>
    );
  }

  const displayName = profile.nickname ?? profile.address;
  const isSjarkbean = profile.nickname?.toLowerCase() === "sjarkbean";
  const collectionHref = sectionHref(
    `/collection/${encodeURIComponent(profile.nickname ?? profile.address)}`,
  );
  const profilePath = `/@${encodeURIComponent(displayName)}`;
  const linkHref = `/link?nickname=${encodeURIComponent(
    displayName,
  )}&returnTo=${encodeURIComponent(profilePath)}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <UnlinkCosmoDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["cosmo-link-status"] });
          queryClient.invalidateQueries({
            queryKey: ["user-profile", identifier],
          });
        }}
      />
      <Card className="relative flex flex-col gap-6 overflow-hidden rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
        {isSjarkbean && (
          <>
            <div className="absolute inset-0">
              <Image
                src="/profile.jpg"
                alt=""
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 896px"
              />
            </div>
            <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
            <div
              className="absolute inset-0"
              aria-hidden="true"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0, 0, 0, 0) 18%, rgba(0, 0, 0, 0.12) 52%, rgba(0, 0, 0, 0.38) 78%, rgba(0, 0, 0, 0.88) 100%)",
              }}
            />
          </>
        )}

        <CardHeader
          className={cn("relative z-10", isSjarkbean && "text-white")}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold",
                  isSjarkbean && "bg-black/40 text-white",
                )}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate text-xl">
                  {profile.nickname ? (
                    <>@{profile.nickname}</>
                  ) : (
                    <span className="font-mono text-sm">{profile.address}</span>
                  )}
                </CardTitle>
                <CardDescription className={cn(isSjarkbean && "text-white/80")}>
                  {profile.linkedAt
                    ? `Member since ${new Date(
                        profile.linkedAt,
                      ).toLocaleDateString("en-GB", {
                        month: "short",
                        year: "numeric",
                      })}`
                    : "Cosmo user"}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent
          className={cn("relative z-10", isSjarkbean && "text-white")}
        >
          {profile.discordUsername && (
            <div className="mb-4">
              <p
                className={cn(
                  "mb-1 text-sm font-medium text-muted-foreground",
                  isSjarkbean && "text-white/75",
                )}
              >
                Discord
              </p>
              {profile.discordId ? (
                <a
                  href={`https://discord.com/users/${profile.discordId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md bg-[#5865F2] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#4752C4]"
                >
                  <svg
                    className="h-4 w-4 fill-current"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  {profile.discordUsername}
                </a>
              ) : (
                <p className="text-sm">{profile.discordUsername}</p>
              )}
            </div>
          )}

          {profile.linked ? (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={collectionHref}>
                View Collection & Grid
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/20 p-4 sm:p-5">
                <div className="space-y-1">
                  <p className="text-lg font-semibold">
                    This account hasn&apos;t linked objekt.my yet
                  </p>
                  <p className="text-sm text-muted-foreground">
                    You can still browse their full collection and grid.
                  </p>
                </div>
                <Button asChild size="lg" className="mt-4 w-full sm:w-auto">
                  <Link href={collectionHref}>
                    View Collection & Grid
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="truncate text-sm text-muted-foreground">
                  Is this your account?
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={linkHref}>
                    <LinkIcon className="h-4 w-4" />
                    Link profile
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {isOwner && profile.nickname && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUnlinkOpen(true)}
              >
                Unlink Cosmo
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
