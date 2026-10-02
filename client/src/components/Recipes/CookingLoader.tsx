import { useEffect, useState } from 'react';

const PHRASES = [
  'Simmering your search...',
  'Tasting for seasoning...',
  'Checking what\u2019s in the pantry...',
  'Skimming the recipe box...',
  'Letting it reduce...',
  'Plating the results...'
];

interface CookingLoaderProps {
  label?: string;
}

/** A small cooking-themed loading state — a bubbling pot with rising steam,
 *  and a caption that cycles through cooking-flavored phrases every ~1.8s. */
export function CookingLoader({ label }: CookingLoaderProps) {
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    if (label) return; // fixed label — no cycling needed
    const id = setInterval(() => setPhraseIdx((i) => (i + 1) % PHRASES.length), 1800);
    return () => clearInterval(id);
  }, [label]);

  return (
    <div className="cooking-loader">
      <svg viewBox="0 0 80 70" className="cooking-loader-svg" aria-hidden="true">
        <g className="steam steam-1">
          <path d="M30 30 C 26 24, 34 20, 30 14" />
        </g>
        <g className="steam steam-2">
          <path d="M40 30 C 36 22, 44 18, 40 10" />
        </g>
        <g className="steam steam-3">
          <path d="M50 30 C 46 24, 54 20, 50 14" />
        </g>
        <g className="pot-wobble">
          <ellipse cx="40" cy="42" rx="26" ry="6" className="pot-shadow" />
          <path d="M16 40 L20 58 Q40 64 60 58 L64 40 Z" className="pot-body" />
          <rect x="14" y="34" width="52" height="8" rx="4" className="pot-rim" />
          <rect x="4" y="35" width="12" height="5" rx="2.5" className="pot-handle" />
          <rect x="64" y="35" width="12" height="5" rx="2.5" className="pot-handle" />
        </g>
      </svg>
      <p className="cooking-loader-label">{label || PHRASES[phraseIdx]}</p>
    </div>
  );
}