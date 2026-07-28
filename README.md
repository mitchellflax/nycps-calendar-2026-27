# NYCPS 2026–27 School Year Calendar

A static, single-page calendar site built from the official NYC Public Schools
2026–27 school year calendar PDF.

## Files

- `index.html` — the page
- `styles.css` — styling (supports light/dark automatically)
- `app.js` — renders the list/month views, filters, the event popover, and the
  add-to-calendar dropdowns (Google, Apple, Outlook desktop, Office 365 /
  Outlook.com, Yahoo)
- `events-data.js` — event data as a JS global (`CALENDAR_EVENTS`), auto-generated
- `events.json` — **source of truth** for event data, edit this if dates change
- `calendar.ics` — downloadable/subscribable calendar file, auto-generated
- `generate_ics.py` — regenerates `calendar.ics` and `events-data.js` from `events.json`

## Editing the calendar data

Edit `events.json`, then regenerate the derived files:

```bash
python3 generate_ics.py
```

This keeps the on-page list, the per-event "Add to Calendar" dropdowns, and
the downloadable `.ics` file all in sync. Each event's `description` in
`events.json` ends with a fixed attribution line ("From the 2026–2027 NYC
Public Schools calendar: https://schools.nyc.gov/calendar") — it's baked into
the text itself, so edit it directly there if the wording needs to change.

## Adding events to your own calendar

Every event has an "Add to Calendar" menu with five options:

- **Google Calendar** and **Yahoo Calendar** — opens a prefilled "create event"
  page in a new tab; works immediately, even viewing the site from disk.
- **Office 365 / Outlook.com** — same idea, via Outlook's web compose deep link.
- **Apple Calendar** and **Outlook (desktop)** — downloads a small `.ics` file
  for that one event, which each app opens/imports directly.

The "Add Full Calendar to…" dropdown at the top covers the same providers for
the *entire* calendar at once:

- **Google Calendar** and **Apple Calendar** subscribe to a live feed (so it
  stays in sync if dates change later) — this needs the site hosted at a
  public URL, since the calendar app has to fetch `calendar.ics` over the
  internet. Viewed locally, these show an explanation instead.
- **Outlook / Office 365** copies the hosted `.ics` link to your clipboard, to
  paste into Outlook's "Subscribe from web."
- **Yahoo** doesn't support one-click calendar subscription, so that item just
  explains the manual import path (Yahoo does support the per-event add link).

## Viewing locally

Just open `index.html` in a browser — no build step or server required. The
per-event dropdowns and the "Download Calendar" button all work straight from
disk. Only the full-calendar subscribe/copy-link options need real hosting,
as noted above.

## Hosting

This is a plain static site (no build tools, no dependencies) so it can be
deployed almost anywhere:

- **GitHub Pages**: push this folder to a repo, enable Pages on the `main` branch.
- **Netlify / Vercel**: drag-and-drop the folder in their dashboard, or connect a repo.
- **Any static host / S3 bucket**: upload the files as-is.

After hosting, the "Add Full Calendar to…" dropdown's Google/Apple/Outlook
options will work automatically — they build their links from the page's own
URL.

## Adding AdSense (or another ad network)

There's a placeholder slot at the bottom of the page, in `index.html`, inside
`<section class="ad-slot">`. Replace the HTML comment there with your ad unit
snippet (e.g. your AdSense `<ins class="adsbygoogle">` code + script tag). The
surrounding box (`.ad-slot-inner` in `styles.css`) is already sized and styled
to hold a responsive ad unit — remove the dashed border once real ads are in place if you'd like.

## Source

NYC Public Schools official calendar: https://schools.nyc.gov/calendar

This is an unofficial, unaffiliated project — always double check dates against
the official source, especially before relying on them for scheduling.
