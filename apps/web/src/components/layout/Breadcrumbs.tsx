import { useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";
import { breadcrumbsFor } from "./breadcrumbs";

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const trail = breadcrumbsFor(pathname);
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Ruta" className="min-w-0">
      <ol className="flex items-center gap-2 text-sm text-muted-foreground">
        {trail.map((label, index) => {
          const last = index === trail.length - 1;
          return (
            <Fragment key={label}>
              {index > 0 && <li aria-hidden="true">/</li>}
              <li
                aria-current={last ? "page" : undefined}
                className={last ? "truncate font-medium text-foreground" : "truncate"}
              >
                {label}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
