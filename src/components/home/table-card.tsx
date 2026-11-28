import Image from "next/image";
import type React from "react";
import type { ShowcaseCard } from "@/lib/home/showcase";
import { cn } from "@/lib/utils";
import styles from "./home.module.css";

// Cards on the tables render about 70-130px wide.
const CARD_SIZES = "(min-width: 768px) 128px, 96px";

/** One objekt on a home-page table: lit (in colour) or dimmed background. */
export function TableCard({
  card,
  lit = false,
  ref,
}: {
  card: ShowcaseCard;
  lit?: boolean;
  ref?: React.Ref<HTMLSpanElement>;
}) {
  return (
    <span ref={ref} className={cn(styles.card, lit ? styles.lit : styles.dim)}>
      <Image
        src={card.image}
        alt=""
        fill
        sizes={CARD_SIZES}
        draggable={false}
      />
    </span>
  );
}
