# Project Notes

## Vue 3 Migration Priority List

Views to migrate from Backbone to Vue 3 SFCs using `createVueBackboneView` pattern, ordered simple to complex:

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
- GroupEditView (GroupEdit.vue)

### Skipped (not migrated)
- XmppLoginPanel — extends AuthView with subclasses (AddAccountView, UnregisterAccountView), manual Vue mount causes infinite recursion due to AuthView.render/onRender chain doing heavy DOM manipulation on Vue-managed elements
