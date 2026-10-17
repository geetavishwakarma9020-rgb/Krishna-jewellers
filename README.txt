KRISHNA JEWELLERS - CUSTOMER & STOCK BOOK (v2)
==============================================
Files: index.html, style.css, app.js

Open index.html in a browser (Chrome). Default password: jewellery (change in Admin).

Flow
1. Stock tab -> + Add Product (name, quantity, low-stock alert level, optional weight/piece and rate/gram)
2. New Sale (+ button) -> customer name + phone, pick product(s), set pieces.
   Stock is reduced when the sale is saved. Live preview shows stock left after sale.
3. Paid / Balance: enter amount paid, balance is calculated. Later use Records -> customer -> Receive payment.
4. Receipt: Print / Save PDF, Download, or send on WhatsApp.
5. Warning bar appears at the top when any product is low or out of stock.
6. Admin: shop phone number (name and address are fixed), backup / restore, password, delete data.

Deleting a customer record puts its items back into stock.
Data is stored on the phone only. Take a backup regularly (Admin -> Download backup).
Backups from the first version of the app can also be restored.

APP ICON / APK
- manifest.json, sw.js and icons/ (Krishna Jewellers logo) are included.
- Upload ALL files and the icons folder to GitHub, turn on Pages, then use the link at pwabuilder.com to make the APK.
- After you change any app file, change CACHE name in sw.js (e.g. kj-v2-2) so phones pick up the update.
