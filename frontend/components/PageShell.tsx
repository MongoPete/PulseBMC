/**
 * Consistent page wrapper: full-width flex child, no horizontal bleed, bottom-nav clearance on phone.
 */
export default function PageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full min-w-0 flex-1 overflow-x-clip ${className}`}>
      {children}
    </div>
  );
}

const MAX_WIDTH = {
  default: "max-w-5xl",
  doc: "max-w-6xl",
  wide: "max-w-7xl",
  fleet: "max-w-[1400px]",
} as const;

export function PageMain({
  children,
  wide = false,
  maxWidth,
  className = "",
}: {
  children: React.ReactNode;
  /** @deprecated use maxWidth="fleet" */
  wide?: boolean;
  maxWidth?: keyof typeof MAX_WIDTH;
  className?: string;
}) {
  const maxW = maxWidth ? MAX_WIDTH[maxWidth] : wide ? MAX_WIDTH.fleet : MAX_WIDTH.default;

  return (
    <main
      className={`w-full min-w-0 mx-auto px-4 sm:px-6 py-4 sm:py-6 ${maxW} ${className}`}
    >
      {children}
    </main>
  );
}
