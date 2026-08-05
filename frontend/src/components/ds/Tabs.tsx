interface TabItem {
  key: string;
  label: string;
}
interface Props {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

export function Tabs({ items, active, onChange }: Props) {
  const move = (direction: 1 | -1) => {
    const current = Math.max(0, items.findIndex((item) => item.key === active));
    onChange(items[(current + direction + items.length) % items.length].key);
  };
  return (
    <div
      className="pmp-tabs-scroll"
      role="tablist"
      aria-label="Page sections"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
        if (event.key === "Home") { event.preventDefault(); onChange(items[0].key); }
        if (event.key === "End") { event.preventDefault(); onChange(items[items.length - 1].key); }
      }}
    >
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className="pmp-tab"
            onClick={() => onChange(it.key)}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
