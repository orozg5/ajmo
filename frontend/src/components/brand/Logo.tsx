import Link from "next/link";

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-baseline gap-1 font-display text-2xl font-semibold tracking-tight text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span>ajmo</span>
      <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
    </Link>
  );
}
