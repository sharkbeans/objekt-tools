import { Loader2Icon } from "lucide-react";
import { CosmoIcon } from "@/components/cosmo-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The way to your own cards on /match, which is loading a Cosmo inventory —
 * so it says Cosmo and looks like a Cosmo button: white with black text and
 * the Cosmo mark, in either theme, the way a "Sign in with…" button keeps its
 * brand. It opens the same editor every "add my objekts" button used to.
 */
export function CosmoButton({
  loaded,
  loading = false,
  onClick,
  size = "default",
  className,
}: {
  /** An inventory is loaded already, so this changes it. */
  loaded: boolean;
  loading?: boolean;
  onClick: () => void;
  /** `sm` for a row of small buttons; otherwise the larger default. */
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "rounded-lg border border-black/15 bg-white font-semibold text-black shadow-sm hover:bg-neutral-100 dark:border-transparent dark:hover:bg-neutral-200",
        size === "sm"
          ? "h-9 gap-2 px-3.5 text-sm has-[>svg]:px-3.5"
          : "h-11 gap-2.5 px-5 text-base has-[>svg]:px-5",
        className,
      )}
    >
      {loading ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <CosmoIcon className={size === "sm" ? "size-4" : "size-5"} />
      )}
      {loading
        ? "Loading inventory…"
        : loaded
          ? "Change Cosmo"
          : "Add from Cosmo"}
    </Button>
  );
}
