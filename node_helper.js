"use strict";

const NodeHelper = require("node_helper");
const dav = require("dav");

module.exports = NodeHelper.create({

  start() {
    console.log("MMM-iCloudCalendarEXT3eventadd started");
  },

  async socketNotificationReceived(notification, payload) {
    try {
      if (notification === "CE3_LOOKUP_EVENT") {
        const res = await this.lookupEvent(payload);
        this.sendSocketNotification("CE3_LOOKUP_EVENT_RESULT", res);
      }
    } catch (err) {
      console.error(err);
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
    const xhr = new dav.transport.Basic({ username, password });

    const account = await dav.createAccount({
      server: cfg.serverUrl,
      xhr,
      loadCollections: true,
      loadObjects: false
    });

    const cal = account.calendars.find(c => c.displayName === cfg.calendarDisplayName);
    if (!cal) throw new Error("Calendar not found");

    return { xhr, cal };
  },

  async lookupEvent(payload) {
    const { xhr, cal } = await this.getAccount(payload.caldav);

    const start = new Date(payload.date + "T00:00:00");
    const end = new Date(payload.date + "T23:59:59");

    const filters = [{
      type: "comp-filter",
      attrs: { name: "VCALENDAR" },
      children: [{
        type: "comp-filter",
        attrs: { name: "VEVENT" }
      }]
    }];

    const objects = await dav.listCalendarObjects(cal, { xhr, filters });

    const match = objects.find(o =>
      o.calendarData.includes(`SUMMARY:${payload.title}`)
    );

    if (!match) return { found: false };

    return {
      found: true,
      date: payload.date,
      event: {
        uid: match.calendarData.match(/UID:(.*)/)[1],
        href: match.url,
        etag: match.etag,
        title: payload.title
      }
    };
  }

});
