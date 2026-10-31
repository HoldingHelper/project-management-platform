# Task product-line filter

Tasks includes an All product lines dropdown beside the project filter. Options
come from the existing authorized product catalog. Choosing a line resets the
project filter and page, narrows project choices to that line, and applies to
both List and Monthly layouts. Clear filters resets the product choice too;
the current history entry retains the selection as with other task filters.

GET /tasks accepts an optional UUID product_id. The service checks product access
and the repository filters Task -> Sprint -> Project -> Product before counting
or paginating. Backlog tasks have no project/product and do not match a selected
line. Other filters combine with product_id.

Verification: 18 targeted backend tests passed, including rollback-only real
PostgreSQL checks for product matching, pagination/counts, status composition,
backlog exclusion, nonexistent products, and unauthorized access. Frontend build,
TypeScript and 51 existing frontend tests passed. Deploy API/frontend together;
no database migration is required.
