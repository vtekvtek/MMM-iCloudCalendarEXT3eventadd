\# MMM-iCloudCalendarEXT3eventadd



Add, edit, delete iCloud CalDAV events directly from MMM-CalendarExt3.



\## Install



cd ~/MagicMirror/modules

git clone https://github.com/YOURNAME/MMM-iCloudCalendarEXT3eventadd.git

cd MMM-iCloudCalendarEXT3eventadd

npm install



\## Environment Variables



ICLOUD\_USERNAME=your@email.com

ICLOUD\_PASSWORD=app-specific-password



If using pm2:

pm2 set MagicMirror:ICLOUD\_USERNAME "your@email.com"

pm2 set MagicMirror:ICLOUD\_PASSWORD "xxxx-xxxx-xxxx-xxxx"

pm2 restart MagicMirror



\## Config



{

&nbsp; module: "MMM-iCloudCalendarEXT3eventadd",

&nbsp; config: {

&nbsp;   caldav: {

&nbsp;     envPrefix: "ICLOUD\_",

&nbsp;     serverUrl: "https://caldav.icloud.com",

&nbsp;     calendarDisplayName: "Family",

&nbsp;     providerIcsUrl: "http://127.0.0.1:8888/CALDAV/ICLOUD\_Family.ics"

&nbsp;   }

&nbsp; }

}



