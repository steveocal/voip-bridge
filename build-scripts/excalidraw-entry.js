// Self-hosted bundle for the Jot sketchpad. Loading Excalidraw straight from
// an ESM CDN (esm.sh) fans out into 100+ separate module requests (duplicate
// transitive deps like two versions of jotai/radix-ui), each paying a full
// network round trip — 10-20s in practice, unusable. Bundling everything into
// one file here (built with `npm run build:excalidraw`, output checked into
// public/) turns that into a single cacheable request, same pattern already
// used for public/sip.min.js.
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as ExcalidrawLib from "@excalidraw/excalidraw";

window.ExcalidrawBundle = { React, ReactDOMClient, ExcalidrawLib };
