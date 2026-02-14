/* global Module */

Module.register("MMM-iCloudCalendarEXT3eventadd", {
  defaults: {
    debug: false,
    caldav: {}
  },

  start() {
    this._visible = false;
    this._mode = "add";
    this._current = null;
    this._currentActiveInputId = null;

    this._portal = document.getElementById("ICLOUD_EVENTADD_PORTAL");
    if (!this._portal) {
      this._portal = document.createElement("div");
      this._portal.id = "ICLOUD_EVENTADD_PORTAL";
      document.body.appendChild(this._portal);
    }

    this._renderPortal();

    this._onGlobalClickCapture = (ev) => {
      if (this._visible) return;
      const t = ev.target;
      if (!t || !t.closest) return;
      const insideCX3 = t.closest(".CX3");
      if (!insideCX3) return;

      const eventDom = t.closest(".event");
      if (eventDom && eventDom.dataset && eventDom.dataset.startDate) {
        ev.preventDefault();
        ev.stopPropagation();
        const ds = eventDom.dataset;
        const payload = {
          uid: ds.uid || ds.id || null,
          title: (ds.title || "").trim(),
          startDate: ds.startDate,
          endDate: ds.endDate,
          fullDayEvent: ds.fullDayEvent === "true",
          description: ds.description || "",
          location: ds.location || "",
          calendarName: ds.calendarName || ""
        };
        this.openEdit(payload);
        return;
      }

      const cellDom = t.closest(".cell");
      if (cellDom && cellDom.dataset) {
        if (cellDom.dataset.hasEvents === "true") return;
        ev.preventDefault();
        ev.stopPropagation();
        const date = cellDom.dataset.date;
        if (!date) return;
        this.openAddForDate(date);
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

  // Initialize the keyboard inside the modal
  _initKeyboard() {
    if (typeof window.SimpleKeyboard === "undefined") return;

    this.keyboard = new window.SimpleKeyboard.default({
      onChange: (input) => this._onKeyboardChange(input),
      onKeyPress: (button) => this._onKeyboardKeyPress(button),
      theme: "hg-theme-default hg-layout-default icloud-keyboard",
      layout: {
        default: [
          "q w e r t y u i o p",
          "a s d f g h j k l",
          "{shift} z x c v b n m {backspace}",
          "{numbers} {space} {close}"
        ],
        shift: [
          "Q W E R T Y U I O P",
          "A S D F G H J K L",
          "{shift} Z X C V B N M {backspace}",
          "{numbers} {space} {close}"
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
  },

  _onKeyboardChange(input) {
    const inputElement = document.getElementById(this._currentActiveInputId);
    if (inputElement) {
      inputElement.value = input;
    }
  },

  _onKeyboardKeyPress(button) {
    if (button === "{shift}" || button === "{lock}") {
      const currentLayout = this.keyboard.options.layoutName;
      this.keyboard.setOptions({
        layoutName: currentLayout === "default" ? "shift" : "default"
      });
    }
    if (button === "{numbers}") this.keyboard.setOptions({ layoutName: "numbers" });
    if (button === "{abc}") this.keyboard.setOptions({ layoutName: "default" });
    if (button === "{close}") this.close();
  },

  _renderPortal() {
    if (!this._portal) return;
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
    const allDayRow = this._rowCheckbox("All day", "icloud_allday", !!this._current?.fullDayEvent);
    const startRow = this._row("Start", "datetime-local", "icloud_start", this._toDateTimeLocal(this._current?.startDate));
    const endRow = this._row("End", "datetime-local", "icloud_end", this._toDateTimeLocal(this._current?.endDate));
    const locRow = this._row("Location", "text", "icloud_loc", this._current?.location || "");
    const descRow = this._rowTextArea("Description", "icloud_desc", this._current?.description || "");

    const btnBar = document.createElement("div");
    btnBar.className = "icloudButtons";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "icloudBtn cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => this.close();

    const saveBtn = document.createElement("button");
    saveBtn.className = "icloudBtn save";
    saveBtn.textContent = "Save";
    saveBtn.onclick = () => this._submit();

    btnBar.append(cancelBtn, saveBtn);

    // Create Keyboard Div
    const kbdDiv = document.createElement("div");
    kbdDiv.className = "simple-keyboard";

    form.append(titleRow, allDayRow, startRow, endRow, locRow, descRow, btnBar, kbdDiv);
    modal.append(title, form);
    overlay.append(modal);
    wrap.append(overlay);
    this._portal.appendChild(wrap);

    // Init keyboard after it's in the DOM
    setTimeout(() => this._initKeyboard(), 50);
  },

  _row(label, type, id, value) {
    const row = document.createElement("div");
    row.className = "icloudRow";
    const l = document.createElement("label");
    l.textContent = label;
    const input = document.createElement("input");
    input.type = type;
    input.id = id;
    input.value = value || "";
    
    if (type === "text") {
        input.onfocus = () => {
            this._currentActiveInputId = id;
            if(this.keyboard) this.keyboard.setInput(input.value);
        };
    }
    
    row.append(l, input);
    return row;
  },

  _rowTextArea(label, id, value) {
    const row = document.createElement("div");
    row.className = "icloudRow";
    const l = document.createElement("label");
    l.textContent = label;
    const ta = document.createElement("textarea");
    ta.id = id;
    ta.value = value || "";
    ta.onfocus = () => {
        this._currentActiveInputId = id;
        if(this.keyboard) this.keyboard.setInput(ta.value);
    };
    row.append(l, ta);
    return row;
  },

  // ... (keep your existing _rowCheckbox, _toDateTimeLocal, open methods, etc.) ...
  
  _rowCheckbox(label, id, checked) {
    const row = document.createElement("div")
    row.className = "icloudRow"
    const l = document.createElement("label")
    l.textContent = label
    l.htmlFor = id
    const input = document.createElement("input")
    input.type = "checkbox"
    input.id = id
    input.checked = !!checked
    row.append(l, input)
    return row
  },

  _toDateTimeLocal(ms) {
    if (!ms) return ""
    const d = new Date(Number(ms))
    const pad = (x) => String(x).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  openAddForDate(dateMs) {
    const d = new Date(Number(dateMs))
    d.setHours(8, 0, 0, 0)
    const start = d.getTime()
    const end = start + 30 * 60 * 1000
    this._mode = "add"
    this._current = { title: "", startDate: start, endDate: end, fullDayEvent: false, description: "", location: "" }
    this._visible = true
    this._renderPortal()
  },

  openEdit(eventObj) {
    this._mode = "edit"
    this._current = eventObj
    this._visible = true
    this._renderPortal()
  },

  close() {
    this._visible = false
    this._current = null
    this._renderPortal()
  }
});
  
  // ---------- submit/delete ----------
  _submit() {
    const title = document.getElementById("icloud_title")?.value?.trim() || ""
    const allDay = !!document.getElementById("icloud_allday")?.checked
    const startVal = document.getElementById("icloud_start")?.value
    const endVal = document.getElementById("icloud_end")?.value
    const location = document.getElementById("icloud_loc")?.value || ""
    const description = document.getElementById("icloud_desc")?.value || ""

    if (!title || !startVal || !endVal) {
      if (this.config.debug) console.log("[ICLOUD-ADD] missing title/start/end")
      return
    }

    const startDate = new Date(startVal).getTime()
    const endDate = new Date(endVal).getTime()

    const payload = {
      caldav: this.config.caldav,
      uid: this._current?.uid || null,
      title,
      startDate,
      endDate,
      allDay,
      location,
      description
    }

    if (this._mode === "edit" && payload.uid) {
      if (this.config.debug) console.log("[ICLOUD-ADD] UPDATE payload", payload)
      this.sendSocketNotification("UPDATE_CALENDAR_EVENT", payload)
    } else {
      if (this.config.debug) console.log("[ICLOUD-ADD] ADD payload", payload)
      this.sendSocketNotification("ADD_CALENDAR_EVENT", payload)
    }

    this.close()
  },

  _delete() {
    const uid = this._current?.uid
    if (!uid) return

    const payload = { caldav: this.config.caldav, uid }
    if (this.config.debug) console.log("[ICLOUD-ADD] DELETE payload", payload)

    this.sendSocketNotification("DELETE_CALENDAR_EVENT", payload)
    this.close()
  },

  socketNotificationReceived(notification, payload) {
    if (this.config.debug) console.log("[ICLOUD-ADD] socket:", notification, payload)
  }
})





