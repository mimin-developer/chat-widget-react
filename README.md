# chatkit-widgets

Embeddable chat widgets for websites. The package currently ships `OmniWidget`, a launcher that embeds the omnichannel web chat from your chat platform app on any external website.

The launcher renders inside a shadow root with `omni-` prefixed CSS classes, so it neither inherits nor leaks host page styles. The full chat runs in an iframe at `/web-chat/embed/:username` on the platform app (`appUrl`). Widget colors, icon, and optional title come from the Website configuration saved in the platform app, not from the embed code. The launcher appears only after the embedded chat confirms it is ready.

## Embed with a script tag

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/chatkit-widgets@0.3.0/dist/omnichannel.js"
  data-omni-username="YOUR_USERNAME"
  data-omni-website-id="YOUR_WEBSITE_ID"
  data-omni-app-url="https://YOUR_PLATFORM_APP"
></script>
```

This external module tag initializes the widget without inline JavaScript. `data-omni-position` (`bottom-right`, `bottom-left`, `right`, or `left`) and `data-omni-text` (a message to pre-fill in the chat input; it is no longer pre-filled in the same browser tab once the visitor has sent it) are optional.

To serve the JavaScript from the platform app instead of the npm CDN, point `src` at `https://YOUR_PLATFORM_APP/omnichannel-widget/v0.3.0/omnichannel.js`.

## Install from npm

```sh
npm install chatkit-widgets
```

```js
import { OmniWidget } from 'chatkit-widgets'

const widget = OmniWidget.init({
  username: 'YOUR_USERNAME',
  websiteId: 'YOUR_WEBSITE_ID',
  appUrl: 'https://YOUR_PLATFORM_APP',
})
```

`init()` returns `{ open, close, destroy }`; the same methods also exist on `OmniWidget`. Calling `init()` again replaces the previous instance. Optional settings are `position`, `zIndex` (default `2147483000`), and `text`. Appearance comes from the saved Website configuration.

## Hosting requirements

The widget loads its stylesheet from the platform app origin, so that app must serve `/omnichannel-widget/v<version>/omnichannel.css` for every released version, even when the JavaScript comes from npm or a CDN. If the embedding site uses HTTPS, `appUrl` must also use HTTPS; browsers block HTTP widget resources as mixed content.

A Content Security Policy on the embedding site needs the script host in `script-src` and the platform app origin in `style-src`, `connect-src`, and `frame-src`. A custom widget icon hosted elsewhere also needs its origin in `img-src`. The widget needs no `unsafe-inline` exception.

## Satisfaction survey (CSAT)

When a visitor opens a CSAT link (`/csat/:username/:answerId` on the platform app) from the chat, the survey opens inside the widget panel with a **Back to chat** button instead of a new browser tab. The button is always shown because the widget cannot tell whether the survey was already answered. The chat stays loaded underneath, so the draft and scroll position are kept, and an "open in new tab" icon is available as a fallback.

This needs the platform app to allow `/csat/:username/:answerId` to be framed by other sites (no `X-Frame-Options: SAMEORIGIN`, and `frame-ancestors` open to the embedding domain), the same way `/web-chat/embed/*` is. The widget only accepts survey URLs on the platform app origin.

## Storage

The script stores a random visitor ID in the embedding site's own `localStorage`, scoped by platform host, username, and Website ID. Each domain therefore has a separate conversation identity. The iframe does not require third-party cookies. Greeting completion and language preference are persisted on the embedding domain through verified `postMessage` events from the iframe.

## Develop

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

The Vite playground is at `http://localhost:5173`. Run the platform app separately and set the playground's App URL to its origin.

## Build and host

```sh
npm run build
npm run build:hosted -- ../path/to/app/public/omnichannel-widget
```

`build` creates `dist/omnichannel.js`, `dist/omnichannel.css`, and the TypeScript declarations. `build:hosted` also copies the JavaScript and CSS to `<dir>/v<version>/`. The directory can also be set with `CHATWIDGET_HOST_PUBLIC_DIR`.

## Release

Keep the JavaScript and CSS versions aligned: a version works only once the platform app serves its hosted files. `prepack` builds the JavaScript, CSS, and TypeScript declarations before npm creates the tarball.
