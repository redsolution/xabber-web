# Xabber Web — Project Context for Claude

## What This Project Is

Xabber Web is an XMPP chat client. It was originally built with Backbone.js + jQuery + Handlebars templates. We are migrating it to Vue 3 with a modern data layer.

The XMPP connection layer uses **Strophe.js** (WebSocket) and will continue to do so.

## Current State (as of February 2026)

### Branch: `vue3-migration-v2`

**Build system:** Vite 7 + `@vitejs/plugin-vue`. Entry point is `index.html` → `src/xabber.js`.

**What's been done — Phase 1 (Template Migration):**
- ~30 Backbone views migrated to Vue 3 SFCs using the `createVueBackboneView` bridge pattern in `src/vue/mountVue.js`
- This pattern wraps a Vue 3 component inside a Backbone view, so the existing Backbone parent/child view hierarchy still works
- Business logic still lives in Backbone JS files (in the `extend` block passed to `createVueBackboneView`)
- Vue components are in `src/vue/components/` organized by feature area
- Shared composable: `src/vue/composables/useXabber.js` provides access to the global `xabber` object

**Migrated views:**
- ChatsView, ChatHeadView, NotificationsView, CallsView, RosterFullScreenView, RosterLeftView
- ContactDetailsViewRight, GroupChatDetailsViewRight, MentionsView, ForwardPanelView
- SavedChatHeadView, ChatContentView, ContactEditView, JingleMessageView
- ChatBottomView, ToolbarView, AddGroupChatView, GroupEditView
- AddContactView, ChangeStatusView, SubscriptionButtonsView, GroupSettingsView, RosterSettingsView
- DeleteWithOptions, GroupchatInvitation, DeleteFilesFromGallery, DurationPicker
- ChatContentPlaceholder, ExpandedMessagePanel, ChatPlaceholder, ChatLocation
- IncomingTrustSession, PlyrPlayerPopup, ActiveSessionModal, Fingerprints
- FingerprintsOwnDevices, About, MentionItem, MentionsPlaceholder
- AccountToolbarItem, SetBackground, DataTimePicker
- EmojiPickerView, NotificationsChatContentView

**Skipped (not migrated via template swap):**
- XmppLoginPanel — extends AuthView with subclasses, manual Vue mount causes infinite recursion
- ~37 remaining views that need full rewrites (no template, re-render patterns, or too tightly coupled to Backbone)

**Unwired Vue components (created but not imported):**
- `EmojiProfileImage.vue`, `SetAvatar.vue`, `WebcamProfileImage.vue` (complete)
- `ExportChatHistory.vue`, `SendMedia.vue` (complete)
- `EditContactsGroupsModal.vue` (stub/placeholder)

**Key bugs fixed:**
- Mutual recursion between `views.js:updateAccounts` and `SettingsModal.vue:updateAccounts` (broke the cycle)
- `markRaw()` on all Backbone objects passed to Vue (prevents Vue from deep-proxying circular references)
- Vue `unmount()` removed from `remove()` — Backbone's DOM removal conflicts with Vue's fragment walker
- Window-level error handler in `index.html` suppresses residual Vue DEV-mode `nextSibling` errors
- Vite error overlay disabled in `vite.config.js`
- **Settings panel empty on first login** (`views.js`, `accounts.js`): When a user logs in for the first time (no stored session), both `add` and `list_changed` events fire on the accounts collection, creating competing `setTimeout` callbacks in `SettingsModalView.updateAccounts()`. The old `AccountSettingsSingleModalView` Vue app was only nulled (not unmounted), so its pending reactive updates ran after the new app mounted and overwrote the freshly-rendered content. Fixed by: (1) calling `_vueApp.unmount()` before nulling it; (2) using `clearTimeout` + stored timer ID so only the last callback creates a view; (3) removing the unnecessary `detach()`/`append()` no-op from `AccountSettingsSingleModalView.onShow()`.
- **Encrypted chats visible when OMEMO disabled** (`chats.js`): `ChatItemView.updateEncrypted()` now applies the `hidden` CSS class to encrypted chat items when `omemo_enabled` is falsy. The existing `ChatsView.updateAccountEncryptedChats()` already handles the reverse (showing them when OMEMO is enabled).

### Key Files

| File | Purpose |
|------|---------|
| `src/vue/mountVue.js` | `createVueBackboneView()` — the bridge between Backbone views and Vue 3 SFCs |
| `src/vue/composables/useXabber.js` | Vue composable that provides the global `xabber` object via `inject()` |
| `src/views.js` | Core Backbone views: `BasicView`, `NodeView`, `SettingsModalView`, etc. |
| `src/accounts.js` | Account model, connection logic, login UI |
| `src/contacts.js` | Roster/contacts, group chats, contact details |
| `src/chats.js` | Chat views, message handling, chat content |
| `src/ui.js` | Screen management (`setScreen`), body view, panels |
| `src/core.js` | The global `xabber` object definition |
| `vite.config.js` | Build config with all module aliases |

### The `createVueBackboneView` Pattern

```javascript
xabber.SomeView = createVueBackboneView(xabber, {
    component: SomeComponent,          // Vue SFC
    className: 'some-view',            // CSS class on wrapper el
    props: (view, opts) => ({ ... }),   // Props passed to Vue component
    setup: (app, view) => { ... },     // Optional: register plugins, provide
    extend: {
        // Backbone methods that operate on the Vue instance
        _vueInit: function(opts) {     // Called after Vue mounts (replaces _initialize)
            this._vueInstance.setBackboneView(this);
            // ... setup listeners, ps_container, etc.
        },
        // ... other Backbone view methods
    }
});
```

