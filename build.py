#!/usr/bin/env python3
"""Rebuild entries.json from sections.json and the markdown files in entries/.

Run after adding, editing or removing an entry:

    python3 build.py

Each entry is a markdown file with front matter at the top:

    ---
    title: Building my first UVM scoreboard
    date: 2026-11-26
    section: digital-design-verification
    ---
    The writing, in markdown...
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENTRIES_DIR = ROOT / "entries"
SECTIONS_FILE = ROOT / "sections.json"
OUTPUT_FILE = ROOT / "entries.json"

FRONT_MATTER = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.S)
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def read_front_matter(path):
    match = FRONT_MATTER.match(path.read_text(encoding="utf-8"))
    if not match:
        raise ValueError("missing front matter (a --- block at the very top)")
    meta = {}
    for line in match.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, sep, value = line.partition(":")
        if not sep:
            raise ValueError(f"front matter line has no colon: {line!r}")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        meta[key.strip().lower()] = value
    return meta


def main():
    sections = json.loads(SECTIONS_FILE.read_text(encoding="utf-8"))
    order = {s["slug"]: i for i, s in enumerate(sections)}

    entries, errors, seen = [], [], {}
    for path in sorted(ENTRIES_DIR.rglob("*.md")):
        rel = path.relative_to(ROOT).as_posix()
        try:
            meta = read_front_matter(path)
        except ValueError as err:
            errors.append(f"{rel}: {err}")
            continue

        title = meta.get("title", "")
        day = meta.get("date", "")
        section = meta.get("section", "")
        if not title:
            errors.append(f"{rel}: missing title")
        if not ISO_DATE.match(day):
            errors.append(f"{rel}: date must look like 2026-11-26, got {day!r}")
        else:
            try:
                date.fromisoformat(day)
            except ValueError:
                errors.append(f"{rel}: {day!r} is not a real date")
        if section not in order:
            errors.append(f"{rel}: unknown section {section!r} (see sections.json)")

        entry_id = path.stem
        if entry_id in seen:
            errors.append(f"{rel}: same file name as {seen[entry_id]}")
        seen[entry_id] = rel

        entries.append({"id": entry_id, "title": title, "date": day, "section": section, "path": rel})

    if errors:
        print("build failed:", *errors, sep="\n  ", file=sys.stderr)
        sys.exit(1)

    # Newest day first; entries on the same day follow the section order.
    entries.sort(key=lambda e: e["id"])
    entries.sort(key=lambda e: order[e["section"]])
    entries.sort(key=lambda e: e["date"], reverse=True)

    counts = {s["slug"]: 0 for s in sections}
    for e in entries:
        counts[e["section"]] += 1

    data = {
        "sections": [{"slug": s["slug"], "name": s["name"], "count": counts[s["slug"]]} for s in sections],
        "entries": entries,
    }
    OUTPUT_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"entries.json: {len(entries)} entries across {sum(1 for c in counts.values() if c)} sections")


if __name__ == "__main__":
    main()
