/* global Module, Log */

Module.register("MMM-iCloudCalendarEXT3eventadd", {
  defaults: {
    caldav: {
      envPrefix: "ICLOUD_",
      serverUrl: "https://caldav.icloud.com",
      calendarDisplayName: "Family",
      providerIcsUrl: "http://127.0.0.1:8888/CALDAV/ICLOUD_Family.ics"
    },
    // These selectors vary by CalendarExt3 skin/version, so we include a few common ones.
    selectors: {
      dayCell: ".cell[data-date]",
      event: ".cell .event, .cell .eventItem, .cell .ce3-event"
    },
    debug: true
  },

  start() {
    this.modalMode = "ADD";
    this.editContext = null;

    Log.info("[ICLOUD-ADD] module started");

    // Re-attach handlers after CalendarExt3 renders/updates
    this._attachTimer = null;
  },

  getStyles() {
    return [];
  },

  getDom() {
    // This module is UI-less, it hooks clicks only.
    const wrapper = document.createElement("div");
    wrapper.style.display = "none";
    return wrapper;
  },

  notificationReceived(notification) {
    if (notification === "DOM_OBJECTS_CREATED" || notification === "CALENDAR_EXT3_RENDERED") {
      this.deferAttach();
    }
  },

  deferAttach() {
    if (this._attachTimer) clearTimeout(this._attachTimer);
    this._attachTimer = setTimeout(() => this.attachCalendarClickHandlers(), 500);
  },

  attachCalendarClickHandlers() {
    const dayCells = document.querySelectorAll(this.config.selectors.dayCell);
    if (this.config.debug) {
      console.log("[ICLOUD-ADD] attachCalendarClickHandlers, dayCells:", dayCells.length);
    }

    dayCells.forEach((cell) => {
      if (cell.dataset.icloudAddBound === "1") return;
      cell.dataset.icloudAddBound = "1";

      // Capture phase so we run before CalendarExt3 handlers
      cell.addEventListener(
        "click",
        (e) => {
          // If the click is on an event element, let the event handler handle it.
          if (e.target.closest(this.config.selectors.event)) return;

          // Stop CalendarExt3 from consuming the click first
          e.preventDefault();
          e.stopPropagation();

          const iso = this.toISO(cell.getAttribute("data-date"));

          // Only add if no events exist in that day cell
          const hasEvents = !!cell.querySelector(this.config.selectors.event);
          if (hasEvents) {
            if (this.config.debug) console.log("[ICLOUD-ADD] day click ignored (has events)", iso);
            return;
          }

          Log.info(`[ICLOUD-ADD] empty day click -> add (${iso})`);
          console.log("[ICLOUD-ADD] empty day click -> add", iso);

          // Temporary proof UI
          alert(`[ICLOUD-ADD] Add event for ${iso}`);

          // Later we’ll open your real modal here
          // this.openAddModal(iso);
        },
        true
      );
    });

    const events = document.querySelectorAll(this.config.selectors.event);
    if (this.config.debug) console.log("[ICLOUD-ADD] attachCalendarClickHandlers, events:", events.length);

    events.forEach((ev) => {
      if (ev.dataset.icloudAddEventBound === "1") return;
      ev.dataset.icloudAddEventBound = "1";

      ev.addEventListener(
        "click",
        (e) => {
          // Stop CalendarExt3 from also handling the click
          e.preventDefault();
          e.stopPropagation();

          const cell = ev.closest(this.config.selectors.dayCell);
          if (!cell) return;

          const iso = this.toISO(cell.getAttribute("data-date"));
          const title = (ev.textContent || "").trim();

          Log.info(`[ICLOUD-ADD] event click -> lookup (${iso}) "${title}"`);
          console.log("[ICLOUD-ADD] event click -> lookup", { iso, title });

          // Temporary proof UI
          alert(`[ICLOUD-ADD] Edit event: ${title}`);

          this.sendSocketNotification("CE3_LOOKUP_EVENT", {
            caldav: this.config.caldav,
            date: iso,
            title
          });
        },
        true
      );
    });
  },

  socketNotificationReceived(notification, payload) {
    if (this.config.debug) console.log("[ICLOUD-ADD] socketNotificationReceived", notification, payload);

    if (notification === "CE3_LOOKUP_EVENT_RESULT") {
      if (!payload || !payload.found) {
        if (this.config.debug) alert("[ICLOUD-ADD] Lookup: not found");
        return;
      }

      // Later: open real edit/delete modal here
      alert(`[ICLOUD-ADD] Lookup found UID: ${payload.event.uid}`);
      // this.openEditModal(payload.date, payload.event);
    }

    if (notification === "CE3_WRITE_RESULT") {
      // Force immediate refresh of the calendar provider ICS
      this.sendNotification("FETCH_CALENDAR", { url: this.config.caldav.providerIcsUrl });
    }

    if (notification === "CE3_WRITE_ERROR") {
      alert(`[ICLOUD-ADD] Error: ${payload}`);
    }
  },

  toISO(timestamp) {
    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts)) return "";
    return new Date(ts).toISOString().slice(0, 10);
  }
});

