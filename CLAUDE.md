# Project Notes

## Vue 3 Migration Priority List

Views to migrate from Backbone to Vue 3 SFCs using `createVueBackboneView` pattern, ordered simple to complex:

### COMPLEX
9. **GroupEditView** — contacts.js, 199-line template, 10 SVGs, 33 getString
10. **XmppLoginPanel** — accounts.js, 361-line template, 3 SVGs, 51 getString

### Already Migrated
- ChatsView (ChatsPanel.vue)
- ChatHeadView (ChatHead.vue)
- NotificationsView (NotificationsPanel.vue)
- CallsView
- RosterFullScreenView
- RosterLeftView
- ContactDetailsViewRight
- GroupChatDetailsViewRight
- MentionsView (MentionsPanel.vue)
- ForwardPanelView (ForwardPanel.vue)
- SavedChatHeadView (SavedChatHead.vue)
- ChatContentView (ChatContent.vue)
- ContactEditView (ContactEdit.vue)
- JingleMessageView (JingleMessage.vue)
- ChatBottomView (ChatBottom.vue)
- ToolbarView (Toolbar.vue)
- AddGroupChatView (AddGroupChat.vue)
