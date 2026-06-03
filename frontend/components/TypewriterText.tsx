"use client";
import { useEffect, useState } from "react";

/**
 * Reveals `text` character-by-character when `animate` is true.
 * When `animate` is false (e.g. cached results), renders the full string immediately.
 */
export default function TypewriterText({
  text,
  animate,
  speed = 10,
}: {
  text: string;
  animate: boolean;
  speed?: number;
}) {
  const [idx, setIdx] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) {
      setIdx(text.length);
      return;
    }
    setIdx(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setIdx(i);
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, animate, speed]);

  const done = idx >= text.length;
  return (
    <>
      {text.slice(0, idx)}
      {!done && (
        <span className="inline-block w-px h-[1em] bg-current opacity-60 animate-pulse ml-px align-text-bottom" />
      )}
    </>
  );
}
