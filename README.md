# TTD Fuel Tracking App (2026 Prototype)

An offline-first, low-cost Progressive Web App (PWA) tailored specifically for **Zebra TC26 Handheld PDAs** to track fuel usage and asset transfers on rental fleets (generators, tanks, plant).

Built to replace the MIT App Inventor + Google Sheets Apps Script stack, eliminating device lockups, sheet formula recalculation lag, and multi-device concurrency bottlenecks.

---

## Key Features & How It Matches Your Brief

1. **Zebra TC26 Native DataWedge & QR Code Support:**
   - Default screen auto-focuses the scanner input.
   - Listens for Zebra DataWedge hardware imager scans (`TTD-vvv-nnnn`) and processes them immediately on `Enter`.
   - Also includes a built-in camera QR scanner (`html5-qrcode`) and a Quick Demo Fleet picker.
2. **Asset Display & Specifications:**
   - Displays **what3words** (with clickable direct map link), **Type** (`GENERATOR`, `TANK`, `PLANT`), **Capacity / Size**, **Rental Serial Number**, **Area**, and **Location**.
   - For Generators: Displays **Power Up** and **Power Down** timestamps, with a one-tap Power status toggle.
3. **Transaction History:**
   - Lists previous fuel transfers, check-ins, and meter readings in chronological order for the scanned asset.
   - Shows sync state badges (`Synced` vs `Offline Queue`).
4. **Action Menu:**
   - Large, glove-friendly buttons for **Check In**, **Record Fuel Transfer**, **Check Out**, and **Edit Equipment Details**.
5. **Dynamic Validation & Button Behavior (Strict Brief Adherence):**
   - **Generator:** Captures Fuel Level (%), DEF / AdBlue (%), and Meter Reading (kWh).
   - **Tank:** Features a tactile **8-segment spinner gauge control** (0 to 8 eighths) with `[-]`, `[+]`, and quick-tap eighth chips.
   - **Plant:** Captures Fuel Level (%).
   - **Submit & Cancel Buttons:**
     - **Cancel is Red.**
     - **Submit starts greyed-out and disabled.**
     - **Submit turns bright green and clickable ONLY when all required fields pass validation.**
   - **Confirmation Modal:** Displays all entered values for verification before storing. Abort returns to the form; Confirm stores the transaction.
6. **Offline-First Resilience (IndexedDB Outbox Pattern):**
   - Every confirmed transaction is stored locally in milliseconds using **IndexedDB (Dexie.js)**.
   - The UI updates instantly. The app never locks up or blocks on weak network signals.
   - When online, the background sync worker drains the outbox queue to the cloud.
   - Includes a **Simulated Offline Mode toggle** in the top bar so you can test field queueing directly from your desk.
7. **PostgreSQL / Supabase Concurrency:**
   - Replaces Google Sheets row-lock contention (`LockService`) with ACID PostgreSQL transactions.
   - Full SQL schema included in the in-app Cloud Modal.

---

## Running the Prototype Locally

The development server is already active:
```bash
npm run dev -- --host
```

- **Local browser URL:** [http://localhost:5173/](http://localhost:5173/)
- **Network / Zebra PDA URL:** `http://<your-computer-ip>:5173/` (e.g. `http://192.168.86.245:5173/`)

---

## Testing on the Zebra TC26 Handheld

1. Connect the Zebra TC26 to the same Wi-Fi network as your development machine.
2. Open Chrome on the Zebra TC26 and navigate to the Network URL shown in the terminal (e.g., `http://192.168.86.245:5173/`).
3. In Chrome menu, tap **"Add to Home Screen"** or **"Install app"** to run full-screen without browser address bars.
4. **Zebra DataWedge Profile Configuration:**
   - Open the **DataWedge** app on the Zebra TC26.
   - Open Profile0 (default) or create a new profile named `TTD Fuel Tracking`.
   - Under **Keystroke Output**:
     - Ensure **Enabled** is checked.
     - Set **Basic data formatting** -> **Send ENTER key** to checked.
   - Point the Zebra laser/imager at an asset QR code (`TTD-MAT-0001`) and pull the trigger.

---

## Pre-loaded Demo Fleet

The prototype includes pre-seeded assets ready for immediate testing:
- **`TTD-MAT-0001`**: Generator (100 kVA) - Stage Alpha Power Compound (`///puzzle.stages.daring`)
- **`TTD-MAT-0002`**: Generator (250 kVA) - Main Arena (`///barks.flesh.gravel`)
- **`TTD-MAT-0003`**: Tank (3,000 L) - Bulk Fuel Farm Alpha (`///tracks.sparks.silver`)
- **`TTD-MAT-0004`**: Tank (5,000 L) - Logistics Hub Refuel Station (`///launch.bright.solid`)
- **`TTD-MAT-0005`**: Plant - South Gate Tower Light 04 (`///amber.tower.cliff`)
- **`TTD-MAT-0006`**: Plant - West Gate Telehandler 02 (`///cables.signal.entry`)

---

## Cloud Integration (Supabase)

Click the **Cloud icon** in the app header to view or copy the PostgreSQL schema:
- Creates `equipment_list` and `transactions` tables with check constraints (e.g. fuel eighths 0–8, percentages 0–100).
- Sets up row-level security and high-speed indexes.
- You can paste your Supabase Project URL and Public Anon Key into the modal anytime to switch from local simulated cloud to live PostgreSQL.
