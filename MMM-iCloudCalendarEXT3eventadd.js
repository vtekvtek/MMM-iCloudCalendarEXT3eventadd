/* global Module, Log */

Module.register("MMM-iCloudCalendarEXT3eventadd", {
  defaults: {
    debug: false,
    caldav: {}
  },

  start() {
    this._visible = false
    this._mode = "add" // add | edit
    this._current = null // holds event being edited, includes uid when editing

    this._onDateClicked = (e) => {
      const date = e?.detail?.date
      if (!date) return
      if (this.config.debug) console.log("[ICLOUD-ADD] empty day tap -> add", date)
      this.openAddForDate(date)
    }

    document.addEventListener("ICLOUD_CX3_DATE_CLICKED", this._onDateClicked)
  },

  getStyles() {
    return ["MMM-iCloudCalendarEXT3eventadd.css"]
  },

  getDom() {
    const wrap = document.createElement("div")
    wrap.className = "icloudEventAddRoot"
    wrap.style.display = this._visible ? "block" : "none"

    const overlay = document.createElement("div")
    overlay.className = "icloudOverlay"

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

    // delete button only in edit mode with uid
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

    btnBar.append(cancelBtn, saveBtn)

    form.append(titleRow, allDayRow, startRow, endRow, locRow, descRow, btnBar)
    modal.append(title, form)
    overlay.append(modal)
    wrap.append(overlay)

    return wrap
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
    this.updateDom(0)
  },

  openEdit(eventObj) {
    this._mode = "edit"
    this._current = {
      ...eventObj,
      // normalize numeric timestamps (CalendarExt3 often provides strings)
      startDate: Number(eventObj.startDate),
      endDate: Number(eventObj.endDate)
    }
    this._visible = true
    this.updateDom(0)
  },

  close() {
    this._visible = false
    this._current = null
    this.updateDom(0)
  },

  // ---------- submit/delete ----------
  _submit() {
    const title = document.getElementById("icloud_title")?.value?.trim() || ""
    const allDay = !!document.getElementById("icloud_allday")?.checked
    const startVal = document.getElementById("icloud_start")?.value
    const endVal = document.getElementById("icloud_end")?.value
    const location = document.getElementById("icloud_loc")?.value || ""
    const description = document.getElementById("icloud_desc")?.value || ""

    if (!title) {
      if (this.config.debug) console.log("[ICLOUD-ADD] missing title")
      return
    }
    if (!startVal || !endVal) {
      if (this.config.debug) console.log("[ICLOUD-ADD] missing start/end")
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

    const payload = {
      caldav: this.config.caldav,
      uid
    }

    if (this.config.debug) console.log("[ICLOUD-ADD] DELETE payload", payload)
    this.sendSocketNotification("DELETE_CALENDAR_EVENT", payload)
    this.close()
  },

  // ---------- notifications ----------
  notificationReceived(notification, payload) {
    if (notification === "EDIT_CALENDAR_EVENT" && payload) {
      if (this.config.debug) console.log("[ICLOUD-ADD] EDIT_CALENDAR_EVENT", payload)

      this.openEdit({
        uid: payload.uid || payload.id,
        title: payload.title,
        startDate: payload.startDate,
        endDate: payload.endDate,
        fullDayEvent: payload.fullDayEvent,
        description: payload.description || "",
        location: payload.location || "",
        calendarName: payload.calendarName || ""
      })
    }
  },

  socketNotificationReceived(notification, payload) {
    if (this.config.debug) console.log("[ICLOUD-ADD] socket:", notification, payload)

    // Optional: you can display a toast or log success/failure here.
    // Backend should send:
    // EVENT_ADD_SUCCESS / EVENT_UPDATE_SUCCESS / EVENT_DELETE_SUCCESS
    // EVENT_OP_FAILED
  }
})
