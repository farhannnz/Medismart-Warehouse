# Medismart – online setup (Firebase + Vercel)

Both apps (shop **Medismart** and **Medismart Warehouse**) use one Firebase project: `medical-98864`.
Data is saved online in Firestore. The shop and the warehouse talk to each other online — no more JSON files.

## 1. Firebase (one time)

Already done: Firestore database created, Email/Password sign-in enabled.

**Still to do – security rules (important):**
Firestore is in *test mode* right now, which means anyone can read the data and it stops working after 30 days.

1. Firebase console → **Firestore Database → Rules**
2. Delete everything there and paste the contents of [`firestore.rules`](firestore.rules)
3. Click **Publish**

These rules allow only the two Medismart online accounts:
- `shop@medismart.app` – can open only shop data
- `warehouse@medismart.app` – can open only warehouse data
- both can use the shared `exchange` link (requests, dispatches, returns, medicine list)

Nothing to set in Firebase Storage, Hosting or Analytics.

## 2. Vercel

No settings, environment variables or build commands are needed (plain HTML/JS, no build step).
Just deploy the new files:
- **Warehouse** → push to GitHub `farhannnz/Medismart-Warehouse` (main) → Vercel deploys automatically.
- **Shop** → deploy the `Medismart` folder to the `pharmacy-ten-beta` Vercel project the same way it was deployed before.

## 3. First start (each app)

1. Open the site → **Connect this computer**.
   First time ever: type a new *online password* (6+ characters) → **Create online account**.
   On every other computer: type the same online password → **Connect**. (Asked only once per computer.)
2. One-time **Set up**: shop / warehouse name + admin password.
3. Sign in with `admin` + that password. Add staff in Settings → Staff & Rights.

Start the **warehouse first**: add medicines there (Items → New / Edit Item). The medicine list reaches the shop automatically.

## 4. How the two apps work together

| Shop | → | Warehouse |
|---|---|---|
| Stock Request (F3) → Send | instantly | appears in Shop Requests (F3) |
| Receive Stock (F4) | ← instantly | Scan strips → Dispatch |
| Return to Warehouse → Send | instantly | appears in Returns from Shops (F4) |
| request shows **Rejected** + reason | ← | Reject request |
| medicine list updates | ← | add / edit medicines |

Status bar shows **☁ Saved online**. If the internet drops it shows **⚠ Offline – saved on this computer, will upload**; work continues and uploads by itself when the internet is back.
Two or more computers can bill at the same time; their entries are combined automatically.

## 5. After client testing, before launch

To remove test entries: Settings → Data → **Delete all data & start fresh** (shop) / **Delete stock data & start fresh** (warehouse).
Staff logins, settings (and in the warehouse, the medicine list) are kept.

To remove the online accounts completely: Firebase console → Authentication → Users → delete, and Firestore → delete the `apps` and `exchange` collections.
