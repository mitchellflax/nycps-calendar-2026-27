(function () {
  "use strict";

  var TYPE_LABELS = {
    closed: "School closed",
    "half-day": "Early dismissal",
    ptc: "Parent-Teacher conferences",
    remote: "Remote learning",
    special: "Special schedule",
    milestone: "Key date"
  };

  var MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  var WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var activeFilter = "all";
  var activeView = "month";
  var monthCursor = null; // { year, month } — month is 0-based

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function parseISODate(iso) {
    var parts = iso.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(date, days) {
    var d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function fmtYMD(date) {
    return "" + date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate());
  }

  function dateKey(date) {
    return date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate();
  }

  function fmtShortDate(date) {
    return MONTH_NAMES[date.getMonth()].slice(0, 3) + " " + date.getDate();
  }

  function fmtDateRange(start, end) {
    if (start.getTime() === end.getTime()) {
      return fmtShortDate(start);
    }
    if (start.getMonth() === end.getMonth()) {
      return fmtShortDate(start) + "–" + end.getDate();
    }
    return fmtShortDate(start) + " – " + fmtShortDate(end);
  }

  function fmtModalDate(start, end) {
    if (start.getTime() === end.getTime()) {
      return fmtShortDate(start) + ", " + start.getFullYear() + " (" + WEEKDAY_NAMES[start.getDay()] + ")";
    }
    if (start.getFullYear() === end.getFullYear()) {
      return fmtDateRange(start, end) + ", " + start.getFullYear();
    }
    return fmtShortDate(start) + ", " + start.getFullYear() + " – " +
      fmtShortDate(end) + ", " + end.getFullYear();
  }

  // ---------- Calendar provider URL builders ----------
  // Note: Google + the .ics file use an *exclusive* end date (the day after
  // the event's last day), per the iCalendar all-day convention. Outlook web
  // and Yahoo's quick-add URLs use an *inclusive* end date (the actual last
  // day) — mixing these up silently drops the last day of multi-day events.

  function googleEventUrl(ev) {
    var start = parseISODate(ev.start);
    var endExclusive = addDays(parseISODate(ev.end), 1);
    var params = new URLSearchParams({
      action: "TEMPLATE",
      text: ev.title,
      dates: fmtYMD(start) + "/" + fmtYMD(endExclusive),
      details: ev.description
    });
    return "https://calendar.google.com/calendar/render?" + params.toString();
  }

  function outlookWebEventUrl(ev) {
    var params = new URLSearchParams({
      path: "/calendar/action/compose",
      rru: "addevent",
      startdt: ev.start,
      enddt: ev.end,
      subject: ev.title,
      body: ev.description,
      allday: "true"
    });
    return "https://outlook.live.com/calendar/deeplink/compose?" + params.toString();
  }

  function yahooEventUrl(ev) {
    var params = new URLSearchParams({
      v: "60",
      title: ev.title,
      st: ev.start.replace(/-/g, ""),
      et: ev.end.replace(/-/g, ""),
      dur: "allday",
      desc: ev.description
    });
    return "https://calendar.yahoo.com/?" + params.toString();
  }

  function icsEscapeText(text) {
    return String(text)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  function foldIcsLine(line) {
    var out = [];
    while (line.length > 74) {
      out.push(line.slice(0, 74));
      line = " " + line.slice(74);
    }
    out.push(line);
    return out.join("\r\n");
  }

  function buildSingleEventIcs(ev) {
    var start = parseISODate(ev.start);
    var endExclusive = addDays(parseISODate(ev.end), 1);
    var now = new Date();
    var dtstamp = "" + now.getUTCFullYear() + pad2(now.getUTCMonth() + 1) + pad2(now.getUTCDate()) +
      "T" + pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + "Z";
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//NYCPS Calendar 2026-27//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + ev.id + "@nycps-calendar-2026-27",
      "DTSTAMP:" + dtstamp,
      "DTSTART;VALUE=DATE:" + fmtYMD(start),
      "DTEND;VALUE=DATE:" + fmtYMD(endExclusive),
      foldIcsLine("SUMMARY:" + icsEscapeText(ev.title)),
      foldIcsLine("DESCRIPTION:" + icsEscapeText(ev.description)),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    return lines.join("\r\n") + "\r\n";
  }

  function downloadIcsBlob(filename, icsText) {
    var blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error("clipboard unavailable"));
  }

  function eventProviderItems(ev) {
    return [
      {
        label: "Google Calendar",
        action: function () { window.open(googleEventUrl(ev), "_blank", "noopener"); }
      },
      {
        label: "Apple Calendar",
        sub: "Downloads a .ics file",
        action: function () { downloadIcsBlob(ev.id + ".ics", buildSingleEventIcs(ev)); }
      },
      {
        label: "Outlook (desktop)",
        sub: "Downloads a .ics file",
        action: function () { downloadIcsBlob(ev.id + ".ics", buildSingleEventIcs(ev)); }
      },
      {
        label: "Office 365 / Outlook.com",
        action: function () { window.open(outlookWebEventUrl(ev), "_blank", "noopener"); }
      },
      {
        label: "Yahoo Calendar",
        action: function () { window.open(yahooEventUrl(ev), "_blank", "noopener"); }
      }
    ];
  }

  // ---------- Dropdown menu rendering (shared by list rows, CTA, modal) ----------

  function renderMenuItems(container, items, itemClass, onSelect) {
    container.innerHTML = "";
    items.forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = itemClass;
      if (item.sub) {
        var main = document.createElement("span");
        main.textContent = item.label;
        var sub = document.createElement("span");
        sub.className = "cal-menu-item-sub";
        sub.textContent = item.sub;
        btn.appendChild(main);
        btn.appendChild(sub);
      } else {
        btn.textContent = item.label;
      }
      btn.addEventListener("click", function () {
        item.action();
        closeAllDropdowns();
        if (onSelect) onSelect();
      });
      container.appendChild(btn);
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll(".cal-dropdown[open]").forEach(function (d) {
      d.removeAttribute("open");
    });
  }

  function setupDropdownBehavior() {
    document.addEventListener("click", function (e) {
      document.querySelectorAll(".cal-dropdown[open]").forEach(function (d) {
        if (!d.contains(e.target)) d.removeAttribute("open");
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAllDropdowns();
    });
    document.addEventListener("toggle", function (e) {
      if (e.target.matches && e.target.matches(".cal-dropdown") && e.target.open) {
        document.querySelectorAll(".cal-dropdown[open]").forEach(function (d) {
          if (d !== e.target) d.removeAttribute("open");
        });
      }
    }, true);
  }

  // ---------- List view ----------

  function renderEvents(events) {
    var list = document.getElementById("calendarList");
    list.innerHTML = "";
    var lastMonthKey = null;

    events.forEach(function (ev) {
      var start = parseISODate(ev.start);
      var end = parseISODate(ev.end);
      var monthKey = start.getFullYear() + "-" + start.getMonth();

      if (monthKey !== lastMonthKey) {
        var heading = document.createElement("h2");
        heading.className = "month-heading";
        heading.textContent = MONTH_NAMES[start.getMonth()] + " " + start.getFullYear();
        list.appendChild(heading);
        lastMonthKey = monthKey;
      }

      var card = document.createElement("article");
      card.className = "event-card";
      card.dataset.type = ev.type;

      var dateCol = document.createElement("div");
      dateCol.className = "event-date";
      dateCol.innerHTML =
        fmtDateRange(start, end) +
        '<span class="weekday">' + WEEKDAY_NAMES[start.getDay()] + "</span>";

      var body = document.createElement("div");
      body.className = "event-body";

      var tag = document.createElement("span");
      tag.className = "event-tag tag-" + ev.type;
      tag.textContent = TYPE_LABELS[ev.type] || ev.type;

      var title = document.createElement("p");
      title.className = "event-title";
      title.textContent = ev.title;

      var desc = document.createElement("p");
      desc.className = "event-desc";
      desc.textContent = ev.description;

      body.appendChild(tag);
      body.appendChild(title);
      body.appendChild(desc);

      var dropdown = document.createElement("details");
      dropdown.className = "cal-dropdown event-add-dropdown";

      var summary = document.createElement("summary");
      summary.className = "event-add";
      summary.textContent = "Add to Calendar";

      var menu = document.createElement("div");
      menu.className = "cal-menu";
      renderMenuItems(menu, eventProviderItems(ev), "cal-menu-item");

      dropdown.appendChild(summary);
      dropdown.appendChild(menu);

      card.appendChild(dateCol);
      card.appendChild(body);
      card.appendChild(dropdown);
      list.appendChild(card);
    });
  }

  // ---------- Month view ----------

  // Build a map of "y-m-d" -> [events] covering every day each event spans.
  function buildEventsByDate(events) {
    var map = {};
    events.forEach(function (ev) {
      var cursor = parseISODate(ev.start);
      var end = parseISODate(ev.end);
      while (cursor.getTime() <= end.getTime()) {
        var key = dateKey(cursor);
        (map[key] = map[key] || []).push(ev);
        cursor = addDays(cursor, 1);
      }
    });
    return map;
  }

  function schoolYearMonths() {
    var months = [];
    var y = 2026, m = 8; // September 2026 (0-based)
    for (var i = 0; i < 10; i++) {
      months.push({ year: y, month: m });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return months;
  }

  function monthIndexOf(cursor, months) {
    for (var i = 0; i < months.length; i++) {
      if (months[i].year === cursor.year && months[i].month === cursor.month) return i;
    }
    return -1;
  }

  function renderMonth(eventsByDate) {
    var months = schoolYearMonths();
    var idx = monthIndexOf(monthCursor, months);
    var label = document.getElementById("monthLabel");
    var grid = document.getElementById("monthGrid");
    var prevBtn = document.getElementById("prevMonth");
    var nextBtn = document.getElementById("nextMonth");

    label.textContent = MONTH_NAMES[monthCursor.month] + " " + monthCursor.year;
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= months.length - 1;

    grid.innerHTML = "";

    var firstOfMonth = new Date(monthCursor.year, monthCursor.month, 1);
    var startOffset = firstOfMonth.getDay(); // 0 = Sunday
    var gridStart = addDays(firstOfMonth, -startOffset);
    var today = new Date();

    for (var i = 0; i < 42; i++) {
      var cellDate = addDays(gridStart, i);
      var isOutside = cellDate.getMonth() !== monthCursor.month;

      var cell = document.createElement("div");
      cell.className = "month-cell" + (isOutside ? " is-outside" : "") +
        (sameDay(cellDate, today) ? " is-today" : "");

      var dayNum = document.createElement("span");
      dayNum.className = "cell-day";
      dayNum.textContent = cellDate.getDate();
      cell.appendChild(dayNum);

      var eventsWrap = document.createElement("div");
      eventsWrap.className = "cell-events";

      var dayEvents = eventsByDate[dateKey(cellDate)] || [];
      dayEvents.forEach(function (ev) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "cell-event cell-event-" + ev.type;
        chip.dataset.type = ev.type;
        chip.textContent = ev.title;
        chip.title = ev.title + " — " + ev.description;
        chip.addEventListener("click", function () {
          openEventModal(ev);
        });
        if (activeFilter !== "all" && ev.type !== activeFilter) {
          chip.classList.add("is-hidden");
        }
        eventsWrap.appendChild(chip);
      });

      cell.appendChild(eventsWrap);
      grid.appendChild(cell);

      // stop past row 5 (index 34) once we've cleared the month, to avoid a
      // trailing all-empty 6th row for months that fit in 5 rows
      if (i === 34) {
        var remainingInMonth = false;
        for (var j = 35; j < 42; j++) {
          if (addDays(gridStart, j).getMonth() === monthCursor.month) { remainingInMonth = true; break; }
        }
        if (!remainingInMonth) break;
      }
    }
  }

  function setupMonthNav(eventsByDate) {
    document.getElementById("prevMonth").addEventListener("click", function () {
      var months = schoolYearMonths();
      var idx = monthIndexOf(monthCursor, months);
      if (idx > 0) {
        monthCursor = months[idx - 1];
        renderMonth(eventsByDate);
      }
    });
    document.getElementById("nextMonth").addEventListener("click", function () {
      var months = schoolYearMonths();
      var idx = monthIndexOf(monthCursor, months);
      if (idx < months.length - 1) {
        monthCursor = months[idx + 1];
        renderMonth(eventsByDate);
      }
    });
  }

  // ---------- Filters & view toggle ----------

  function applyFilter() {
    document.querySelectorAll(".event-card").forEach(function (card) {
      var show = activeFilter === "all" || card.dataset.type === activeFilter;
      card.classList.toggle("is-hidden", !show);
    });
    document.querySelectorAll(".cell-event").forEach(function (chip) {
      var show = activeFilter === "all" || chip.dataset.type === activeFilter;
      chip.classList.toggle("is-hidden", !show);
    });
  }

  function setupFilters() {
    var buttons = document.querySelectorAll(".legend-item");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        activeFilter = btn.dataset.filter;
        applyFilter();
      });
    });
  }

  function setupViewToggle() {
    var buttons = document.querySelectorAll(".view-toggle-btn");
    var listSection = document.getElementById("calendarList");
    var monthSection = document.getElementById("monthView");

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeAllDropdowns();
        buttons.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        activeView = btn.dataset.view;
        var isMonth = activeView === "month";
        listSection.hidden = isMonth;
        monthSection.hidden = !isMonth;
      });
    });
  }

  // ---------- Event detail modal ----------

  function openEventModal(ev) {
    var overlay = document.getElementById("eventModal");
    var start = parseISODate(ev.start);
    var end = parseISODate(ev.end);

    document.getElementById("modalTag").className = "event-tag tag-" + ev.type;
    document.getElementById("modalTag").textContent = TYPE_LABELS[ev.type] || ev.type;
    document.getElementById("modalTitle").textContent = ev.title;
    document.getElementById("modalDate").textContent = fmtModalDate(start, end);
    document.getElementById("modalDesc").textContent = ev.description;

    renderMenuItems(
      document.getElementById("modalAddOptions"),
      eventProviderItems(ev),
      "modal-add-option",
      closeEventModal
    );

    overlay.hidden = false;
    document.getElementById("modalClose").focus();
  }

  function closeEventModal() {
    document.getElementById("eventModal").hidden = true;
  }

  function setupModal() {
    var overlay = document.getElementById("eventModal");
    document.getElementById("modalClose").addEventListener("click", closeEventModal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeEventModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.hidden) closeEventModal();
    });
  }

  // ---------- Full-calendar "add to..." dropdown ----------

  function setupSubscribeMenu() {
    var menu = document.getElementById("subscribeMenu");
    var hint = document.getElementById("ctaHint");
    var isFile = window.location.protocol === "file:";
    var icsHttpUrl = isFile ? null :
      window.location.origin + window.location.pathname.replace(/index\.html$/, "") + "calendar.ics";
    var webcalUrl = icsHttpUrl ? icsHttpUrl.replace(/^https?:\/\//, "webcal://") : null;

    function needsHostingAlert() {
      alert(
        "This needs the site hosted at a public URL first, so the calendar app can fetch calendar.ics " +
        "over the internet. For now, use “Download Calendar” above, or add individual events from the " +
        "list below — those work locally."
      );
    }

    var items = [
      {
        label: "Google Calendar",
        sub: "Subscribe — stays in sync",
        action: function () {
          if (!webcalUrl) return needsHostingAlert();
          window.open(
            "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcalUrl),
            "_blank", "noopener"
          );
        }
      },
      {
        label: "Apple Calendar",
        sub: "Subscribe — stays in sync",
        action: function () {
          if (!webcalUrl) return needsHostingAlert();
          window.location.href = webcalUrl;
        }
      },
      {
        label: "Outlook / Office 365",
        sub: "Copies a link to paste in",
        action: function () {
          if (!icsHttpUrl) return needsHostingAlert();
          copyText(icsHttpUrl).then(function () {
            alert("Calendar link copied!\n\nIn Outlook: Add calendar → Subscribe from web → paste the link.");
          }).catch(function () {
            prompt("Copy this calendar link, then in Outlook: Add calendar → Subscribe from web", icsHttpUrl);
          });
        }
      },
      {
        label: "Yahoo Calendar",
        sub: "Manual import only",
        action: function () {
          alert(
            "Yahoo Calendar doesn't support one-click subscribing to an external calendar feed. " +
            "Download the .ics file above and import it from Yahoo Calendar's settings, or add " +
            "individual events to Yahoo using the menu next to each event below."
          );
        }
      }
    ];

    renderMenuItems(menu, items, "cal-menu-item");

    if (icsHttpUrl) {
      hint.textContent =
        "“Add Full Calendar to…” subscribes so it stays in sync (Google, Apple) or copies a link for " +
        "Outlook. You can also download the file above or add any single event below.";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var events = (window.CALENDAR_EVENTS || []).slice().sort(function (a, b) {
      return a.start.localeCompare(b.start);
    });
    var eventsByDate = buildEventsByDate(events);

    monthCursor = { year: 2026, month: 8 }; // September 2026

    renderEvents(events);
    renderMonth(eventsByDate);
    setupMonthNav(eventsByDate);
    setupFilters();
    setupViewToggle();
    setupModal();
    setupDropdownBehavior();
    setupSubscribeMenu();
  });
})();