**Important caveats for the bridge pattern:**
- `mountVue.js` applies `markRaw()` to the Backbone view, all props, the jQuery `$el`, and the `xabber` object
- It sets `app.config.errorHandler` to suppress Vue DEV errors
- The `remove()` function does NOT call Vue's `unmount()` — it nulls refs and lets Backbone handle DOM cleanup. However, when you need to *reuse* a mount container (e.g. `SettingsModalView.updateAccounts` recreating `AccountSettingsSingleModalView` on the same element), call `_vueApp.unmount()` explicitly *before* clearing `el.innerHTML` — this cancels pending reactive updates that would otherwise overwrite the new app's content.
- Store Backbone objects (models, views, jQuery) with `shallowRef()`, never `ref()` — `ref()` deep-proxies them causing infinite recursion
- The `xabber` global object is provided to Vue via `inject(XABBER_KEY)` — always accessed through `useXabber()` composable

## Grand Plan — Phase 2 (Data Layer + Full Vue Migration)

### The Problem

Xabber Web stores ALL data (messages, conversations, contacts) in Backbone model attributes **in memory**. Nothing persists to local storage. This makes it extremely slow — everything is re-fetched from the server on each page load and occupies memory indefinitely.

### Architecture Decision

Replace Backbone models/collections with **Pinia stores** + **IndexedDB** (via Dexie.js) for persistent local storage. Combine this with completing the Vue migration (moving business logic out of Backbone).

**Target architecture:**
```
XMPP (Strophe.js) → Pinia Stores → IndexedDB (Dexie.js) → Vue Components
```

### Data Model Reference

The data model is based on the Android version (`github.com:redsolution/xabber-android-ng.git`, cloned to `/tmp/xabber-android-ng`), which itself is a port of the more complete iOS version. The Android version uses Realm DB with these core entities:

| Entity | Description | Android Class |
|--------|-------------|---------------|
| Account | XMPP account (JID, host, port, status, color) | `AccountStorageItem` |
| Chat | Conversation (owner, opponent, last message, unread, muted, pinned, archived) | `LastChatsStorageItem` |
| Message | Chat message (body, date, state, outgoing, references, forwards) | `MessageStorageItem` |
| MessageReference | Attachment (file, media, voice, geo) | `MessageReferenceStorageItem` |
| MessageForward | Inline forwarded message (recursive tree structure) | `MessageForwardsInlineStorageItem` |
| Contact | Roster entry (JID, nickname, subscription, blocked) | `RosterStorageItem` |
| ContactGroup | Roster group with ordered contacts | `RosterGroupStorageItem` |
| Resource | Presence/device (client type, status, priority) | `ResourceStorageItem` |
| Avatar | Avatar image (hash, file URI, multiple sizes) | `AvatarStorageItem` |

**Key enums from Android:** `ConversationType` (Regular, Group, Channel, Omemo1, Omemo2), `MessageSendingState` (Sending, Sent, Deliver, Read, Error, None, NotSent, Uploading), `MessageDisplayType` (Text, Files, Images, Voice, Call, System, Sticker, Quote, Initial), `ResourceStatus` (Offline, Xa, Away, Dnd, Online, Chat), `ComposingType` (none, typing, voice, video, uploadFile, etc.)

**Extensions needed beyond Android model:** vCard fields, GroupChat members/roles/permissions, OMEMO key storage and sessions, MAM archive query state, server discovery features.

**Note:** The Android model is early-stage/prototype with some incomplete areas (empty DAOs, no vCard entity, minimal OMEMO). Use it as a skeleton, not a complete blueprint.

### Migration Strategy

1. **Write Playwright tests** against current working version for core flows (login, chat list, send/receive messages, contacts, settings)
2. **Implement one entity at a time:** Messages first (biggest performance win), then Chats, Contacts, Accounts
3. **For each entity:**
   - Create TypeScript interfaces
   - Create Dexie table schema
   - Create Pinia store with actions that read/write Dexie
   - Wire XMPP handlers to write to store instead of Backbone models
   - Wire Vue components to read from store instead of Backbone models
   - Remove Backbone model code for that entity
4. **Temporary functionality loss is acceptable** during this transition
5. Strophe.js XMPP layer stays as-is

### Tech Stack (Target)

| Layer | Technology |
|-------|-----------|
| XMPP transport | Strophe.js (existing, keep) |
| State management | Pinia |
| Persistent storage | Dexie.js (IndexedDB wrapper) |
| UI framework | Vue 3 Composition API (SFCs) |
| Type safety | TypeScript (gradual adoption) |
| Testing | Playwright (E2E) |
| Build | Vite |

## Development Notes

- **Dev server:** `npx vite --host` (runs on port 5173)
- **Build:** `npm run build` (output to `dist/`)
- **Connection:** Default WebSocket URL is `wss://xmpp.redsolution.com/wsserver` (configured in `index.html`)
- **Vue DEV mode** has aggressive error rethrowing. The `window.addEventListener('error', ...)` in `index.html` suppresses known harmless errors from Backbone/Vue DOM conflicts.
- When creating new Vue components, always use `<script setup>` with Composition API
- The `dist/` directory is gitignored
- Android reference project: `github.com:redsolution/xabber-android-ng.git`
- **E2E tests** live in a sibling repo at `../xabber-tests/xabber-web` (run `npx playwright test` there). The dev server must be running first (`npx vite --host`). 13 tests across 5 Playwright projects (serial-a through serial-d + parallel). All 13 pass; `journey-sessions` occasionally needs its 1 retry due to parallel account-registration load on the test server.
