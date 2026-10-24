# Graceville Church Website

## Features added
- Event-photo gallery on ALAB, Beacons, Fireflies, Men’s Ministry, and Women of Grace pages.
- Admin upload form at `admin.html`; uploaded images are displayed publicly on the selected ministry page.
- Public order form and store catalog. Orders, event metadata, and products are stored in `server/data.json`; uploaded images are stored in `uploads/`.
- Admin password protection for photo uploads and order-status changes.

## Run locally
1. Install Node.js 18 or newer.
2. In the project folder run `npm install`.
3. Set an admin password in the environment before starting: `ADMIN_PASSWORD="use-a-long-unique-password" npm start` (PowerShell: `$env:ADMIN_PASSWORD="use-a-long-unique-password"; npm start`).
4. Open `http://localhost:3000`. Admin panel: `http://localhost:3000/admin.html`.

## Publishing online
Deploy this as a **Node.js web service** (not a static-only site), using `npm install` for build/install and `npm start` for start. Set `ADMIN_PASSWORD` in the hosting dashboard. Because this starter stores data in local JSON files and uploads in a local folder, choose a host with a persistent disk mounted for the project, or migrate storage to a managed database and object storage before launch. Some free hosting services erase local files on restart/redeploy, so do not use ephemeral storage for real orders. Configure HTTPS, backups, privacy notice, and a real database/storage service before handling customer data at scale.

## Important before public launch
- Change placeholder contact information.
- Confirm product prices, pickup/delivery process, and order fulfilment with church leadership.
- Set a strong admin password. This is a small starter site; add role-based accounts/rate limits and managed persistent storage before broad public use.
- Keep customer order data private and limit admin access.
