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
      if (notification === "CE3_LOOKUP_EVENT") {
        // Backward compatible, but prefer UID-based lookups now
        const res = await this.lookupEvent(payload);
        this.sendSocketNotification("CE3_LOOKUP_EVENT_RESULT", res);
        return;
      }

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
      const msg = (err && err.message) ? err.message : String(err);
      this.sendSocketNotification("EVENT_OP_FAILED", { notification, error: msg });
    }
  },

  getCreds(prefix) {
    // You used `${prefix}USERNAME`, `${prefix}PASSWORD`
    // With envPrefix "ICLOUD_" this becomes "ICLOUD_USERNAME" etc
    return {
      username: process.env[`${prefix}USERNAME`] || process.env[`${prefix}USERNAME`.replace(/__+/g, "_")] || process.env[`${prefix}USERNAME`],
      password: process.env[`${prefix}PASSWORD`] || process.env[`${prefix}PASSWORD`.replace(/__+/g, "_")] || process.env[`${prefix}PASSWORD`]
    };
  },

  async getAccount(cfg) {
    const { username, password } = this.getCreds(cfg.envPrefix);
    if (!username || !password) {
      throw new Error(`Missing credentials for envPrefix=${cfg.envPrefix}. Expected env vars like ${cfg.envPrefix}USERNAME and ${cfg.envPrefix}PASSWORD`);
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

  // ---------- helpers ----------
  _icsEscape(text) {
    if (text === null || text === undefined) return "";
    // Minimal escape for ICS text
    return String(text)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  },

  _formatDateUTC(dt) {
    // dt is Date
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`;
  },

  _extractLineValue(ics, key) {
    // Match KEY:value up to end of line, tolerate folded lines later if needed
    const re = new RegExp(`^${key}:(.*)$`, "m");
    const m = ics.match(re);
    return m ? m[1].trim() : null;
  },

  async _findObjectByUid({ xhr, cal, uid }) {
    if (!uid) throw new Error("Missing uid");

    const filters = [{
      type: "comp-filter",
      attrs: { name: "VCALENDAR" },
      children: [{
        type: "comp-filter",
        attrs: { name: "VEVENT" }
      }]
    }];

    const objects = await dav.listCalendarObjects(cal, { xhr, filters });

    // Find UID:... line exact-ish, avoid substring collisions
    const needle = `UID:${uid}`;
    const match = objects.find(o => (o.calendarData || "").includes(needle));

    if (!match) return null;

    const foundUid = this._extractLineValue(match.calendarData, "UID");
    return {
      uid: foundUid || uid,
      href: match.url,
      etag: match.etag,
      calendarData: match.calendarData
    };
  },

  _buildVeventIcs({ uid, title, startDate, endDate, allDay, location, description }) {
    const now = new Date();
    const dtstamp = this._formatDateUTC(now);
    const dtStart = new Date(Number(startDate));
    const dtEnd = new Date(Number(endDate));

    const safeUid = uid || crypto.randomUUID();

    // For all-day, use DATE values and DTEND as the day after (exclusive)
    let dtstartLine = "";
    let dtendLine = "";

    if (allDay) {
      const s = new Date(Date.UTC(dtStart.getFullYear(), dtStart.getMonth(), dtStart.getDate(), 0, 0, 0));
      const e = new Date(Date.UTC(dtEnd.getFullYear(), dtEnd.getMonth(), dtEnd.getDate(), 0, 0, 0));
      // Ensure end is exclusive next day for all-day, many clients expect that
      const endExclusive = new Date(e.getTime() + 24 * 60 * 60 * 1000);

      const ymd = (d) => {
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
      };

      dtstartLine = `DTSTART;VALUE=DATE:${ymd(s)}`;
      dtendLine = `DTEND;VALUE=DATE:${ymd(endExclusive)}`;
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
      `SUMMARY:${this._icsEscape(title)}`,
    ];

    if (location) lines.push(`LOCATION:${this._icsEscape(location)}`);
    if (description) lines.push(`DESCRIPTION:${this._icsEscape(description)}`);

    lines.push("END:VEVENT", "END:VCALENDAR");

    return { uid: safeUid, ics: lines.join("\r\n") + "\r\n" };
  },

  // ---------- existing lookup, but improve it ----------
  async lookupEvent(payload) {
    const { xhr, cal } = await this.getAccount(payload.caldav);

    // Preferred: UID lookup
    if (payload.uid) {
      const obj = await this._findObjectByUid({ xhr, cal, uid: payload.uid });
      if (!obj) return { found: false };
      return { found: true, event: { uid: obj.uid, href: obj.href, etag: obj.etag } };
    }

    // Backward compatible fallback: title match (fragile)
    const filters = [{
      type: "comp-filter",
      attrs: { name: "VCALENDAR" },
      children: [{ type: "comp-filter", attrs: { name: "VEVENT" } }]
    }];

    const objects = await dav.listCalendarObjects(cal, { xhr, filters });
    const match = objects.find(o => (o.calendarData || "").includes(`SUMMARY:${payload.title}`));
    if (!match) return { found: false };

    const uid = this._extractLineValue(match.calendarData, "UID");

    return {
      found: true,
      event: {
        uid,
        href: match.url,
        etag: match.etag,
        title: payload.title
      }
    };
  },

  // ---------- add ----------
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

    // Create new object URL
    // Many CalDAV servers accept PUT to a new .ics resource under the calendar collection URL.
    // dav library usually exposes `dav.createCalendarObject` in some versions, but not all.
    // We'll do a raw PUT via xhr if available.
    const collectionUrl = cal.url || cal.href || cal.homeUrl || cal._url;
    if (!collectionUrl) throw new Error("Calendar collection URL not found on cal object");

    const newHref = `${collectionUrl.replace(/\/?$/, "/")}${uid}.ics`;

    await xhr.send(new dav.Request({
      method: "PUT",
      url: newHref,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8"
      },
      data: ics
    }));

    return { ok: true, uid, href: newHref };
  },

  // ---------- update ----------
  async updateEvent(payload) {
    const { xhr, cal } = await this.getAccount(payload.caldav);
    const uid = payload.uid;
    if (!uid) throw new Error("UPDATE_CALENDAR_EVENT requires uid");

    const obj = await this._findObjectByUid({ xhr, cal, uid });
    if (!obj) throw new Error(`Event not found for uid=${uid}`);

    const { ics } = this._buildVeventIcs({
      uid,
      title: payload.title,
      startDate: payload.startDate,
      endDate: payload.endDate,
      allDay: !!payload.allDay,
      location: payload.location || "",
      description: payload.description || ""
    });

    await xhr.send(new dav.Request({
      method: "PUT",
      url: obj.href,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        // conflict safety
        "If-Match": obj.etag
      },
      data: ics
    }));

    return { ok: true, uid, href: obj.href };
  },

  // ---------- delete ----------
  async deleteEvent(payload) {
    const { xhr, cal } = await this.getAccount(payload.caldav);
    const uid = payload.uid;
    if (!uid) throw new Error("DELETE_CALENDAR_EVENT requires uid");

    const obj = await this._findObjectByUid({ xhr, cal, uid });
    if (!obj) return { ok: true, uid, deleted: false, reason: "not_found" };

    await xhr.send(new dav.Request({
      method: "DELETE",
      url: obj.href,
      headers: {
        "If-Match": obj.etag
      }
    }));

    return { ok: true, uid, deleted: true };
  }
});
