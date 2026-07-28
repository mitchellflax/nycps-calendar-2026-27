#!/usr/bin/env python3
"""Generate calendar.ics from events.json.
Re-run this after editing events.json: python3 generate_ics.py
"""
import json
import datetime
from pathlib import Path

BASE = Path(__file__).parent
events = json.loads((BASE / "events.json").read_text())

def fold(line):
    # RFC5545 line folding at 75 octets
    out = []
    while len(line.encode("utf-8")) > 75:
        cut = 75
        out.append(line[:cut])
        line = " " + line[cut:]
    out.append(line)
    return "\r\n".join(out)

def escape(text):
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )

lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NYCPS Calendar 2026-27//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:NYCPS School Year Calendar 2026–27",
    "X-WR-TIMEZONE:America/New_York",
]

now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")

for ev in events:
    start = datetime.date.fromisoformat(ev["start"])
    end_exclusive = datetime.date.fromisoformat(ev["end"]) + datetime.timedelta(days=1)
    uid = f"{ev['id']}@nycps-calendar-2026-27"
    lines.append("BEGIN:VEVENT")
    lines.append(fold(f"UID:{uid}"))
    lines.append(f"DTSTAMP:{now}")
    lines.append(f"DTSTART;VALUE=DATE:{start.strftime('%Y%m%d')}")
    lines.append(f"DTEND;VALUE=DATE:{end_exclusive.strftime('%Y%m%d')}")
    lines.append(fold(f"SUMMARY:{escape(ev['title'])}"))
    lines.append(fold(f"DESCRIPTION:{escape(ev['description'])}"))
    lines.append("TRANSP:TRANSPARENT")
    lines.append("END:VEVENT")

lines.append("END:VCALENDAR")

ics_text = "\r\n".join(lines) + "\r\n"
(BASE / "calendar.ics").write_text(ics_text)
print(f"Wrote calendar.ics with {len(events)} events")

# Also emit events as a plain JS file so index.html can load it with a <script>
# tag. This avoids fetch()'s file:// CORS restriction when the page is opened
# straight from disk instead of served over http.
data_js = "// Auto-generated from events.json by generate_ics.py — do not edit by hand.\n"
data_js += "var CALENDAR_EVENTS = " + json.dumps(events, indent=2) + ";\n"
(BASE / "events-data.js").write_text(data_js)
print("Wrote events-data.js")
