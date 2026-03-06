"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ObjektOwnedPicker } from "@/components/objekt/objekt-owned-picker";
import { ObjektPicker } from "@/components/objekt/objekt-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/auth-client";
import type { ObjektEntry } from "@/lib/cosmo/types";

export default function NewTradePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [haves, setHaves] = useState<ObjektEntry[]>([]);
  const [wants, setWants] = useState<ObjektEntry[]>([]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Please sign in to create a trade.
        </p>
      </div>
    );
  }

  async function handleSubmit() {
    if (haves.length === 0 || wants.length === 0) {
      toast.error("Select at least one objekt for both Have and Want");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description || undefined,
          haves: haves.map((o) => ({
            collectionId: o.collectionId,
            member: o.member,
            season: o.season,
            class: o.class,
            serial: o.serial,
          })),
          wants: wants.map((o) => ({
            collectionId: o.collectionId,
            member: o.member,
            season: o.season,
            class: o.class,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Trade posted!");
      router.push(`/trades/${data.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create trade",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Trade</h1>
        <p className="text-muted-foreground">
          Select what you have and what you want
        </p>
      </div>

      <Tabs defaultValue="have">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="have">Have ({haves.length})</TabsTrigger>
          <TabsTrigger value="want">Want ({wants.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="have">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What do you have?</CardTitle>
              <CardDescription>
                Select objekts you want to trade away
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ObjektOwnedPicker
                selected={haves}
                onSelect={(o) => setHaves((prev) => [...prev, o])}
                onDeselect={(o) =>
                  setHaves((prev) =>
                    prev.filter((h) =>
                      o.serial != null ? h.serial !== o.serial : h.collectionId !== o.collectionId,
                    ),
                  )
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="want">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What do you want?</CardTitle>
              <CardDescription>
                Select objekts you&apos;re looking for
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ObjektPicker
                selected={wants}
                onSelect={(o) => setWants((prev) => [...prev, o])}
                onDeselect={(o) =>
                  setWants((prev) =>
                    prev.filter((w) => w.collectionId !== o.collectionId),
                  )
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Note (optional)</Label>
            <Input
              id="description"
              placeholder="Any additional details about this trade..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex gap-4 items-center">
            <Button
              onClick={handleSubmit}
              disabled={submitting || haves.length === 0 || wants.length === 0}
              className="flex-1"
            >
              {submitting ? "Posting..." : "Post Trade"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {haves.length} have, {wants.length} want
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
