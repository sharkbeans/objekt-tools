"use client";

import { CheckIcon, ChevronDownIcon, Loader2Icon } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseOffering } from "@/lib/discord/match";
import { MAX_CAPTURE_NAME } from "@/lib/match/captures";
import { ExtensionSetup } from "./extension-setup";

const STEPS = [
  "Discord is open with your list ready",
  "Press Search in the Objekt Match panel",
  "When it finishes, press Open in match",
];

/** Say what happens next, so leaving for Discord does not feel like a dead end. */
function WaitingForCapture({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <ol className="space-y-2.5">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2.5 text-sm">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                index === 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {index === 0 ? <CheckIcon className="size-3.5" /> : index + 1}
            </span>
            <span className={index === 0 ? "text-muted-foreground" : ""}>
              {step}
            </span>
          </li>
        ))}
      </ol>
      <Button variant="outline" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}

function ManualCapture({
  onSave,
  onFiles,
}: {
  onSave: (text: string, name: string) => void;
  onFiles: (files: File[], name: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const target = event.currentTarget;
    await onFiles(Array.from(target.files ?? []), name);
    target.value = "";
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="capture-text" className="text-sm text-muted-foreground">
          Discord messages, with the name and time lines
        </label>
        <Textarea
          id="capture-text"
          rows={7}
          placeholder={
            "trader — 3:41 PM\nHAVE\nSeoYeon CC101\nWANT\nJiYeon CC102"
          }
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="capture-name" className="text-sm text-muted-foreground">
          Name this capture (optional)
        </label>
        <Input
          id="capture-name"
          maxLength={MAX_CAPTURE_NAME}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <input
        ref={input}
        type="file"
        accept=".txt,.text,.md,text/plain"
        multiple
        className="hidden"
        onChange={importFiles}
        aria-label="Import text files"
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!text.trim()} onClick={() => onSave(text, name)}>
          Save capture
        </Button>
        <Button variant="outline" onClick={() => input.current?.click()}>
          Import text files
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        What you add stays in this browser. You can choose to load any linked
        public lists together afterwards.
      </p>
    </div>
  );
}

function NewCaptureBody({
  extensionInstalled,
  initialWants,
  onSearch,
  onSave,
  onFiles,
}: {
  extensionInstalled: boolean | null;
  initialWants: string;
  onSearch: (wants: string[]) => Promise<boolean>;
  onSave: (text: string, name: string) => void;
  onFiles: (files: File[], name: string) => Promise<void>;
}) {
  const [wants, setWants] = useState(initialWants);
  const [searching, setSearching] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [manual, setManual] = useState(false);
  const cards = parseOffering(wants).length;
  const search = async () => {
    setSearching(true);
    const lines = wants
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const opened = await onSearch(lines);
    setSearching(false);
    if (opened) setWaiting(true);
  };

  if (waiting)
    return (
      <>
        <DialogHeader>
          <DialogTitle>Finish your capture in Discord</DialogTitle>
          <DialogDescription>
            It appears here as soon as you open it in match.
          </DialogDescription>
        </DialogHeader>
        <WaitingForCapture onBack={() => setWaiting(false)} />
      </>
    );

  // Searching is the way to capture. Without the extension there is only the
  // by-hand route, so that is simply what the dialog is.
  if (!extensionInstalled)
    return (
      <>
        <DialogHeader>
          <DialogTitle>New capture</DialogTitle>
          <DialogDescription>
            Add posts from a Discord trade channel, or let Objekt Match search
            for them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ExtensionSetup
            installed={extensionInstalled}
            source="paste"
            compact
          />
          <ManualCapture onSave={onSave} onFiles={onFiles} />
        </div>
      </>
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>New capture</DialogTitle>
        <DialogDescription>
          Objekt Match searches Discord for these cards and brings the posts
          back here.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="capture-wants" className="text-sm font-medium">
            What are you looking for?
          </label>
          <Textarea
            id="capture-wants"
            rows={3}
            placeholder="SeoYeon CC101-120"
            value={wants}
            onChange={(event) => setWants(event.target.value)}
          />
          {cards > 0 && (
            <p className="text-xs text-muted-foreground">
              {cards} card{cards === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Button className="w-full" disabled={searching} onClick={search}>
            {searching && <Loader2Icon className="size-4 animate-spin" />}
            Search Discord
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Opens Discord with your list ready. You press Search there.
          </p>
        </div>
        <div className="space-y-3 border-t pt-2">
          <Button
            variant="ghost"
            className="w-full justify-between px-1"
            aria-expanded={manual}
            onClick={() => setManual(!manual)}
          >
            Add posts by hand
            <ChevronDownIcon
              className={`size-4 transition-transform ${manual ? "rotate-180" : ""}`}
            />
          </Button>
          {manual && <ManualCapture onSave={onSave} onFiles={onFiles} />}
        </div>
      </div>
    </>
  );
}

/**
 * How a capture starts. Mounted fresh each time it opens, so a half-typed list
 * or an earlier "waiting" step does not linger into the next one.
 */
export function NewCaptureDialog({
  open,
  onOpenChange,
  ...body
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extensionInstalled: boolean | null;
  initialWants: string;
  onSearch: (wants: string[]) => Promise<boolean>;
  onSave: (text: string, name: string) => void;
  onFiles: (files: File[], name: string) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <NewCaptureBody {...body} />
      </DialogContent>
    </Dialog>
  );
}
