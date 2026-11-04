# UCS Business Collector (Chrome Extension)

## Load in Chrome
1. Open chrome://extensions
2. Enable Developer mode
3. Click "Load unpacked" and select this `extension` folder
4. Open extension Options and set CRM API Base URL + JWT token (accounts)

## Use
1. Open extension popup
2. Enter keyword + location
3. Click "Search Google Maps" (opens Google Maps search)
4. Extension auto-collects publicly visible results
5. Review/edit in popup, then "Save to CRM"

## Notes
- Only publicly visible data is collected.
- Google Maps layout changes may require selector updates.
- Data is stored via CRM `/api/accounts/business-finder/collect`.
