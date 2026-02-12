/* global Module */

Module.register("MMM-iCloudCalendarEXT3eventadd", {
  defaults: {
    debug: false,
    caldav: {}
  },

  start() {
    this._visible = false
    this._mode = "add" // add | edit
    this._current = null

    // Create a portal root in <body> so the modal is never behind CalendarExt3
    this._portal = document.getElementById("ICLOUD_EVENTADD_PORTAL")
    if (!this._portal) {
      this._portal = document.createElement("div")
      this._portal.id = "ICLOUD_EVENTADD_PORTAL"
      document.body.appendChild(this._portal)
    }

    // Initial render (empty)
    this._renderPortal()

    // Capture clicks BEFORE CalendarExt3 handlers (popover)
    this._onGlobalClickCapture = (ev) => {
      // Modal open, do not handle background interactions
      if (this._visible) return

      const t = ev.target
      if (!t || !t.closest) return

      // Only respond inside CalendarExt3
      const insideCX3 = t.closest(".CX3")
      if (!insideCX3) return

      // 1) Existing event click always wins
      const eventDom = t.closest(".event")
      if (eventDom && eventDom.dataset && eventDom.dataset.startDate) {
        ev.preventDefault()
        ev.stopPropagation()
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation()

        const ds = eventDom.dataset

        const payload = {
          uid: ds.uid || ds.id || null, // may be null, still open edit UI
          title: (ds.title || "").trim(),
          startDate: ds.startDate,
          endDate: ds.endDate,
          fullDayEvent: ds.fullDayEvent === "true",
          description: ds.description || "",
          location: ds.location || "",
          calendarName: ds.calendarName || ""
        }

        if (this.config.debug) console.log("[ICLOUD-ADD] EVENT TAP -> EDIT", payload)

        this.openEdit(payload)
        return
      }

      // 2) Empty day click only when it is NOT an event
      const cellDom = t.closest(".cell")
      if (cellDom && cellDom.dataset) {
        const hasEvents = cellDom.dataset.hasEvents === "true"
        if (hasEvents) return // leave CalendarExt3 to show day popover

        ev.preventDefault()
        ev.stopPropagation()
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation()

        const date = cellDom.dataset.date
        if (!date) return

        if (this.config.debug) console.log("[ICLOUD-ADD] CELL TAP -> ADD", date)
        this.openAddForDate(date)
      }
    }

    document.addEventListener("click", this._onGlobalClickCapture, true)
  },

  stop() {
    if (this._onGlobalClickCapture) {
      document.removeEventListener("click", this._onGlobalClickCapture, true)
    }
  },

  getStyles() {
    return ["MMM-iCloudCalendarEXT3eventadd.css"]
  },

  // UI rendered into <body> via portal, module DOM can be empty
  getDom() {
    return document.createElement("div")
  },

  // ---------- portal renderer ----------
  _renderPortal() {
    if (!this._portal) return

    this._portal.innerHTML = ""
    if (!this._visible) return

    const wrap = document.createElement("div")
    wrap.className = "icloudEventAddRoot"

    const overlay = document.createElement("div")
    overlay.className = "icloudOverlay"

    // tap outside closes
    overlay.onclick = (ev) => {
      if (ev.target === overlay) this.close()
    }

    const modal = document.createElement("div")
    modal.className = "icloudModal"

    const title = document.createElement("div")
    title.className = "icloudTitle"
    title.textContent = this._mode === "edit" ? "Edit event" : "Add event"

    const form = document.createElement("div")
    form.className = "icloudForm"

    const titleRow = this._row("Title", "text", "icloud_title", this._current?.title || "")
    const allDayRow = this._rowCheckbox("All day", "icloud_allday", !!this._current?.fullDayEvent)

    const startRow = this._row(
      "Start",
      "datetime-local",
      "icloud_start",
      this._toDateTimeLocal(this._current?.startDate)
    )
    const endRow = this._row(
      "End",
      "datetime-local",
      "icloud_end",
      this._toDateTimeLocal(this._current?.endDate)
    )

    const locRow = this._row("Location", "text", "icloud_loc", this._current?.location || "")
    const descRow = this._rowTextArea("Description", "icloud_desc", this._current?.description || "")

    const btnBar = document.createElement("div")
    btnBar.className = "icloudButtons"

    // Delete button only in edit mode with uid
    if (this._mode === "edit" && this._current?.uid) {
      const delBtn = document.createElement("button")
      delBtn.className = "icloudBtn delete"
      delBtn.textContent = "Delete"
      delBtn.onclick = (ev) => {
        ev.preventDefault()
        this._delete()
      }
      btnBar.append(delBtn)
    }

    const cancelBtn = document.createElement("button")
    cancelBtn.className = "icloudBtn cancel"
    cancelBtn.textContent = "Cancel"
    cancelBtn.onclick = (ev) => {
      ev.preventDefault()
      this.close()
    }

    const saveBtn = document.createElement("button")
    saveBtn.className = "icloudBtn save"
    saveBtn.textContent = "Save"
    saveBtn.onclick = (ev) => {
      ev.preventDefault()
      this._submit()
    }

    btnBar.append(cancelBtn, saveBtn)

    form.append(titleRow, allDayRow, startRow, endRow, locRow, descRow, btnBar)
    modal.append(title, form)
    overlay.append(modal)
    wrap.append(overlay)

    this._portal.appendChild(wrap)
  },

  // ---------- UI helpers ----------
  _row(label, type, id, value) {
    const row = document.createElement("div")
    row.className = "icloudRow"

    const l = document.createElement("label")
    l.textContent = label
    l.htmlFor = id

    const input = document.createElement("input")
    input.type = type
    input.id = id
    input.value = value || ""

    row.append(l, input)
    return row
  },

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

  _rowTextArea(label, id, value) {
    const row = document.createElement("div")
    row.className = "icloudRow"

    const l = document.createElement("label")
    l.textContent = label
    l.htmlFor = id

    const ta = document.createElement("textarea")
    ta.id = id
    ta.value = value || ""

    row.append(l, ta)
    return row
  },

  _toDateTimeLocal(ms) {
    if (ms === null || ms === undefined || ms === "") return ""
    const n = Number(ms)
    if (!Number.isFinite(n)) return ""
    const d = new Date(n)
    const pad = (x) => String(x).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  // ---------- open/close ----------
  openAddForDate(dateMs) {
    const d = new Date(Number(dateMs))
    d.setHours(8, 0, 0, 0)

    const start = d.getTime()
    const end = start + 30 * 60 * 1000

    this._mode = "add"
    this._current = {
      uid: null,
      title: "",
      startDate: start,
      endDate: end,
      fullDayEvent: false,
      description: "",
      location: ""
    }

    this._visible = true
    this._renderPortal()
  },

  openEdit(eventObj) {
    this._mode = "edit"
    this._current = {
      uid: eventObj.uid || null,
      title: eventObj.title || "",
      startDate: Number(eventObj.startDate),
      endDate: Number(eventObj.endDate),
      fullDayEvent: !!eventObj.fullDayEvent,
      description: eventObj.description || "",
      location: eventObj.location || "",
      calendarName: eventObj.calendarName || ""
    }

    this._visible = true
    this._renderPortal()
  },

  close() {
    this._visible = false
    this._current = null
    this._renderPortal()
  },

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
