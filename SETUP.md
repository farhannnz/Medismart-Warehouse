# Medismart – online setup (Firebase + Vercel)

Both apps (shop **Medismart** and **Medismart Warehouse**) use one Firebase project: `medical-98864`.
It is **one business**: one warehouse and many shops, all owned by the same person. Stock goes from the
warehouse to a shop at the warehouse's purchase cost (a stock transfer: no GST, nothing payable).

## 1. Firebase security rules (do this first)

1. Firebase console → **Firestore Database → Rules**
2. Delete everything there and paste the contents of [`firestore.rules`](firestore.rules)
3. Click **Publish**

What the rules allow:
- every person signs in with **their own username + password** (stored in Firebase Authentication)
- **warehouse admin**: everything – makes shops, shop admins and warehouse staff, sees every shop's P&L
- **warehouse staff**: only warehouse data, with the rights ticked for them
- **shop admin**: only their own shop – makes and switches off staff of that shop
- **shop staff**: only their own shop, with the rights ticked for them

The rules still let the two old shared accounts (`shop@medismart.app`, `warehouse@medismart.app`) in, so
nothing stops while you switch. Delete those two accounts after step 3 (see step 4).

## 2. Deploy the apps

No settings or build commands (plain HTML/JS). Push both repos to GitHub `main`; Vercel deploys each one by itself:
- **Shop** → `farhannnz/Medismart` → pharmacy-ten-beta.vercel.app
- **Warehouse** → `farhannnz/Medismart-Warehouse`

## 3. First start (once)

1. Open the **warehouse** app → *First time? Set up the warehouse admin* → warehouse name, your name,
   username (e.g. `admin`) and password. This is the main admin login. It can only be made once.
2. Warehouse → **Shops → Shops & Logins → New shop**:
   - For the shop that was already running, tick **"This is the shop that was already running"** –
     it keeps all its bills, stock, accounts and shift history.
   - Give the shop admin a username + password.
3. Repeat **New shop** for every other shop (each new shop starts empty and gets the medicine list automatically).
4. Each shop admin opens the shop app, signs in, and adds staff: **Settings → Users & rights → Add staff login**.

Usernames: small letters / numbers, no spaces (e.g. `ravi`, `ravi.k`). Passwords: 6+ characters.
Forgot a password: the person can't be reset by an admin on the free Firebase plan, so the admin switches that
login off and makes a new one. Anyone can change their own password: **File → Change My Password**.

## 4. After the switch

Firebase console → **Authentication → Users** → delete `shop@medismart.app` and `warehouse@medismart.app`.
(Optionally remove the two `legacy…` lines and the `legacy` rules from `firestore.rules` and publish again.)

## 5. How it works

| Shop | → | Warehouse |
|---|---|---|
| Stock Request (F3) → Send | instantly | appears in Shop Requests (F3) for that shop |
| Receive Stock (F4) – at warehouse cost | ← instantly | Scan strips → Dispatch |
| Return to Warehouse → Send | instantly | appears in Returns from Shops (F4) |
| request shows **Rejected** + reason | ← | Reject request |
| medicine list updates | ← | add / edit medicines |
| sales, cost, profit per day | → automatically | **Profit & Loss (all shops)** (F8): each shop + total |

- **Shift handover (shop):** at shift start the person sees who worked last, when they closed and how much
  cash they left in the drawer; they count the drawer and type the amount. Any shortage / excess is saved.
  At shift end (or log out) they count again; opening, cash sales, refunds, cash in/out, expected, counted and
  difference are saved. **Cash → Cash Register & Shifts** lists every shift.
- **Accounts (shop):** stock from the warehouse is booked to **Head Office (Warehouse)** (a capital account),
  not to a supplier. The shop's own P&L is in Accounts → Profit & loss.
- Status bar shows **☁ Saved online**. Offline: **⚠ Offline – saved on this computer, will upload**.

## 6. Removing test entries

Settings → Data → **Delete all data & start fresh** (shop) / **Delete stock data & start fresh** (warehouse).
