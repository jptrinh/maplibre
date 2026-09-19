# MapLibre Map (WeWeb component)

A [WeWeb](https://www.weweb.io/) custom element that renders a
[MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) map styled with free,
keyless [OpenFreeMap](https://openfreemap.org/) tiles, and displays a bindable array of
points as colored pin markers with clickable popups..

## Features

- **OpenFreeMap styles** — `liberty`, `bright`, `positron`, `dark`, or a custom MapLibre style
  URL. No API key required.
- **Bindable points array** — configure points in the editor or bind an external array
  (API/database) and map fields (latitude, longitude, label, description, color) with the
  Formula editors.
- **Markers** — pick a "Marker type":
  - **Pin** — built-in colored marker (per-point `color` or the default marker color).
  - **Image** — a custom image: global "Default marker image" and/or per-point "Image URL"
    (a point's image overrides the default); control width/height, anchor, and an "Image scale"
    that grows the image on hover/selected.
  - **Text pill** — a rounded badge showing the point's label, with style props for the text
    (color, size, weight) and the pill (background, padding, radius, shadow), plus separate
    colors/scale for hover and selected states — a point's `color` overrides the base
    background but not the hover/selected colors.
  - **Icon** / **Icon and Text pill** — a leading and/or trailing system icon (each toggleable),
    with size, color, hover color, selected color, and gap controls; can be shown alone or
    combined with the text pill. The **Icon** type also has an "Icon scale" that grows the icon
    circle on hover/selected.
- **Hover & selected states** — hovering or selecting a marker raises it above the others,
  and every marker type supports growing on hover/selected via a scale prop (pill scale, image
  scale, icon scale), each with a "scale origin" that controls the point the marker grows from
  (defaults to "Match anchor"); text pills / icons also support distinct colors for hover vs.
  selected, independent of the base/point color.
- **Dropzone popup** — clicking a pin opens a popup whose content you build with your own WeWeb
  elements (dropped into the popup dropzone). MapLibre keeps it anchored to the point on
  zoom / drag / rotate, flips above/below automatically when there isn't room, and its content
  is selectable/text-cursor aware. Bind the popup content to the `selectedPoint` variable.
  Clicking the map closes it. Toggle with "Open popup on marker click".
- **Drop pin** — turn on "Let users drop a pin" and clicking the map places a single draft
  pin there, exposed as the `droppedPin` variable (`{ latitude, longitude }`). Clicking again
  moves it, and the pin is draggable by default so the user can fine-tune the position.
  Clicking an existing marker never drops a pin. Style it with its own color, or replace it
  with an image (width/height controls).
- **Optional controls** — navigation, geolocate, scroll-to-zoom, attribution (all toggleable).
- **Internal variables** — `mapCenter`, `mapZoom`, `isMapLoaded`, `isMoving`, `isGrabbing`, `selectedPoint`,
  `droppedPin`.
- **Trigger events** — `map:load`, `map:click`, `map:move`, `marker:click`,
  `marker:mouseenter`, `marker:mouseleave`, `popup:open`, `popup:close`, `pin:drop`,
  `pin:move`, `pin:clear`. `map:load` and
  `map:move` both carry `center`, `zoom`, and `bounds` (`north`/`south`/`east`/`west` of
  the visible area) — use the bounds to fetch only what's on screen, from the initial
  load onwards. `map:move` only fires when the visible area changed since the previous
  `map:move` (a resize that leaves it identical does not re-fire it). Set "Move debounce (ms)" to
  wait until panning/zooming settles before it fires, so you don't hammer your API.
- **Component actions** — `Fly to` (animate the map to a lat/lng/zoom), `Reset north`
  (swing the map back to north-up; optionally reset tilt too), `Select point`,
  `Hover point`, `Unhover point`, `Close popup`, `Drop pin` (place the pin at given
  coordinates), `Clear pin` — trigger these from your own WeWeb workflows.

## Usage notes

- **Give the element a height.** The map fills its container fluidly; set an explicit height on
  the element (or its parent) or the map will collapse.
- **Attribution.** Keep "Show attribution" on to comply with OpenFreeMap / MapLibre terms.
- **Binding points.** When the `points` array is bound to external data, use the per-field
  Formula inputs to map each field to your data's structure.
- **Designing the popup.** Drop WeWeb elements into the popup dropzone, then bind their content
  to the `selectedPoint` component variable (the clicked point's raw data). In the editor the
  popup auto-opens on the first point so you can lay it out; in production it opens on click.
- **Custom marker image.** To replace the default pin, set "Default marker image" to an image
  URL (applies to all points), or give individual points an "Image URL" (overrides the default
  for that point). When bound to external data, map the image with the "Image field" formula.
  Adjust "Marker width/height" and "Image marker anchor" as needed.

- **Dropping a pin.** `droppedPin` holds `{ latitude, longitude }` or `null`. Bind it to a
  form field, or use the `pin:drop` / `pin:move` triggers to save the coordinates. `map:click`
  still fires on the same click, so existing map-click workflows keep working. Use the
  `Drop pin` action to pre-place the pin (e.g. from a geocoded address) and `Clear pin` to
  reset it.

## Installation

Install dependencies with `npm i` (installs `maplibre-gl` and `@weweb/cli`).

## Start

To serve locally, run `npm run serve --port=[PORT]`, then open the WeWeb editor, open the
developer popup, and add your custom element.

## Build

Before release, check for build errors by running `npm run build --name=maplibre-map`.
