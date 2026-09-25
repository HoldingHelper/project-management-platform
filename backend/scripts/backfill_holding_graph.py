"""Preflight the legacy-to-holding migration and report ambiguous mappings.

This command is deliberately read-only. Run it against a restored production
copy before ``alembic upgrade head``. Exit code 2 means operator decisions are
needed; it never mutates the source database.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict, dataclass

from sqlalchemy import text

from app.core.database import AsyncSessionLocal


@dataclass
class PreflightReport:
    products_to_ventures: int
    projects_to_nodes: int
    departments_to_functions: int
    teams_to_nodes: int
    milestones_to_nodes: int
    doc_spaces_to_nodes: int
    distinct_task_partitions: list[str]
    unmatched_partitions: list[str]
    projects_without_products: list[str]
    products_with_duplicate_names: list[str]

    @property
    def ambiguous_count(self) -> int:
        return len(self.unmatched_partitions) + len(self.projects_without_products) + len(self.products_with_duplicate_names)


async def inspect() -> PreflightReport:
    async with AsyncSessionLocal() as db:
        counts = (await db.execute(text("""
            SELECT
              (SELECT count(*) FROM projects.products),
              (SELECT count(*) FROM projects.projects),
              (SELECT count(*) FROM organization.departments),
              (SELECT count(*) FROM organization.teams),
              (SELECT count(*) FROM projects.milestones),
              (SELECT count(*) FROM docs.spaces)
        """))).one()
        partitions = list((await db.execute(text("SELECT DISTINCT partition FROM projects.tasks WHERE partition IS NOT NULL ORDER BY partition"))).scalars().all())
        unmatched = list((await db.execute(text("""
            SELECT DISTINCT t.partition
            FROM projects.tasks t
            WHERE t.partition IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM organization.departments d
              WHERE lower(d.name)=lower(t.partition)
                 OR regexp_replace(lower(d.name),'[^a-z0-9]+','_','g')=lower(t.partition)
            ) ORDER BY t.partition
        """))).scalars().all())
        orphans = list((await db.execute(text("""
            SELECT p.name FROM projects.projects p
            LEFT JOIN projects.products product ON product.id=p.product_id
            WHERE product.id IS NULL ORDER BY p.name
        """))).scalars().all())
        duplicates = list((await db.execute(text("""
            SELECT name FROM projects.products GROUP BY lower(name), name HAVING count(*) > 1 ORDER BY name
        """))).scalars().all())
    return PreflightReport(*map(int, counts), partitions, unmatched, orphans, duplicates)


def render(report: PreflightReport) -> str:
    lines = [
        "Holding graph migration preflight (read-only)",
        f"  Products -> Ventures:       {report.products_to_ventures}",
        f"  Projects -> Project nodes:  {report.projects_to_nodes}",
        f"  Departments -> Functions:   {report.departments_to_functions}",
        f"  Teams -> Team nodes:        {report.teams_to_nodes}",
        f"  Milestones -> Nodes:        {report.milestones_to_nodes}",
        f"  Doc spaces -> Nodes:        {report.doc_spaces_to_nodes}",
        f"  Ambiguous mappings:         {report.ambiguous_count}",
    ]
    if report.unmatched_partitions:
        lines.append("\nUnmatched task partitions (choose/create a Function):")
        lines.extend(f"  - {value}" for value in report.unmatched_partitions)
    if report.projects_without_products:
        lines.append("\nProjects without a Product (assign to Holding / Internal):")
        lines.extend(f"  - {value}" for value in report.projects_without_products)
    if report.products_with_duplicate_names:
        lines.append("\nDuplicate Product names (slugs remain unique; confirm venture granularity):")
        lines.extend(f"  - {value}" for value in report.products_with_duplicate_names)
    return "\n".join(lines)


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()
    report = await inspect()
    print(json.dumps({**asdict(report), "ambiguous_count": report.ambiguous_count}, indent=2) if args.json else render(report))
    return 2 if report.ambiguous_count else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
