"use strict";

const NodeHelper = require("node_helper");
const dav = require("dav");
const crypto = require("crypto");

module.exports = NodeHelper.create({
  start() {
    console.log("MMM-iCloudCalendarEXT3eventadd started");
  },

  async socketNotificationReceived(notification, payload) {
    try {
      if (notification === "ADD_CALENDAR_EVENT") {
        const res = await this.addEvent(payload);
        this.sendSocketNotification("EVENT_ADD_SUCCESS", res);
        return;
      }

      if (notification === "UPDATE_CALENDAR_EVENT") {
        const res = await this.updateEvent(payload);
        this.sendSocketNotification("EVENT_UPDATE_SUCCESS", res);
        return;
      }

      if (notification === "DELETE_CALENDAR_EVENT") {
        const res = await this.deleteEvent(payload);
        this.sendSocketNotification("EVENT_DELETE_SUCCESS", res);
        return;
      }
    } catch (err) {
      console.error("[ICLOUD-ADD] error:", err);
      this.sendSocketNotification("EVENT_OP_FAILED", {
        notification,
        error: err?.message ? err.message : String(err)
      });
    }
  },

  getCreds(prefix) {
    return {
      username: process.env[`${prefix}USERNAME`],
      password: process.env[`${prefix}PASSWORD`]
    };
  },

  async getAccount(cfg) {
    const { username, password } = this.getCreds(cfg.envPrefix);
    if (!username || !password) {
      throw new Error(
        `Missing credentials. Expected env vars: ${cfg.envPrefix}USERNAME and ${cfg.envPrefix}PASSWORD`
      );
    }

    const xhr = new dav.transport.Basic({ username, password });

    const account = await dav.createAccount({
      server: cfg.serverUrl,
      xhr,
      loadCollections: true,
      loadObjects: false
    });

    const cal = account.calendars.find(c => c.displayName === cfg.calendarDisplayName);
    if (!cal) throw new Error(`Calendar not found: ${cfg.calendarDisplayName}`);

    return { xhr, cal };
  },

  _icsEscape(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  },

  _formatDateUTC(dt) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`;
  },

  _extractLineValue(ics, key) {
    const re = new RegExp(`^${key}:(.*)$`, "m");
    const m = ics.match(re);
    return m ? m[1].trim() : null;
  },

  async _findObjectByUid({ xhr, cal, uid }) {
    const filters = [{
      type: "comp-filter",
      attrs: { name: "VCALENDAR" },
      children: [{ type: "comp-filter", attrs: { name: "VEVENT" } }]
    }];

    const objects = await dav.listCalendarObjects(cal, { xhr, filters });

    const needle = `UID:${uid}`;
    const match = objects.find(o => (o.calendarData || "").includes(needle));
    if (!match) return null;

    return {
      url: match.url,
      etag: match.etag,
      calendarData: match.calendarData,
      uid: this._extractLineValue(match.calendarData, "UID") || uid
    };
  },

  _buildVeventIcs({ uid, title, startDate, endDate, allDay, location, description }) {
    const now = new Date();
    const dtstamp = this._formatDateUTC(now);
    const dtStart = new Date(Number(startDate));
    const dtEnd = new Date(Number(endDate));
    const safeUid = uid || (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"));

    let dtstartLine = "";
    let dtendLine = "";

    if (allDay) {
      const pad = (n) => String(n).padStart(2, "0");
      const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

      const s = new Date(Date.UTC(dtStart.getFullYear(), dtStart.getMonth(), dtStart.getDate(), 0, 0, 0));
      const e0 = new Date(Date.UTC(dtEnd.getFullYear(), dtEnd.getMonth(), dtEnd.getDate(), 0, 0, 0));
      const e = new Date(e0.getTime() + 24 * 60 * 60 * 1000); // exclusive

      dtstartLine = `DTSTART;VALUE=DATE:${ymd(s)}`;
      dtendLine = `DTEND;VALUE=DATE:${ymd(e)}`;
    } else {
      dtstartLine = `DTSTART:${this._formatDateUTC(dtStart)}`;
      dtendLine = `DTEND:${this._formatDateUTC(dtEnd)}`;
    }

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MagicMirror//MMM-iCloudCalendarEXT3eventadd//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${safeUid}`,
      `DTSTAMP:${dtstamp}`,
      dtstartLine,
      dtendLine,
      `SUMMARY:${this._icsEscape(title)}`
    ];

    if (location) lines.push(`LOCATION:${this._icsEscape(location)}`);
    if (description) lines.push(`DESCRIPTION:${this._icsEscape(description)}`);

    lines.push("END:VEVENT", "END:VCALENDAR");

    return { uid: safeUid, ics: lines.join("\r\n") + "\r\n" };
  },

  async addEvent(payload) {
    const { xhr, cal } = await this.getAccount(payload.caldav);

    const { uid, ics } = this._buildVeventIcs({
      uid: null,
      title: payload.title,
      startDate: payload.startDate,
      endDate: payload.endDate,
      allDay: !!payload.allDay,
      location: payload.location || "",
      description: payload.description || ""
    });

    // Use the supported dav API
    await dav.createCalendarObject(cal, {
      xhr,
      filename: `${uid}.ics`,
      data: ics
    });

    return { ok: true, uid };
  },

  async updateEvent(payload) {
    const { xhr, cal } = await this.getAccount(payload.caldav);
    if (!payload.uid) throw new Error("UPDATE requires uid");

    const found = await this._findObjectByUid({ xhr, cal, uid: payload.uid });
    if (!found) throw new Error(`Event not found: uid=${payload.uid}`);

    const { ics } = this._buildVeventIcs({
      uid: found.uid,
      title: payload.title,
      startDate: payload.startDate,
      endDate: payload.endDate,
      allDay: !!payload.allDay,
      location: payload.location || "",
      description: payload.description || ""
    });

    // listCalendarObjects returns a CalendarObject shape, update uses its url/etag/calendarData
    const calendarObject = new dav.CalendarObject({
      url: found.url,
      etag: found.etag,
      calendarData: ics
    });

    await dav.updateCalendarObject(calendarObject, { xhr });

    return { ok: true, uid: found.uid };
  },

  async deleteEvent(payload) {
    const { xhr, cal } = await this.getAccount(payload.caldav);
    if (!payload.uid) throw new Error("DELETE requires uid");

    const found = await this._findObjectByUid({ xhr, cal, uid: payload.uid });
    if (!found) return { ok: true, uid: payload.uid, deleted: false, reason: "not_found" };

    const calendarObject = new dav.CalendarObject({
      url: found.url,
      etag: found.etag
    });

    await dav.deleteCalendarObject(calendarObject, { xhr });

    return { ok: true, uid: found.uid, deleted: true };
  }
});
