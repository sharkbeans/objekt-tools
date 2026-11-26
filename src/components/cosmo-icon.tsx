/**
 * Cosmo's mark: the two slanted bars of the Cosmo app's icon, traced from it
 * so it stays sharp at button size. Drawn in `currentColor`, black on the
 * white Cosmo button.
 */
export function CosmoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="54 51 147 147"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M138 53h30v30l-46 40H87V97z" />
      <path d="M138 126h30v30l-46 40H87v-26z" />
    </svg>
  );
}
