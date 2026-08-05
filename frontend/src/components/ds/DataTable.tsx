"use client";

/* Generic sortable data table used by admin screens and the task browser. */

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Optional accessor enabling sort on this column. */
  sortValue?: (row: T) => string | number;
  width?: number | string;
  align?: "left" | "right" | "center";
  /** Optional shorter label for the mobile record view. */
  mobileLabel?: ReactNode;
  /** Hide low-value metadata from the mobile record view. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  /** Accessible label describing the collection. */
  label?: string;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, emptyText = "No rows.", label = "Data table" }: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va < vb) return -sortDir;
      if (va > vb) return sortDir;
      return 0;
    });
  }, [rows, columns, sortKey, sortDir]);

  const toggleSort = (key: string, sortable: boolean) => {
    if (!sortable) return;
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  return (
    <div className="pmp-data-view">
      <div className="pmp-data-table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="pmp-data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                aria-sort={sortKey === col.key ? (sortDir === 1 ? "ascending" : "descending") : col.sortValue ? "none" : undefined}
                style={{
                  textAlign: col.align ?? "left",
                  padding: "10px 14px",
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  borderBottom: "1px solid var(--border-default)",
                  whiteSpace: "nowrap",
                  width: col.width,
                  userSelect: "none",
                }}
              >
                {col.sortValue ? (
                  <button className="pmp-table-sort" type="button" onClick={() => toggleSort(col.key, true)}>
                    {col.header}
                    {sortKey === col.key && (sortDir === 1 ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                  </button>
                ) : <span className="pmp-table-heading">{col.header}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}
              >
                {emptyText}
              </td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className="pmp-row"
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default" }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: "12px 14px",
                    textAlign: col.align ?? "left",
                    borderBottom: "1px solid var(--border-subtle)",
                    verticalAlign: "middle",
                  }}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="pmp-data-cards" role="list" aria-label={label}>
        {sorted.length === 0 && <div className="pmp-data-card-empty">{emptyText}</div>}
        {sorted.map((row) => (
          <div
            key={rowKey(row)}
            role={onRowClick ? "button" : "listitem"}
            tabIndex={onRowClick ? 0 : undefined}
            className={`pmp-data-card ${onRowClick ? "is-clickable" : ""}`}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={onRowClick ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onRowClick(row);
              }
            } : undefined}
          >
            {columns.filter((column) => !column.hideOnMobile).map((column, index) => (
              <div className={`pmp-data-card-field ${index === 0 ? "is-primary" : ""}`} key={column.key}>
                {index > 0 && <span className="pmp-data-card-label">{column.mobileLabel ?? column.header}</span>}
                <span className="pmp-data-card-value">{column.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
