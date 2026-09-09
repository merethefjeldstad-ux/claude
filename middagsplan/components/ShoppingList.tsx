"use client";

import { useState, useTransition } from "react";
import { CheckCircleIcon, CircleIcon, PlusIcon } from "./icons";

const ACCENT = "#4C6B8A";

export interface ShoppingItemView {
  id: string;
  text: string;
  checked: boolean;
}

export function ShoppingList({ initialItems }: { initialItems: ShoppingItemView[] }) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const checkedCount = items.filter((i) => i.checked).length;

  async function addItem() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const res = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const { item } = (await res.json()) as { item: ShoppingItemView };
      setItems((prev) => [...prev, item]);
    }
  }

  function toggleItem(id: string, checked: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked } : i)));
    startTransition(async () => {
      await fetch(`/api/shopping-list/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      });
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <div className="text-xl font-bold text-app-text tracking-tight">Handleliste</div>
        <div className="text-xs text-app-text-muted">
          Delt handleliste · {checkedCount} av {items.length} handlet
        </div>
      </div>

      <div className="flex flex-row items-center gap-2.5 bg-white border border-app-border-soft rounded-[10px] px-3 py-[11px]">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addItem();
          }}
          placeholder="Legg til vare …"
          aria-label="Legg til vare"
          className="flex-1 text-[13.5px] text-app-text placeholder:text-app-text-faint bg-transparent outline-none"
        />
        <button
          type="button"
          onClick={addItem}
          aria-label="Legg til"
          disabled={!draft.trim()}
          className="disabled:opacity-40"
        >
          <PlusIcon color={ACCENT} />
        </button>
      </div>

      <div className="flex flex-col">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => toggleItem(item.id, !item.checked)}
            disabled={isPending}
            className="flex flex-row items-center gap-3 py-[11px] px-1 border-b border-app-border-soft min-h-[24px] text-left"
          >
            {item.checked ? (
              <CheckCircleIcon color={ACCENT} />
            ) : (
              <CircleIcon color="oklch(75% 0.01 260)" />
            )}
            <span
              className="text-sm"
              style={{
                color: item.checked ? "oklch(65% 0.01 260)" : "oklch(25% 0.01 260)",
                textDecoration: item.checked ? "line-through" : "none",
              }}
            >
              {item.text}
            </span>
          </button>
        ))}
        {items.length === 0 && (
          <div className="text-sm text-app-text-muted py-4">Listen er tom. Legg til varer over.</div>
        )}
      </div>
    </div>
  );
}
