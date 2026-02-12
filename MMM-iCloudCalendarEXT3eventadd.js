/* global Module, Log */

Module.register("MMM-iCloudCalendarEXT3eventadd", {
  defaults: {
    caldav: {
      envPrefix: "ICLOUD_",
      serverUrl: "https://caldav.icloud.com",
      calendarDisplayName: "Family",
      providerIcsUrl: "http://127.0.0.1:8888/CALDAV/ICLOUD_Family.ics"
    },
    selectors: {
      root: ".MMM-CalendarExt3",
      dayCell: ".cell[data-date]",
      event: ".event, .eventItem, .ce3-event"
    },
    debug: true
  },

  start() {
    Log.info("[ICLOUD-ADD] module started");
    this._observer = null;
    this._attachTimer = null;
  },

  getDom() {
    const w = document.createElement("div");
    w.style.display = "none";
    return w;
  },

  notificationReceived(notification) {
    if (notification === "DOM_OBJECTS_CREATED" || notification === "CALENDAR_EXT3_RENDERED") {
      this.deferHook();
    }
  },

  deferHook() {
    if (this._attachTimer) clearTimeout(this._attachTimer);
    this._attachTimer = setTimeout(() => this.hookCalendarRoot(), 300);
  },

  hookCalendarRoot() {
    const root = document.querySelector(this.config.selectors.root);
    if (!root) {
      if (this.config.debug) console.log("[ICLOUD-ADD] root not found yet");
      return;
    }

    if (this._observer) return;

    // Capture early events at the CalendarExt3 root so we win the race.
    const handler = (e) => this.handleAnyTap(e);

    // Use multiple event types because touch devices vary.
    root.addEventListener("pointerdown", handler, true);
    root.addEventListener("pointerup", handler, true);
    root.addEventListener("touchstart", handler, true);
    root.addEventListener("touchend", handler, true);
    root.addEventListener("click", handler, true);

    // Re-hook if CalendarExt3 rerenders
    this._observer = new MutationObserver(() => {
      // nothing needed, root handler catches everything
    });
    this._observer.observe(root, { childList: true, subtree: true });

    if (this.config.debug) console.log("[ICLOUD-ADD] root handlers attached");
  },

  handleAnyTap(e) {
    const root = document.querySelector(this.config.selectors.root);
    if (!root) return;

    const dayCell = e.target.closest(this.config.selectors.dayCell);
    if (!dayCell) return; // not a day cell interaction

    const eventEl = e.target.closest(this.config.selectors.event);
    const iso = this.toISO(dayCell.getAttribute("data-date"));

    // We are now taking over this interaction.
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

    if (eventEl) {
      const title = (eventEl.textContent || "").trim();
      if (this.config.debug) console.log("[ICLOUD-ADD] intercepted EVENT tap", { iso, title, type: e.type });
      alert(`[ICLOUD-ADD] Edit event: ${title}`);

      this.sendSocketNotification("CE3_LOOKUP_EVENT", {
        caldav: this.config.caldav,
        date: iso,
        title
      });
      return;
    }

    const hasEvents = !!dayCell.querySelector(this.config.selectors.event);
    if (hasEvents) {
      if (this.config.debug) console.log("[ICLOUD-ADD] day tap ignored (has events)", { iso, type: e.type });
      return;
    }

    if (this.config.debug) console.log("[ICLOUD-ADD] intercepted EMPTY day tap", { iso, type: e.type });
    alert(`[ICLOUD-ADD] Add event for ${iso}`);
  },

  socketNotificationReceived(notification, payload) {
    if (this.config.debug) console.log("[ICLOUD-ADD] socket", notification, payload);

    if (notification === "CE3_LOOKUP_EVENT_RESULT") {
      if (!payload || !payload.found) {
        alert("[ICLOUD-ADD] Lookup: not found");
        return;
      }
      alert(`[ICLOUD-ADD] Lookup found UID: ${payload.event.uid}`);
    }

    if (notification === "CE3_WRITE_RESULT") {
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
