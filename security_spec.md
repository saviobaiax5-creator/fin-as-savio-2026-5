# Security Specification — FINANCE IA Firestore Rules

## 1. Data Invariants (Enforced in `firestore.rules`)
- **Strict Default Deny**: Global catch-all `match /{document=**} { allow read, write: if false; }` locks all unmatched paths.
- **User Isolation (`/users/{uid}/...`)**: Every collection is strictly nested under `users/{uid}` and enforces `request.auth != null && request.auth.uid == uid`.
- **Verified Email Requirement for Cloud Writes**: All create/update/delete operations require `request.auth.token.email_verified == true`. Unverified users keep full offline IndexedDB functionality with local sync queue until email verification completes.
- **No Unauthenticated Read/Write**: Zero public reads or writes (`if true` forbidden everywhere).
- **No Directory Listing of `/users`**: `allow list: if false;` on `/users/{uid}` prevents user enumeration or email discovery.
- **Valid Document IDs (`isValidId`)**: Single-document operations (`get`, `create`, `update`, `delete`) reject reserved/dot segments and overly long IDs.
- **Ownership & Field Immutability**:
  - Every entity document requires `ownerUid == uid` and `id == <docId>`.
  - `ownerUid`, `id` (or `uid` on `/users/{uid}`), and `createdAt` are immutable after creation.
- **Schema Whitelisting (`hasAll` & `hasOnly`) & Type/Size Caps**:
  - Every entity validates required keys, prohibits unknown fields, caps string lengths (`<= 300` for descriptions, `<= 850000` for serialized backup JSON), validates numeric bounds (`>= 0` where non-negative required, `<= 99999999999`), and caps list sizes (`<= 2000` records).
  - Never stores raw binary attachments/PDF base64 data URLs inside Firestore documents.

## 2. Adversarial Test Matrix ("Dirty Dozen" Payloads)
1. **Unauthenticated read/write** on `/users/u1/accounts/acc-1` -> **DENIED**.
2. **Cross-user read (`get`/`list`)** by `u2` on `/users/u1/transactions` -> **DENIED**.
3. **Cross-user create/update/delete** by `u2` on `/users/u1/transactions/tr-1` -> **DENIED**.
4. **Unverified email write** (`email_verified: false`) on `/users/u1/accounts/acc-1` -> **DENIED**.
5. **User directory enumeration** (`list /users`) -> **DENIED**.
6. **Privilege/Ownership hijacking** (`ownerUid: 'u2'` inside `/users/u1/accounts/acc-1`) -> **DENIED**.
7. **Immutable field tampering** (changing `ownerUid` or `createdAt` on `update`) -> **DENIED**.
8. **Extra unapproved keys injection** (`admin: true` or `role: 'ADMIN'` on `/users/{uid}` or financial docs) -> **DENIED**.
9. **Oversized payload / string abuse** (backup `payloadJson > 850000` chars or `description > 400` chars) -> **DENIED**.
10. **Invalid enum values** (`entityId: 'FAKE'`, `direction: 'STEAL'`, `status: 'HACKED'`) -> **DENIED**.
11. **Malformed document ID** (`..`, `.`, empty, > 128 chars) -> **DENIED**.
12. **Root collection probe** (reading or writing `/accounts`, `/transactions`, `/backups` outside `/users/{uid}`) -> **DENIED**.
