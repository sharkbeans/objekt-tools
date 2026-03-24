"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";

interface UserProfile {
  nickname: string;
  image: string | null;
  linkedAt: string;
  stats: {
    completed: number;
    cancelled: number;
    defaulted: number;
    openPosts: number;
  };
  banned: { reason: string; since: string } | null;
}

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = use(params);

  const { data: profile, isLoading, error } = useQuery<UserProfile>({
    queryKey: ["user-profile", nickname],
    queryFn: async () => {
      const res = await fetch(`/api/users/${encodeURIComponent(nickname)}`);
      if (!res.ok) throw new Error("User not found");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h1 className="text-2xl font-bold mb-2">User not found</h1>
        <p className="text-muted-foreground">
          No user with the nickname &quot;{nickname}&quot; exists.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-bold">
              {profile.nickname.charAt(0).toUpperCase()}
            </div>
            <div>
              <CardTitle className="text-xl">@{profile.nickname}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Member since{" "}
                {new Date(profile.linkedAt).toLocaleDateString("en-GB", {
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {profile.banned && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
              <ShieldAlert className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div>
                <p className="font-medium text-destructive">Trade banned</p>
                <p className="text-muted-foreground">{profile.banned.reason}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Completed"
              value={profile.stats.completed}
              icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
            />
            <StatCard
              label="Cancelled"
              value={profile.stats.cancelled}
              icon={<XCircle className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              label="Defaulted"
              value={profile.stats.defaulted}
              icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />}
            />
            <StatCard
              label="Open Posts"
              value={profile.stats.openPosts}
            />
          </div>
        </CardContent>
      </Card>

      {profile.stats.openPosts > 0 && (
        <div className="text-center">
          <Link
            href={`/trades?user=${encodeURIComponent(profile.nickname)}`}
            className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
          >
            View open trade posts
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border px-4 py-3 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
