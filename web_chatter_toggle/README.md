# Web Chatter Toggle

Collapse / expand the chatter on any form view.

## What it does

- Adds a chatter button to the form view's top bar, right after the record
  pager (`1 / 1 < >`). It is right-justified and does not move.
- Click it: the chatter is hidden and the form sheet takes the full width.
  Click again: the chatter comes back.
- Only shown on forms that have a chatter.
- The state is saved in the browser's `localStorage`, keyed by model
  (`web_chatter_toggle:<model>`), so each model remembers its own preference
  and it survives page reloads. It is per-browser, not stored on the server.

## How it works

Pure frontend. `chatter_toggle.js` keeps a shared reactive `{model: hidden}`
store, patches `FormController` (button + click handler) and the `mail`
**Chatter** component (reads the flag). `chatter_toggle.xml` adds the button to
the `control-panel-navigation-additional` slot of `web.FormView` and a
`data-chatter-hidden` attribute to the Chatter root; `chatter_toggle.scss`
hides the chatter container via `:has()`.

## Version notes

Written for **Odoo 19**. The only version-sensitive line is the Chatter import
in `chatter_toggle.js`:

```js
import { Chatter } from "@mail/chatter/web_portal/chatter"; // Odoo 19 (CE and EE)
// import { Chatter } from "@mail/core/web/chatter";   // Odoo 17 / 18
```

Everything else (`mail.Chatter` template name, `o-mail-Chatter-topbar` /
`o-mail-Form-chatter` class names) has been stable since Odoo 16.
