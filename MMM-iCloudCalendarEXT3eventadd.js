/* global Module */

Module.register("MMM-iCloudCalendarEXT3eventadd", {

  defaults: {
    caldav: {
      envPrefix: "ICLOUD_",
      serverUrl: "https://caldav.icloud.com",
      calendarDisplayName: "Family",
      providerIcsUrl: "http://127.0.0.1:8888/CALDAV/ICLOUD_Family.ics"
    }
  },

  start() {
    this.modalMode = "ADD";
    this.editContext = null;
  },

  getStyles() {
    return [this.file("style.css")];
  },

  notificationReceived(notification) {
    if (notification === "DOM_OBJECTS_CREATED") {
      setTimeout(() => this.attachCalendarClickHandlers(), 1000);
    }
  },

  attachCalendarClickHandlers() {
    const dayCells = document.querySelectorAll(".cell[data-date]");

    dayCells.forEach(cell => {
      if (cell.dataset.bound === "1") return;
      cell.dataset.bound = "1";

      cell.addEventListener("click", (e) => {
        if (e.target.closest(".event")) return;

        const iso = this.toISO(cell.getAttribute("data-date"));
        const hasEvents = cell.querySelector(".event");

        if (!hasEvents) {
          this.openAddModal(iso);
        }
      });
    });

    const events = document.querySelectorAll(".cell .event");

    events.forEach(ev => {
      if (ev.dataset.bound === "1") return;
      ev.dataset.bound = "1";

      ev.addEventListener("click", (e) => {
        e.stopPropagation();

        const cell = ev.closest(".cell");
        const iso = this.toISO(cell.getAttribute("data-date"));
        const title = ev.textContent.trim();

        this.sendSocketNotification("CE3_LOOKUP_EVENT", {
          caldav: this.config.caldav,
          date: iso,
          title
        });
      });
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "CE3_LOOKUP_EVENT_RESULT" && payload.found) {
      this.openEditModal(payload.date, payload.event);
    }

    if (notification === "CE3_WRITE_RESULT") {
      this.sendNotification("FETCH_CALENDAR", { url: this.config.caldav.providerIcsUrl });
    }
  },

  openAddModal(date) {
    this.modalMode = "ADD";
    alert(`Add event for ${date}`);
  },

  openEditModal(date, eventData) {
    this.modalMode = "EDIT";
    this.editContext = eventData;
    alert(`Edit event: ${eventData.title}`);
  },

  toISO(timestamp) {
    return new Date(parseInt(timestamp)).toISOString().slice(0, 10);
  }
});
