"use client";

import { useState } from "react";

export function ProductGallery({
  title,
  images,
}: {
  title: string;
  images: string[];
}) {
  const unique = [...new Set(images.filter(Boolean))];
  const [selected, setSelected] = useState(unique[0] || "");

  if (!selected) {
    return (
      <div className="flex aspect-[0.9] items-center justify-center rounded-[2rem] border border-ink/10 bg-card text-sm text-ink-soft">
        No image available
      </div>
    );
  }

  return (
    <div className="lg:sticky lg:top-24 lg:self-start">
      <div className="overflow-hidden rounded-[2rem] border border-ink/10 bg-card shadow-[0_22px_70px_rgba(42,31,26,0.08)]">
        <img src={selected} alt={title} className="aspect-[0.95] w-full object-cover" />
      </div>

      {unique.length > 1 && (
        <div className="mt-4 grid grid-cols-5 gap-3">
          {unique.slice(0, 5).map((image) => (
            <button
              key={image}
              type="button"
              onClick={() => setSelected(image)}
              className={`overflow-hidden rounded-xl border-2 bg-card transition ${selected === image ? "border-poppy" : "border-transparent hover:border-ink/15"}`}
              aria-label={`View ${title} image`}
            >
              <img src={image} alt="" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
