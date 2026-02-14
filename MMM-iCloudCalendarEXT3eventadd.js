/* global Module */

Module.register("MMM-iCloudCalendarEXT3eventadd", {
  defaults: {
    debug: false,
    caldav: {},
    keyboardKey: "MMM-iCloudCalendarEXT3eventadd",
    keyboardStyle: "default" // "default" or "numbers"
  },

  start() {
    this._visible = false;
    this._mode = "add"; // "add" | "edit"
    this._current = null;
    this._currentActiveInputId = null;

    // Create or find the portal div
    this._portal = document.getElementById("ICLOUD_EVENTADD_PORTAL");
    if (!this._portal) {
      this._portal = document.createElement("div");
      this._portal.id = "ICLOUD_EVENTADD_PORTAL";
      document.body.appendChild(this._portal);
    }

    this._renderPortal();

    // Capture clicks before CalendarExt3 handles them
    this._onGlobalClickCapture = (ev) => {
      if (this._visible) return;

      const t = ev.target;
      if (!t || !t.closest) return;

      const insideCX3 = t.closest(".CX3");
      if (!insideCX3) return;

      // 1) Click on existing event, open Edit
      const eventDom = t.closest(".event");
      if (eventDom && eventDom.dataset && eventDom.dataset.startDate) {
        ev.preventDefault();
        ev.stopImmediatePropagation();

        const ds = eventDom.dataset;
        this.openEdit({
          uid: ds.uid || ds.id || null,
          title: (ds.title || "").trim(),
          startDate: ds.startDate,
          endDate: ds.endDate,
          fullDayEvent: ds.fullDayEvent === "true",
          description: ds.description || "",
          location: ds.location || "",
          calendarName: ds.calendarName || ""
        });
        return;
      }

      // 2) Click on empty cell, open Add
      const cellDom = t.closest(".cell");
      if (cellDom && cellDom.dataset) {
        ev.preventDefault();
        ev.stopImmediatePropagation();

        const date = cellDom.dataset.date;
        if (date) this.openAddForDate(date);
      }
    };

    document.addEventListener("click", this._onGlobalClickCapture, true);
  },

  getStyles() {
    // MMM-Keyboard loads and styles its own keyboard
    return ["MMM-iCloudCalendarEXT3eventadd.css"];
  },

  // ---------- MMM-Keyboard integration ----------
  _openKeyboardForTarget(targetId, styleOverride) {
    this._currentActiveInputId = targetId;

    const payload = {
      key: this.config.keyboardKey,
      style: styleOverride || this.config.keyboardStyle,
      data: {
        targetId
      }
    };

    if (this.config.debug) console.log("[ICLOUD-ADD] opening MMM-Keyboard:", payload);
    this.sendNotification("KEYBOARD", payload);
  },

  notificationReceived(notification, payload) {
    if (notification !== "KEYBOARD_INPUT") return;
    if (!payload || payload.key !== this.config.keyboardKey) return;

    const targetId = payload.data?.targetId;
    const message = payload.message ?? "";

    if (this.config.debug) {
      console.log("[ICLOUD-ADD] KEYBOARD_INPUT:", { targetId, message });
    }

    if (!targetId) return;

    const el = document.getElementById(targetId);
    if (!el) return;

    el.value = message;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  },

  // ---------- UI ----------
  _renderPortal() {
    if (!this._portal) return;

    this._portal.classList.toggle("is-open", !!this._visible);
    this._portal.innerHTML = "";

    if (!this._visible) return;

    const wrap = document.createElement("div");
    wrap.className = "icloudEventAddRoot";

    const overlay = document.createElement("div");
    overlay.className = "icloudOverlay";

    const modal = document.createElement("div");
    modal.className = "icloudModal";

    const title = document.createElement("div");
    title.className = "icloudTitle";
    title.textContent = this._mode === "edit" ? "Edit event" : "Add event";

    const form = document.createElement("div");
    form.className = "icloudForm";

    const titleRow = this._row("Title", "text", "icloud_title", this._current?.title || "");
    const startRow = this._row("Start", "datetime-local", "icloud_start", this._toDateTimeLocal(this._current?.startDate));
    const endRow = this._row("End", "datetime-local", "icloud_end", this._toDateTimeLocal(this._current?.endDate));
    const locRow = this._row("Location", "text", "icloud_loc", this._current?.location || "");
    const descRow = this._rowTextArea("Description", "icloud_desc", this._current?.description || "");

    const btnBar = document.createElement("div");
    btnBar.className = "icloudButtons";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "icloudBtn cancel";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => this.close();

    const saveBtn = document.createElement("button");
    saveBtn.className = "icloudBtn save";
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    saveBtn.onclick = () => this._submit();

    btnBar.append(cancelBtn, saveBtn);

    form.append(titleRow, startRow, endRow, locRow, descRow, btnBar);
    modal.append(title, form);
    overlay.append(modal);
    wrap.append(overlay);
    this._portal.appendChild(wrap);

    // Auto-focus title so the user can immediately type
    setTimeout(() => {
      const el = document.getElementById("icloud_title");
      if (el) el.focus();
    }, 0);
  },

  _row(label, type, id, value) {
    const row = document.createElement("div");
    row.className = "icloudRow";

    const l = document.createElement("label");
    l.textContent = label;
    l.htmlFor = id;

    const input = document.createElement("input");
    input.type = type;
    input.id = id;
    input.value = value || "";

    // Use MMM-Keyboard only for text fields (datetime is awkward on a soft keyboard)
    if (type === "text") {
      input.addEventListener("focus", () => this._openKeyboardForTarget(id, "default"));
    }

    row.append(l, input);
    return row;
  },

  _rowTextArea(label, id, value) {
    const row = document.createElement("div");
    row.className = "icloudRow";

    const l = document.createElement("label");
    l.textContent = label;
    l.htmlFor = id;

    const ta = document.createElement("textarea");
    ta.id = id;
    ta.value = value || "";

    ta.addEventListener("focus", () => this._openKeyboardForTarget(id, "default"));

    row.append(l, ta);
    return row;
  },

  _toDateTimeLocal(ms) {
    if (!ms) return "";
    const d = new Date(Number(ms));
    if (Number.isNaN(d.getTime())) return "";
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  // ---------- open/close ----------
  openAddForDate(dateMs) {
    const d = new Date(Number(dateMs));
    if (Number.isNaN(d.getTime())) return;

    d.setHours(8, 0, 0, 0);
    const start = d.getTime();

    this._mode = "add";
    this._current = { title: "", startDate: start, endDate: start + 30 * 60 * 1000 };
    this._visible = true;
    this._renderPortal();
  },

  openEdit(eventObj) {
    this._mode = "edit";
    this._current = eventObj;
    this._visible = true;
    this._renderPortal();
  },

  close() {
    this._visible = false;
    this._current = null;
    this._currentActiveInputId = null;
    this._renderPortal();

    // This is optional, but many keyboard modules use it as a cue to hide
    this.sendNotification("FORM_CLOSED");
  },

  // ---------- submit (placeholder for now) ----------
  _submit() {
    if (this.config.debug) console.log("[ICLOUD-ADD] submit placeholder");
    this.close();
  }
});
