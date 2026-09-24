import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Camera,
  ChevronRight,
  CreditCard,
  Library,
  Puzzle,
  RectangleVertical,
  RefreshCcw,
  Rows3,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type React from "react";
import { sectionHref } from "@/lib/sections";

function SpinIcon() {
  return (
    <div
      className="relative"
      style={{ width: "36px", height: "36px" }}
      suppressHydrationWarning
    >
      <RectangleVertical
        className="text-white absolute"
        style={{
          width: "43px",
          height: "43px",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
        strokeWidth={1.25}
      />
      <RefreshCcw
        className="text-white absolute"
        style={{
          width: "18px",
          height: "18px",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
        strokeWidth={2.5}
      />
    </div>
  );
}

/** The loop the site is built around: see what's missing, find who has it. */
const primary: {
  title: string;
  description: string;
  href: string;
  image: string;
  Icon: LucideIcon;
  secondary?: { label: string; href: string; Icon: LucideIcon };
}[] = [
  {
    title: "Your grids",
    description: "See every FCO you're missing for your next grid.",
    href: "/collection",
    image: "/home-tiles/collection.png",
    Icon: Library,
  },
  {
    title: "Match on Discord",
    description: "Match the trade posts you already scroll past.",
    href: "/match",
    image: "/home-tiles/trades.png",
    Icon: ArrowLeftRight,
    secondary: { label: "Get the extension", href: "/extension", Icon: Puzzle },
  },
];

const moreTools: {
  title: string;
  description: string;
  href: string;
  image: string;
  Icon?: LucideIcon;
  iconRotate?: number;
  CustomIcon?: React.ComponentType;
}[] = [
  {
    title: "Lists",
    description: "Turn a tradelist into a shareable page.",
    href: "/list",
    image: "/home-tiles/lists.png",
    Icon: Rows3,
  },
  {
    title: "Objektify",
    description: "Create custom objekt cards.",
    href: "/objekt-maker",
    image: "/home-tiles/objektify.png",
    Icon: CreditCard,
    iconRotate: 90,
  },
  {
    title: "Proofshot",
    description: "Generate proofshot images.",
    href: "/proofshot",
    image: "/home-tiles/proofshot.png",
    Icon: Camera,
  },
  {
    title: "Spin",
    description: "Random draw.",
    href: "/spin",
    image: "/home-tiles/spin.png",
    CustomIcon: SpinIcon,
  },
];

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold mb-2">objekt.my</h1>
      <p className="text-base mb-6 text-muted-foreground">
        Track your grids. Find who has what you're missing.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {primary.map(({ title, description, href, image, Icon, secondary }) => (
          <div
            key={href}
            className="group relative rounded-2xl overflow-hidden bg-[#1a1a1a] min-h-56 sm:aspect-4/3 flex flex-col justify-between border border-white/5 hover:border-white/70 transition-colors p-5"
          >
            <Image
              src={image}
              alt=""
              aria-hidden
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-cover object-top opacity-60 transition-transform duration-500 ease-out group-hover:scale-105"
            />
            {/* Keeps the title/description legible over the portrait. */}
            <div className="absolute inset-0 bg-linear-to-t from-black via-black/75 to-black/30" />
            <Icon
              className="relative text-white"
              style={{ width: "44px", height: "44px" }}
              strokeWidth={1.25}
            />
            {/* The card link covers the whole card; the secondary link
                  sits above it so both stay clickable without nesting
                  anchors. */}
            <Link
              href={sectionHref(href)}
              aria-label={title}
              className="absolute inset-0 z-10"
            />
            <div className="relative">
              <p className="text-white font-bold text-xl leading-snug">
                {title}
              </p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-white/75 text-sm leading-snug">
                  {description}
                </p>
                <ChevronRight className="text-white/60 w-5 h-5 shrink-0 ml-1 -mr-1 group-hover:text-white transition-colors" />
              </div>
              {secondary && (
                <Link
                  href={sectionHref(secondary.href)}
                  className="relative z-20 mt-3 inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/40 px-2.5 py-1 text-xs font-medium text-white hover:border-white/60 transition-colors"
                >
                  <secondary.Icon className="size-3.5" />
                  {secondary.label}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        More tools
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {moreTools.map(
          ({
            title,
            description,
            href,
            image,
            Icon,
            iconRotate,
            CustomIcon,
          }) => (
            <Link key={href} href={sectionHref(href)} className="group">
              <div className="relative rounded-xl overflow-hidden bg-[#1a1a1a] aspect-4/3 flex flex-col justify-between border border-white/5 hover:border-white/70 transition-colors p-3">
                <Image
                  src={image}
                  alt=""
                  aria-hidden
                  fill
                  sizes="(min-width: 640px) 25vw, 50vw"
                  className="object-cover object-top opacity-50 transition-transform duration-500 ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-linear-to-t from-black via-black/75 to-black/30" />
                <div className="relative flex-1 flex items-center justify-center">
                  {CustomIcon ? (
                    <CustomIcon />
                  ) : Icon ? (
                    <Icon
                      className="text-white"
                      style={{
                        width: "36px",
                        height: "36px",
                        transform: iconRotate
                          ? `rotate(${iconRotate}deg)`
                          : undefined,
                      }}
                      strokeWidth={1.25}
                    />
                  ) : null}
                </div>
                <div className="relative">
                  <p className="text-white font-semibold text-sm leading-snug">
                    {title}
                  </p>
                  <p className="text-white/70 text-xs leading-snug">
                    {description}
                  </p>
                </div>
              </div>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
