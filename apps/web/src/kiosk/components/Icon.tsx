import { useEffect, useState } from 'react';

/** Remembers which /icons/*.png exist so each one is probed once per page load. */
const known = new Map<string, boolean>();

/** True once `src` has loaded; false if it 404s (→ show the placeholder). */
export function useImageExists(src: string): boolean {
  const [exists, setExists] = useState(known.get(src) ?? false);
  useEffect(() => {
    if (known.has(src)) return setExists(known.get(src)!);
    const img = new Image();
    img.onload = () => (known.set(src, true), setExists(true));
    img.onerror = () => known.set(src, false);
    img.src = src;
  }, [src]);
  return exists;
}

/**
 * Hand-drawn icon from public/icons/<name>.png, or a placeholder until the art lands.
 * Same drop-in rule as Ralph: add the PNG with the exact name, no code change.
 */
export function Icon({ name, fallback, className = 'size-12' }: { name: string; fallback: string; className?: string }) {
  const src = `/icons/${name}.png`;
  const exists = useImageExists(src);
  return exists ? (
    <img src={src} alt="" draggable={false} className={`${className} object-contain`} />
  ) : (
    <span aria-hidden className={`${className} flex items-center justify-center text-4xl leading-none`}>
      {fallback}
    </span>
  );
}
