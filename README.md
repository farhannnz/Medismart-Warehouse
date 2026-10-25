# Medismart Warehouse

Warehouse software for the Medismart shop software: items with shelves, stock in as lots, a **barcode label for every strip**, shop requests packed by **scanning strips**, dispatch files, returns from shops, expiry alerts, reports, staff logins and attendance.

**Demo login:** `admin` / `admin` • `keeper` / `keeper`. Open `index.html` (no install). Full guide: [Medismart-Warehouse-User-Guide.pdf](Medismart-Warehouse-User-Guide.pdf). Data is stored in the browser (backup from File → Backup && Restore).

## Flow
1. **Items → New / Edit Item**: create the medicine, with its **shelf** (required).
2. **Stock → Add Stock**: search the medicine, enter batch, expiry, number of strips, **purchase price**, **selling price to the shop**, MRP. Save → every strip gets its own code `L<lot>-<n>` and a barcode label (Code 128); print and stick them. The screen shows the shelf to keep them on.
3. **Shops → Shop Requests**: import a shop's request file, take the goods to the table, **scan each strip**. Wrong / duplicate / already-sent strips are refused; an earlier-expiry lot triggers a hint. Dispatch → a dispatch file (with every strip's serial) is saved for the shop.
4. **Shops → Returns from Shops**: import a shop's return file (reasons per row), check, accept → strips go back to stock or to write-off.
5. **Reports**, **Alerts** (expired, near-expiry, low stock, pending requests/returns), **Strip Lookup** (scan any strip: where is it, which shop, which batch).

## Strip barcode
Code 128 barcode that holds just the strip code, e.g. `L12-045`, printed with the item name, expiry, batch and MRP. The purchase price is never printed. The dispatch file carries the details of every strip code, so the shop software knows what each code is.

## Files exchanged with the shop software
See the Medismart shop repo's USAGE.md for the JSON formats: request (in), dispatch (out), return (in), item list (out).

## Notes
- Uses a USB barcode scanner in keyboard mode (it "types" the code and presses Enter).
- Stock is tracked per strip inside each lot (`lot.gone` map); very large volumes need the live-server version.
- Barcodes are generated offline with the MIT-licensed `JsBarcode` library (`js/lib/jsbarcode.js`).
