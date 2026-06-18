"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Pencil,
  Search,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { UnlinkCosmoDialog } from "@/components/unlink-cosmo-dialog";
import { useSession } from "@/lib/auth-client";
import type { CosmoPublicUser, ValidArtist } from "@/lib/cosmo/types";

type Step = "search" | "artist" | "verify" | "done";

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
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const editProfileRef = useRef<HTMLDivElement>(null);
  const [typedCode, setTypedCode] = useState("");
  const [linkedAs, setLinkedAs] = useState("");
  const [deletingCode, setDeletingCode] = useState("");
  const [existingNickname, setExistingNickname] = useState<string | null>(null);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const doneEditProfileRef = useRef<HTMLDivElement>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (session === null) {
      router.push("/sign-in");
    }
  }, [session, router]);

  // Check if already linked
  useEffect(() => {
    if (!session) return;
    fetch("/api/cosmo/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.nickname) setExistingNickname(data.nickname);
      })
      .catch(() => {});
  }, [session]);

  // Auto-transition mockup on verify step
  useEffect(() => {
    if (step !== "verify") return;
    setShowEditProfile(false);
    const t = setTimeout(() => setShowEditProfile(true), 3000);
    return () => clearTimeout(t);
  }, [step]);

  // Auto-scroll edit profile mockup to bio section after transition
  useEffect(() => {
    if (!showEditProfile) return;
    setTypedCode("");
    const scrollT = setTimeout(() => {
      editProfileRef.current?.scrollTo({ top: 120, behavior: "smooth" });
    }, 800);
    return () => clearTimeout(scrollT);
  }, [showEditProfile]);

  // Done step: scroll to bio then animate deletion
  useEffect(() => {
    if (step !== "done" || !verificationCode) return;
    setDeletingCode(verificationCode);
    const scrollT = setTimeout(() => {
      doneEditProfileRef.current?.scrollTo({ top: 120, behavior: "smooth" });
    }, 500);
    let i = verificationCode.length;
    let interval: ReturnType<typeof setInterval>;
    const typeT = setTimeout(() => {
      interval = setInterval(() => {
        i--;
        setDeletingCode(verificationCode.slice(0, i));
        if (i <= 0) clearInterval(interval);
      }, 80);
    }, 1400);
    return () => {
      clearTimeout(scrollT);
      clearTimeout(typeT);
      clearInterval(interval);
    };
  }, [step, verificationCode]);

  // Type out the verification code after scroll settles
  useEffect(() => {
    if (!showEditProfile || !verificationCode) return;
    let i = 0;
    let interval: ReturnType<typeof setInterval>;
    const delay = setTimeout(() => {
      interval = setInterval(() => {
        i++;
        setTypedCode(verificationCode.slice(0, i));
        if (i >= verificationCode.length) clearInterval(interval);
      }, 80);
    }, 1400);
    return () => {
      clearTimeout(delay);
      clearInterval(interval);
    };
  }, [showEditProfile, verificationCode]);

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
      setLinkedAs(data.nickname ?? data.address);
      setStep("done");
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
      <UnlinkCosmoDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        onSuccess={() => {
          setExistingNickname(null);
          setStep("search");
        }}
      />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Link Cosmo Account</CardTitle>
          <CardDescription>
            {step === "search" && "Search for your Cosmo username"}
            {step === "artist" && "Which artist are you viewing in Cosmo?"}
            {step === "verify" && "Set the code as your Cosmo status message"}
            {step === "done" && "You're all set!"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Already linked — show status and unlink option */}
          {existingNickname && step === "search" && (
            <div className="space-y-4 pb-4 mb-4 border-b border-border">
              <p className="text-sm text-muted-foreground">
                Currently linked as{" "}
                <span className="font-semibold text-foreground">
                  @{existingNickname}
                </span>
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUnlinkOpen(true)}
              >
                Unlink Cosmo
              </Button>
            </div>
          )}
          {/* Step 1: Search */}
          {step === "search" && (
            <div className="space-y-4">
              {/* Cosmo profile illustration */}
              <div
                className="relative overflow-hidden rounded-md border border-border h-57.5"
                style={{
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                }}
              >
                <div className="bg-background text-sm h-57.5 overflow-y-auto">
                  {/* top bar */}
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <span className="text-lg font-bold text-foreground flex items-center gap-0.5">
                      tripleS <ChevronDown className="w-5 h-5" />
                    </span>
                    <div className="flex items-center gap-2.5 text-muted-foreground">
                      <span className="rounded bg-purple-300 px-2 py-0.5 text-black font-medium">
                        Shop
                      </span>
                      <Settings className="w-5 h-5" />
                    </div>
                  </div>
                  {/* profile row */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src="/user.png"
                        alt=""
                        className="w-12 h-12 rounded-full shrink-0 object-cover"
                      />
                      <span className="text-base font-semibold text-foreground ring-2 ring-amber-400 animate-pulse shadow-[0_0_8px_3px_rgba(251,191,36,0.5)] rounded px-1">
                        nickname
                      </span>
                    </div>
                    <span className="rounded bg-muted px-2.5 py-1 text-white flex items-center gap-1 text-xs">
                      <History className="w-3.5 h-3.5" />
                      History
                    </span>
                  </div>
                  {/* streak + bio */}
                  <div className="px-4 pb-2 text-muted-foreground text-sm">
                    <p>
                      with WAV <span className="text-purple-400">D+100</span> ·
                      7-Day Streak
                    </p>
                    <br />
                    <p className="text-foreground">Your bio here</p>
                  </div>
                  {/* search + pencil row */}
                  <div className="flex items-center gap-2.5 px-4 py-3">
                    <div className="flex flex-1 items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-muted-foreground">
                      <Search className="w-4 h-4 shrink-0" />
                      <span>Search others&apos; profiles</span>
                    </div>
                    <div className="aspect-square rounded-xl bg-muted p-2.5 text-muted-foreground shrink-0 flex items-center justify-center">
                      <Pencil className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>

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
                <div className="max-h-[calc(7*3.75rem)] overflow-y-auto space-y-2 pr-1">
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
                      <div className="min-w-0">
                        <p className="font-medium truncate">{user.nickname}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {user.address}
                        </p>
                      </div>
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
              {/* Cosmo profile illustration */}
              <div
                className="rounded-md border border-border bg-background overflow-hidden text-sm"
                style={{
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                }}
              >
                {/* top bar */}
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="text-lg font-bold text-foreground flex items-center gap-0.5 ring-2 ring-amber-400 animate-pulse shadow-[0_0_8px_3px_rgba(251,191,36,0.5)] rounded px-1">
                    tripleS <ChevronDown className="w-5 h-5" />
                  </span>
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <span className="rounded bg-purple-300 px-2 py-0.5 text-black font-medium">
                      Shop
                    </span>
                    <Settings className="w-5 h-5" />
                  </div>
                </div>
                {/* profile row */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src="/user.png"
                      alt=""
                      className="w-12 h-12 rounded-full shrink-0 object-cover"
                    />
                    <span className="text-base font-semibold text-foreground">
                      {selectedUser?.nickname ?? "nickname"}
                    </span>
                  </div>
                  <span className="rounded bg-muted px-2.5 py-1 text-white flex items-center gap-1 text-xs">
                    <History className="w-3.5 h-3.5" />
                    History
                  </span>
                </div>
                {/* streak + bio */}
                <div className="px-4 pb-2 text-muted-foreground text-sm">
                  <p>
                    with WAV <span className="text-purple-400">D+100</span> ·
                    7-Day Streak
                  </p>
                  <br></br>
                  <p className="text-foreground">Your bio here</p>
                </div>
                {/* search + pencil row */}
                <div className="flex items-center gap-2.5 px-4 py-3">
                  <div className="flex flex-1 items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-muted-foreground">
                    <Search className="w-4 h-4 shrink-0" />
                    <span>Search others&apos; profiles</span>
                  </div>
                  <div className="aspect-square rounded-xl bg-muted p-2.5 text-muted-foreground shrink-0 flex items-center justify-center">
                    <Pencil className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Select the artist shown at the top of your Cosmo profile. You
                don&apos;t need to switch, just use whichever artist you&apos;re
                currently on.
              </p>

              <div className="space-y-2">
                {ARTISTS.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent flex items-center justify-between ${
                      selectedArtist === artist.id
                        ? "border-primary bg-accent"
                        : "border-border"
                    }`}
                    onClick={() => setSelectedArtist(artist.id)}
                  >
                    <span className="font-medium">{artist.label}</span>
                    {selectedArtist === artist.id && (
                      <span className="text-primary">✓</span>
                    )}
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
              {/* Mockup transition container */}
              <div
                className="relative overflow-hidden rounded-md border border-border h-[230px]"
                style={{
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                }}
                onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
                onTouchEnd={(e) => {
                  if (touchStartX === null) return;
                  const delta = touchStartX - e.changedTouches[0].clientX;
                  if (delta > 40) setShowEditProfile(true);
                  if (delta < -40) setShowEditProfile(false);
                  setTouchStartX(null);
                }}
              >
                {/* Profile screen */}
                <div
                  className={`bg-background text-sm transition-all duration-500 h-[230px] overflow-y-auto ${showEditProfile ? "opacity-0 -translate-x-full absolute inset-0" : "opacity-100 translate-x-0"}`}
                >
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <span className="text-lg font-bold text-foreground flex items-center gap-0.5">
                      tripleS <ChevronDown className="w-5 h-5" />
                    </span>
                    <div className="flex items-center gap-2.5 text-muted-foreground">
                      <span className="rounded bg-purple-300 px-2 py-0.5 text-black font-medium">
                        Shop
                      </span>
                      <Settings className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src="/user.png"
                        alt=""
                        className="w-12 h-12 rounded-full shrink-0 object-cover"
                      />
                      <span className="text-base font-semibold text-foreground">
                        {selectedUser?.nickname ?? "nickname"}
                      </span>
                    </div>
                    <span className="rounded bg-muted px-2.5 py-1 text-white flex items-center gap-1 text-xs">
                      <History className="w-3.5 h-3.5" />
                      History
                    </span>
                  </div>
                  <div className="px-4 pb-2 text-muted-foreground text-sm">
                    <p>
                      with WAV <span className="text-purple-400">D+100</span> ·
                      7-Day Streak
                    </p>
                    <p className="text-foreground mt-1">Your bio here</p>
                  </div>
                  <div className="flex items-center gap-2.5 px-4 py-3">
                    <div className="flex flex-1 items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-muted-foreground">
                      <Search className="w-4 h-4 shrink-0" />
                      <span>Search others&apos; profiles</span>
                    </div>
                    <div className="aspect-square rounded-xl bg-muted p-2.5 text-muted-foreground shrink-0 flex items-center justify-center ring-2 ring-amber-400 animate-pulse shadow-[0_0_8px_3px_rgba(251,191,36,0.5)]">
                      <Pencil className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Edit Profile screen */}
                <div
                  ref={editProfileRef}
                  className={`bg-background text-sm transition-all duration-500 h-[230px] overflow-y-auto ${showEditProfile ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full absolute inset-0"}`}
                >
                  {/* header */}
                  <div className="flex items-center justify-center border-b border-border px-4 py-3 relative">
                    <span className="font-bold text-foreground text-base">
                      Edit Profile
                    </span>
                  </div>
                  {/* avatar */}
                  <div className="flex flex-col items-center gap-1.5 pt-5 pb-3">
                    <img
                      src="/user.png"
                      alt=""
                      className="w-16 h-16 rounded-full object-cover"
                    />
                    <span className="text-xs text-muted-foreground">
                      Change Image
                    </span>
                  </div>
                  {/* nickname field */}
                  <div className="px-4 pb-3">
                    <p className="font-bold text-foreground mb-2">Nickname</p>
                    <div className="rounded-lg bg-muted px-4 py-3 text-foreground text-sm">
                      {selectedUser?.nickname ?? "nickname"}
                    </div>
                  </div>
                  {/* bio field */}
                  <div className="px-4 pb-5">
                    <p className="font-bold text-foreground mb-2">Bio</p>
                    <div className="rounded-lg bg-muted px-4 py-3 text-sm h-24 ring-2 ring-amber-400 animate-pulse shadow-[0_0_8px_3px_rgba(251,191,36,0.4)] font-mono">
                      {typedCode || (
                        <span className="text-muted-foreground">
                          Type the code here...
                        </span>
                      )}
                      {typedCode &&
                        typedCode.length < verificationCode.length && (
                          <span className="animate-pulse">|</span>
                        )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mockup pagination */}
              <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setShowEditProfile(false)}
                  disabled={!showEditProfile}
                  className="disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>{showEditProfile ? "2" : "1"} / 2</span>
                <button
                  type="button"
                  onClick={() => setShowEditProfile(true)}
                  disabled={showEditProfile}
                  className="disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

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

          {/* Step 4: Done */}
          {step === "done" && (
            <div className="space-y-4">
              {/* Edit Profile mockup with deletion animation */}
              <div
                className="relative overflow-hidden rounded-md border border-border h-[230px]"
                style={{
                  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                }}
              >
                <div
                  ref={doneEditProfileRef}
                  className="bg-background text-sm h-[230px] overflow-y-auto"
                >
                  {/* header */}
                  <div className="flex items-center justify-center border-b border-border px-4 py-3">
                    <span className="font-bold text-foreground text-base">
                      Edit Profile
                    </span>
                  </div>
                  {/* avatar */}
                  <div className="flex flex-col items-center gap-1.5 pt-5 pb-3">
                    <img
                      src="/user.png"
                      alt=""
                      className="w-16 h-16 rounded-full object-cover"
                    />
                    <span className="text-xs text-muted-foreground">
                      Change Image
                    </span>
                  </div>
                  {/* nickname field */}
                  <div className="px-4 pb-3">
                    <p className="font-bold text-foreground mb-2">Nickname</p>
                    <div className="rounded-lg bg-muted px-4 py-3 text-foreground text-sm">
                      {selectedUser?.nickname ?? "nickname"}
                    </div>
                  </div>
                  {/* bio field */}
                  <div className="px-4 pb-5">
                    <p className="font-bold text-foreground mb-2">Bio</p>
                    <div className="rounded-lg bg-muted px-4 py-3 text-sm h-24 font-mono text-foreground">
                      {deletingCode}
                      {deletingCode.length > 0 && (
                        <span className="animate-pulse">|</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Your Cosmo account is now linked. You can safely delete the{" "}
                <span className="font-mono text-foreground">
                  {verificationCode}
                </span>{" "}
                message from your bio.
              </p>

              <Button
                className="w-full"
                onClick={() => router.push(`/@${linkedAs}`)}
              >
                Finish
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
