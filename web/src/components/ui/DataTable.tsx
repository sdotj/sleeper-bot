import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

/** A compact, reusable table with an optional row highlight. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  highlight,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  highlight?: (row: T) => boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-4 py-2.5 text-left text-[0.64rem] font-semibold uppercase tracking-wide text-faint",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(
                "border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2/60",
                highlight?.(row) && "bg-mine/10 hover:bg-mine/15",
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-2.5", c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
