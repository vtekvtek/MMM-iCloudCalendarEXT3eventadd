/* global Module */

Module.register("MMM-iCloudCalendarEXT3eventadd", {
  defaults: {
    debug: false,
    caldav: {}
  },

  start() {
    this._visible = false;
    this._mode = "add"; // "add" | "edit"
    this._current = null;
    this._currentActiveInputId = null;
    this.keyboard = null;
    this._kbdTimer = null;

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
      // If our modal is already open, don't recapture
      if (this._visible) return;

      const t = ev.target;
      if (!t || !t.closest) return;

      // Only care about clicks inside CalendarExt3
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
    return [
      "MMM-iCloudCalendarEXT3eventadd.css",
      "https://cdn.jsdelivr.net/npm/simple-keyboard@latest/build/css/index.css"
    ];
  },

  getScripts() {
    return ["https://cdn.jsdelivr.net/npm/simple-keyboard@latest/build/index.min.js"];
  },

  // ---------- keyboard ----------
  _initKeyboard() {
    if (typeof window.SimpleKeyboard === "undefined") return;
    if (this.keyboard) return;

    this.keyboard = new window.SimpleKeyboard.default({
      onChange: (input) => this._onKeyboardChange(input),
      onKeyPress: (button) => this._onKeyboardKeyPress(button),
      theme: "hg-theme-default hg-layout-default icloud-keyboard",
      layoutName: "default",
      layout: {
        default: [
          "q w e r t y u i o p",
          "a s d f g h j k l",
          "{shift} z x c v b n m {backspace}",
          "{numbers} , . - {space} {close}"
        ],
        shift: [
          "Q W E R T Y U I O P",
          "A S D F G H J K L",
          "{shift} Z X C V B N M {backspace}",
          "{numbers} , . - {space} {close}"
        ],
        numbers: ["1 2 3", "4 5 6", "7 8 9", "{abc} 0 {backspace}"]
      },
      display: {
        "{shift}": "⇧",
        "{backspace}": "⌫",
        "{numbers}": "123",
        "{abc}": "ABC",
        "{space}": "Space",
        "{close}": "Close"
      }
    });

    // If something is already focused, sync keyboard to it
    if (this._currentActiveInputId) {
      const el = document.getElementById(this._currentActiveInputId);
      if (el) this.keyboard.setInput(el.value || "");
    }
  },

  _destroyKeyboard() {
    if (this._kbdTimer) {
      clearTimeout(this._kbdTimer);
      this._kbdTimer = null;
    }
    if (this.keyboard) {
      this.keyboard.destroy();
      this.keyboard = null;
    }
  },

  _onKeyboardChange(input) {
    const inputElement = document.getElementById(this._currentActiveInputId);
    if (!inputElement) return;

    inputElement.value = input;
    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
  },

  _onKeyboardKeyPress(button) {
    if (!this.keyboard) return;

    if (button === "{shift}" || button === "{lock}") {
      const currentLayout = this.keyboard.options.layoutName;
      this.keyboard.setOptions({
        layoutName: currentLayout === "default" ? "shift" : "default"
      });
      return;
    }

    if (button === "{numbers}") {
      this.keyboard.setOptions({ layoutName: "numbers" });
      return;
    }

    if (button === "{abc}") {
      this.keyboard.setOptions({ layoutName: "default" });
      return;
    }

    if (button === "{close}") {
      this.close();
    }
  },

  // ---------- UI ----------
  _renderPortal() {
    if (!this._portal) return;

    // Toggle portal visibility via class to avoid fragile inline display logic
    this._portal.classList.toggle("is-open", !!this._visible);

    // Clear content
    this._portal.innerHTML = "";

    if (!this._visible) {
      this._destroyKeyboard();
      return;
    }

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

    const kbdDiv = document.createElement("div");
    // Important: add icloud-keyboard class so your CSS targets actually match
    kbdDiv.className = "simple-keyboard icloud-keyboard";

    form.append(titleRow, startRow, endRow, locRow, descRow, btnBar, kbdDiv);
    modal.append(title, form);
    overlay.append(modal);
    wrap.append(overlay);
    this._portal.appendChild(wrap);

    // Init keyboard after the container exists
    this._kbdTimer = setTimeout(() => {
      if (this._visible) this._initKeyboard();
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

    // Use keyboard for text fields (and optionally datetime fields too)
    const keyboardTypes = new Set(["text"]);
    if (keyboardTypes.has(type)) {
      input.addEventListener("focus", () => {
        this._currentActiveInputId = id;
        if (this.keyboard) this.keyboard.setInput(input.value || "");
      });

      // Keep keyboard in sync if a physical keyboard is used
      input.addEventListener("input", (e) => {
        if (this._currentActiveInputId === id && this.keyboard) {
          this.keyboard.setInput(e.target.value || "");
        }
      });
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

    ta.addEventListener("focus", () => {
      this._currentActiveInputId = id;
      if (this.keyboard) this.keyboard.setInput(ta.value || "");
    });

    ta.addEventListener("input", (e) => {
      if (this._currentActiveInputId === id && this.keyboard) {
        this.keyboard.setInput(e.target.value || "");
      }
    });

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
    this._currentActiveInputId = "icloud_title";
    this._renderPortal();
  },

  openEdit(eventObj) {
    this._mode = "edit";
    this._current = eventObj;
    this._visible = true;
    this._currentActiveInputId = "icloud_title";
    this._renderPortal();
  },

  close() {
    this._visible = false;
    this._current = null;
    this._currentActiveInputId = null;
    this._renderPortal();
  },

  // ---------- submit (placeholder for now) ----------
  _submit() {
    if (this.config.debug) console.log("[ICLOUD-ADD] submit placeholder");
    this.close();
  }
});
