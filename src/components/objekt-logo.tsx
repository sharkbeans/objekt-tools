import { cn } from "@/lib/utils";

type ObjektLogoProps = {
  className?: string;
  "aria-label"?: string;
};

const topShape = {
  clipPath: "polygon(16% 0, 100% 0, 100% 84%, 84% 100%, 0 100%, 0 16%)",
};

const lowerShape = {
  clipPath: "polygon(16% 0, 100% 0, 100% 82%, 82% 100%, 0 100%, 0 16%)",
};

export function ObjektLogo({
  className,
  "aria-label": ariaLabel,
}: ObjektLogoProps) {
  const accessibilityProps = ariaLabel
    ? { role: "img", "aria-label": ariaLabel }
    : { "aria-hidden": true };

  return (
    <span
      className={cn("relative inline-block size-7 shrink-0", className)}
      {...accessibilityProps}
    >
      <span
        className="absolute left-[36%] top-[18%] z-0 size-[44%] t-shimmer-shape"
        style={topShape}
      />
      <span
        className="absolute left-[20%] top-[40%] z-10 size-[40%] t-shimmer-shape"
        style={lowerShape}
      />
      <span
        className="absolute left-[24.5%] top-[44.5%] z-20 size-[31%] bg-background"
        style={lowerShape}
      />
    </span>
  );
}
