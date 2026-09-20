"""Idempotent backfill script for Knowledge Workspace relations.

Scans all existing DocPage records, parses [[WikiLinks]], and populates
docs.relations (resolving target pages or creating stub links).
Supports --dry-run.
"""

from __future__ import annotations

import argparse
import asyncio
import time

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.modules.docs.models import DocPage
from app.modules.docs.relations import extract_wikilinks, sync_page_relations


async def backfill(dry_run: bool = False) -> None:
    print(f"Starting knowledge relations backfill (dry_run={dry_run})...")
    start_time = time.time()

    async with AsyncSessionLocal() as db:
        stmt = select(DocPage).order_by(DocPage.created_at.asc())
        result = await db.execute(stmt)
        pages = result.scalars().all()

        total_pages = len(pages)
        total_links = 0
        pages_with_links = 0

        print(f"Found {total_pages} pages to analyze.")

        for idx, page in enumerate(pages, 1):
            links = extract_wikilinks(page.content or "")
            if links:
                total_links += len(links)
                pages_with_links += 1
                print(f"[{idx}/{total_pages}] '{page.title}' has {len(links)} links: {[l.target_title for l in links]}")
            if not dry_run:
                await sync_page_relations(db, page.id, page.space_id, page.content or "")

        elapsed = time.time() - start_time
        print("\n--- Backfill Summary ---")
        print(f"Total pages scanned: {total_pages}")
        print(f"Pages with WikiLinks: {pages_with_links}")
        print(f"Total WikiLinks extracted: {total_links}")
        print(f"Elapsed time: {elapsed:.2f}s")
        print("Dry run completed." if dry_run else "Backfill applied successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill WikiLinks and knowledge relations.")
    parser.add_argument("--dry-run", action="store_true", help="Scan and report without writing to the database.")
    args = parser.parse_args()

    asyncio.run(backfill(dry_run=args.dry_run))
