"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MAX_TILT = 40;

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function TiltCard({ children, className, onClick }: TiltCardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState({
    rx: 0,
    ry: 0,
    gx: 50,
    gy: 50,
    active: false,
  });

  function applyFromPoint(clientX: number, clientY: number) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    setState({
      rx: (0.5 - y) * MAX_TILT,
      ry: (x - 0.5) * MAX_TILT,
      gx: x * 100,
      gy: y * 100,
      active: true,
    });
  }

  function release() {
    setState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });
  }

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "relative cursor-pointer border-0 bg-transparent p-0 text-left",
        className,
      )}
      onClick={onClick}
      onMouseMove={(e) => applyFromPoint(e.clientX, e.clientY)}
      onMouseLeave={release}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) applyFromPoint(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) applyFromPoint(t.clientX, t.clientY);
      }}
      onTouchEnd={release}
      onTouchCancel={release}
      style={{
        transform: `perspective(900px) rotateX(${state.rx}deg) rotateY(${state.ry}deg) scale(${state.active ? 1.04 : 1})`,
        transition: state.active
          ? "transform 0.07s linear"
          : "transform 0.6s cubic-bezier(0.25, 0, 0.25, 1)",
        transformStyle: "preserve-3d",
        willChange: "transform",
        touchAction: "none",
      }}
    >
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] mix-blend-overlay"
        style={{
          background: `radial-gradient(circle at ${state.gx}% ${state.gy}%, rgb(255 255 255 / ${state.active ? 0.22 : 0}), transparent 65%)`,
          transition: state.active ? "none" : "background 0.3s ease",
        }}
      />
    </button>
  );
}
