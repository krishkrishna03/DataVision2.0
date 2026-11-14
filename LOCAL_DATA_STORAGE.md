# Local data storage and retention

DataVision currently runs without an application backend. Uploaded data, dashboard definitions, templates, filters, and derived datasets are stored by the browser in **IndexedDB** through Zustand's persistence middleware and `idb-keyval`.

## How saving works

| Browser database key | What it stores |
|---|---|
| `ai-dashboard-data` | Dataset metadata and the rows retained for analysis, along with schema overrides and derived versions |
| `ai-dashboard-boards` | Dashboard titles, chart configurations, layouts, filter state, and analysis metadata |
| `ai-dashboard-templates` | Saved dashboard templates and their usage metadata |

The browser scopes IndexedDB to the website's origin (scheme, host, and port) and the browser profile. Returning to the same site in the same browser profile lets DataVision restore these stores after a page refresh or browser restart. Data is not synchronized to other devices, browsers, or user accounts, and it is not sent to a DataVision server.

Uploads are limited to 50 MB per file. DataVision keeps up to 5,000 sampled rows per uploaded dataset in the browser; it does not retain the entire contents of larger files. As a result, analysis, transformations, and exports operate on the rows retained locally and may be sample-based. Dataset metadata may record the original row count, but that does not mean every original row is available for later use.

## How many days are datasets and dashboards kept?

There is **no configured day-based expiry**. DataVision does not automatically delete datasets or dashboards after 7, 30, 90, or any other number of days. They remain in that browser's IndexedDB until the user deletes them in the app, clears the site's browser data, removes the browser profile, or the browser or device removes the stored data.

Therefore, the practical retention period is **indefinite, not guaranteed**. It is not possible to promise a fixed number of days for browser-only storage:

- Private/incognito browsing commonly removes site data when the private session closes.
- A user or administrator can clear site data at any time.
- Browsers may evict site data under storage pressure, based on browser policy, or when device storage is low.
- Browser profile resets, device loss, and some managed-device policies can remove the data.
- Data saved on one origin is separate from data saved on another origin. Changing the deployed domain does not move the old origin's IndexedDB data.

DataVision does not currently request persistent-storage status from the browser, make backups, or offer cross-device synchronization. For data that must be retained for a specific number of days or guaranteed against browser cleanup, a backend with authentication, backup, retention, and deletion policies is required.

## Deleting data

Delete a dataset, dashboard, or template from the relevant DataVision screen to remove it from the corresponding saved collection. To remove all local DataVision data, clear this site's stored data in the browser's site settings. Clearing site data cannot be undone and also removes any other data this site may have stored.

## Privacy and sharing

Browser-only persistence is local to the browser profile, but it is not an encrypted backup or an access-control system. Anyone who can use the same unlocked browser profile and website origin may be able to access the saved workspace. DataVision does not currently have user accounts, server-side authorization, secure share links, expiry/revocation controls, or external LLM-backed analytics.
