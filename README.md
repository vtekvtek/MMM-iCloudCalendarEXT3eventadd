\# MMM-iCloudCalendarEXT3eventadd



Add, edit, delete iCloud CalDAV events directly from MMM-CalendarExt3.

THIS IS A WORK IN PROGRESS!!! DO NOT USE THIS MODULE!!!


\## Install
```js
cd ~/MagicMirror/modules
git clone https://github.com/vtekvtek/MMM-iCloudCalendarEXT3eventadd.git
cd MMM-iCloudCalendarEXT3eventadd
npm install
```

\## Environment Variables
```js
ICLOUD\_USERNAME=your@email.com
ICLOUD\_PASSWORD=app-specific-password
```

\## Config
```js
{
module: "MMM-iCloudCalendarEXT3eventadd",
config: {
caldav: {
     envPrefix: "ICLOUD_",
     serverUrl: "https://caldav.icloud.com",
     calendarDisplayName: "Family",
     providerIcsUrl: "http://127.0.0.1:8888/CALDAV/ICLOUD_Family.ics"
   }
 }
}
```




