import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Camera,
  ChevronRight,
  CreditCard,
  Library,
  RectangleVertical,
  RefreshCcw,
  Rows3,
} from "lucide-react";
import Link from "next/link";
import type React from "react";

function TradesIcon() {
  return (
    <div
      className="relative"
      style={{ width: "56px", height: "56px" }}
      suppressHydrationWarning
    >
      <RectangleVertical
        className="text-white absolute"
        style={{
          width: "67px",
          height: "67px",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
        strokeWidth={1.25}
      />
      <ArrowLeftRight
        className="text-white absolute"
        style={{
          width: "28px",
          height: "28px",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
        strokeWidth={2.5}
      />
    </div>
  );
}

function SpinIcon() {
  return (
    <div
      className="relative"
      style={{ width: "56px", height: "56px" }}
      suppressHydrationWarning
    >
      <RectangleVertical
        className="text-white absolute"
        style={{
          width: "67px",
          height: "67px",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
        strokeWidth={1.25}
      />
      <RefreshCcw
        className="text-white absolute"
        style={{
          width: "28px",
          height: "28px",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
        strokeWidth={2.5}
      />
    </div>
  );
}

const tools: {
  title: string;
  description: string;
  href: string;
  Icon?: LucideIcon;
  iconRotate?: number;
  CustomIcon?: React.ComponentType;
}[] = [
  {
    title: "Trades",
    description: "Browse, post, and match trades.",
    href: "/trades",
    CustomIcon: TradesIcon,
  },
  {
    title: "Lists",
    description: "Turn tradelist into a shareable page.",
    href: "/list",
    Icon: Rows3,
  },
  {
    title: "Objektify",
    description: "Create custom objekt cards.",
    href: "/objekt-maker",
    Icon: CreditCard,
    iconRotate: 90,
  },
  {
    title: "Proofshot",
    description: "Generate proofshot images.",
    href: "/proofshot",
    Icon: Camera,
  },
  {
    title: "Spin",
    description: "Random Draw",
    href: "/spin",
    CustomIcon: SpinIcon,
  },
  {
    title: "Dex",
    description: "Track your collection progress.",
    href: "/progress",
    Icon: Library,
  },
];

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold mb-4">objekt.my</h1>
      <h3 className="text-md mb-6 text-gray-200 ">
        {" "}
        Cosmo Tools for Collectors.{" "}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tools.map(
          ({ title, description, href, Icon, iconRotate, CustomIcon }) => (
            <Link key={href} href={href} className="group">
              <div className="relative rounded-2xl overflow-hidden bg-[#1a1a1a] aspect-[4/4.5] flex flex-col justify-between border border-white/5 hover:border-white/70 transition-colors p-4">
                <div className="flex-1 flex items-center justify-center">
                  {CustomIcon ? (
                    <CustomIcon />
                  ) : Icon ? (
                    <Icon
                      className="text-white transition-colors"
                      style={{
                        width: "56px",
                        height: "56px",
                        transform: iconRotate
                          ? `rotate(${iconRotate}deg)`
                          : undefined,
                      }}
                      strokeWidth={1.25}
                    />
                  ) : null}
                </div>
                <div>
                  <p className="text-white font-bold text-base leading-snug">
                    {title}
                  </p>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-white/60 text-xs leading-snug">
                      {description}
                    </p>
                    <ChevronRight className="text-white/60 w-4 h-4 shrink-0 ml-1 -mr-1 group-hover:text-white transition-colors" />
                  </div>
                </div>
              </div>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
