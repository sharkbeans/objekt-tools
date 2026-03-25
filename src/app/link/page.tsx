"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-client";
import type { CosmoPublicUser, ValidArtist } from "@/lib/cosmo/types";

type Step = "search" | "artist" | "verify";

const ARTISTS: { id: ValidArtist; label: string }[] = [
  { id: "tripleS", label: "tripleS" },
  { id: "artms", label: "ARTMS" },
  { id: "idntt", label: "idntt" },
];

export default function LinkCosmoPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CosmoPublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<CosmoPublicUser | null>(
    null,
  );
  const [selectedArtist, setSelectedArtist] = useState<ValidArtist | null>(
    null,
  );
  const [verificationCode, setVerificationCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [verifying, setVerifying] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (session === null) {
      router.push("/sign-in");
    }
  }, [session, router]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSearch = useCallback(async () => {
    if (query.length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/cosmo/search?q=${encodeURIComponent(query)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSearchResults(data.results ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query]);

  async function handleGenerateCode() {
    if (!selectedUser || !selectedArtist) return;

    try {
      const res = await fetch("/api/cosmo/generate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: selectedUser.address,
          cosmoId: selectedUser.id,
          nickname: selectedUser.nickname,
          artistId: selectedArtist,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setVerificationCode(data.code);
      setCountdown(data.expiresIn);
      setStep("verify");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate code",
      );
    }
  }

  async function handleVerify() {
    if (!selectedUser) return;
    setVerifying(true);

    try {
      const res = await fetch("/api/cosmo/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: selectedUser.address }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Linked as ${data.nickname ?? data.address}!`);
      router.push(`/@${data.nickname ?? data.address}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Verification failed",
      );
    } finally {
      setVerifying(false);
    }
  }

  if (!session) return null;

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Link Cosmo Account</CardTitle>
          <CardDescription>
            {step === "search" && "Search for your Cosmo username"}
            {step === "artist" && "Select an artist to verify with"}
            {step === "verify" && "Set the code as your Cosmo status message"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Step 1: Search */}
          {step === "search" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter Cosmo nickname..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button
                  onClick={handleSearch}
                  disabled={searching || query.length < 2}
                >
                  {searching ? "..." : "Search"}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                        selectedUser?.id === user.id
                          ? "border-primary bg-accent"
                          : "border-border"
                      }`}
                      onClick={() => setSelectedUser(user)}
                    >
                      <p className="font-medium">{user.nickname}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {user.address}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {selectedUser && (
                <Button className="w-full" onClick={() => setStep("artist")}>
                  Continue with {selectedUser.nickname}
                </Button>
              )}
            </div>
          )}

          {/* Step 2: Artist selection */}
          {step === "artist" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {ARTISTS.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    className={`rounded-lg border p-4 text-center transition-colors hover:bg-accent ${
                      selectedArtist === artist.id
                        ? "border-primary bg-accent"
                        : "border-border"
                    }`}
                    onClick={() => setSelectedArtist(artist.id)}
                  >
                    {artist.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("search")}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!selectedArtist}
                  onClick={handleGenerateCode}
                >
                  Generate Code
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Verify */}
          {step === "verify" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Set this as your Cosmo status message:
                </p>
                <p className="font-mono text-lg font-bold select-all">
                  {verificationCode}
                </p>
              </div>

              {countdown > 0 && (
                <div className="text-center">
                  <Badge variant="secondary">Expires in {countdown}s</Badge>
                </div>
              )}

              {countdown <= 0 && (
                <p className="text-center text-sm text-destructive">
                  Code expired.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setStep("artist")}
                  >
                    Generate a new one
                  </button>
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("artist")}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={countdown <= 0 || verifying}
                  onClick={handleVerify}
                >
                  {verifying ? "Verifying..." : "Verify"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
