/* global Module, Log */

Module.register("MMM-iCloudCalendarEXT3eventadd", {
  defaults: {
    caldav: {
      envPrefix: "ICLOUD_",
      serverUrl: "https://caldav.icloud.com",
      calendarDisplayName: "Family",
      providerIcsUrl: "http://127.0.0.1:8888/CALDAV/ICLOUD_Family.ics"
    },
    // CalendarExt3 puts these on each day cell
    dayCellSelector: ".MMM-CalendarExt3 .cell[data-date]",
    // CalendarExt3 event DOM uses .event and sets data-popoverble=true when popover supported
    eventSelector: ".MMM-CalendarExt3 .event",
    debug: true
  },

  start() {
    Log.info("[ICLOUD-ADD] started");
    this._rootHooked = false;
    this._lastTapTs = 0;
  },

  getDom() {
    // UI-less module, click hooks only
    const w = document.createElement("div");
    w.style.display = "none";
    return w;
  },

  notificationReceived(notification, payload) {
    // 1) Existing event click, CalendarExt3 already emits this with rich details
    if (notification === "EDIT_CALENDAR_EVENT" && payload) {
      if (this.config.debug) console.log("[ICLOUD-ADD] EDIT_CALENDAR_EVENT", payload);

      // Ask backend to locate the CalDAV object reliably using title + start/end
      this.sendSocketNotification("CE3_LOOKUP_EVENT", {
        caldav: this.config.caldav,
        // CalendarExt3 provides startDate/endDate as timestamps (strings), keep them
        title: payload.title,
        startDate: payload.startDate,
        endDate: payload.endDate,
        calendarName: payload.calendarName,
        allDay: payload.allDay,
        location: payload.location,
        description: payload.description
      });

      // Later: open your edit/delete modal immediately using payload,
      // then when LOOKUP returns UID/href/etag you enable Save/Delete.
      return;
    }

    // 2) When DOM is ready, hook empty day clicks once
    if (notification === "DOM_OBJECTS_CREATED") {
      setTimeout(() => this.hookEmptyDayClicks(), 800);
    }
  },

  hookEmptyDayClicks() {
    if (this._rootHooked) return;

    const root = document.querySelector(".MMM-CalendarExt3");
    if (!root) {
      if (this.config.debug) console.log("[ICLOUD-ADD] CalendarExt3 root not found yet");
      return;
    }

    // Use pointerup/touchend so it works on touchscreen kiosk
    const handler = (e) => {
      // Debounce fast repeat taps
      const now = Date.now();
      if (now - this._lastTapTs < 250) return;
      this._lastTapTs = now;

      // If tapped on an event, do nothing here.
      if (e.target.closest(this.config.eventSelector)) return;

      const cell = e.target.closest(this.config.dayCellSelector);
      if (!cell) return;

      // CalendarExt3 sets data-hasevents to 'true'/'false'
      const hasEvents = (cell.dataset.hasEvents === "true");
      if (hasEvents) return;

      const iso = this.toISO(cell.dataset.date || cell.getAttribute("data-date"));
      if (!iso) return;

      if (this.config.debug) console.log("[ICLOUD-ADD] empty day tap -> add", iso);

      // IMPORTANT: don’t use alert. This is where you open your modal.
      // For now, just log and ask backend to prep any needed defaults.
      this.sendSocketNotification("CE3_PREP_ADD", {
        caldav: this.config.caldav,
        date: iso
      });

      // Later: openAddModal(iso)
    };

    root.addEventListener("pointerup", handler, true);
    root.addEventListener("touchend", handler, true);

    this._rootHooked = true;
    if (this.config.debug) console.log("[ICLOUD-ADD] empty day click hooks attached");
  },

  socketNotificationReceived(notification, payload) {
    if (this.config.debug) console.log("[ICLOUD-ADD] socket", notification, payload);

    if (notification === "CE3_LOOKUP_EVENT_RESULT") {
      if (!payload || !payload.found) {
        console.log("[ICLOUD-ADD] lookup: not found");
        return;
      }

      console.log("[ICLOUD-ADD] lookup found:", payload.event);

      // payload.event should include uid/href/etag so update/delete is safe
      // Later: openEditModal(payload.event)
      return;
    }

    if (notification === "CE3_WRITE_RESULT") {
      // Immediate refresh of the calendar module’s ICS URL
      this.sendNotification("FETCH_CALENDAR", { url: this.config.caldav.providerIcsUrl });
      return;
    }

    if (notification === "CE3_WRITE_ERROR") {
      console.error("[ICLOUD-ADD] write error:", payload);
    }
  },

  toISO(ts) {
    const n = parseInt(ts, 10);
    if (Number.isNaN(n)) return "";
    return new Date(n).toISOString().slice(0, 10);
  }
});
