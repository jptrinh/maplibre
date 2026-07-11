<template>
  <div class="maplibre-map">
    <div ref="mapContainer" class="maplibre-map__container"></div>
    <!--
      Popup host: MapLibre relocates this node into a Marker so it stays
      anchored to the selected point on zoom / drag / rotate. v-show toggles
      visibility without detaching it from Vue's control.
    -->
    <!--
      Stop clicks (and the mousedown/dblclick that MapLibre also watches) from
      bubbling to the map's canvas container, where map.on("click") lives and
      would call closePopup(). Without this, clicking inside the popup closes it.
    -->
    <div
      ref="popupAnchorEl"
      v-show="isPopupVisible"
      class="maplibre-map__popup"
      @click.stop
      @mousedown="onPopupMouseDown"
      @dblclick.stop
    >
      <wwLayout
        path="popupContent"
        direction="column"
        class="maplibre-map__popup-layout"
      />
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default {
  props: {
    uid: { type: String, required: true },
    content: { type: Object, required: true },
    /* wwEditor:start */
    wwEditorState: { type: Object, required: true },
    /* wwEditor:end */
  },
  emits: ["trigger-event"],
  setup(props, { emit }) {
    // True only in the WeWeb editor. Safe in production: wwEditorState is
    // undefined there, so this is false (no reliance on wwEditor stripping).
    const isEditing = computed(() => !!props.wwEditorState?.isEditing);

    const mapContainer = ref(null); // Vue-rendered wrapper, lives in the front document
    let glContainer = null; // actual MapLibre container, see initMap()
    const popupAnchorEl = ref(null);
    let map = null;
    let markersById = new Map(); // point.id -> { marker, point }
    let popupMarker = null;
    let resizeObserver = null;
    let navControl = null;
    let geoControl = null;
    let attributionControl = null;
    const isPopupVisible = ref(false);
    const selectedPointId = ref(null);
    // Point currently under the pointer, lifted above its neighbours the same
    // way the selected one is (see applyMarkerZIndex).
    const hoveredPointId = ref(null);
    const resolvedIconSvg = ref("");
    const resolvedIconSvgTrailing = ref("");
    const iconApi = wwLib?.useIcons?.();
    const getIcon =
      typeof iconApi?.getIcon === "function" ? iconApi.getIcon : null;
    const formulaApi = wwLib?.wwFormula?.useFormula?.();
    const resolveMappingFormula =
      typeof formulaApi?.resolveMappingFormula === "function"
        ? formulaApi.resolveMappingFormula
        : null;

    // ----- Internal variables -----
    const { value: mapCenter, setValue: setMapCenter } =
      wwLib.wwVariable.useComponentVariable({
        uid: props.uid,
        name: "mapCenter",
        type: "object",
        defaultValue: { lng: 0, lat: 0 },
      });
    const { value: mapZoom, setValue: setMapZoom } =
      wwLib.wwVariable.useComponentVariable({
        uid: props.uid,
        name: "mapZoom",
        type: "number",
        defaultValue: 0,
      });
    const { value: isMapLoaded, setValue: setIsMapLoaded } =
      wwLib.wwVariable.useComponentVariable({
        uid: props.uid,
        name: "isMapLoaded",
        type: "boolean",
        defaultValue: false,
      });
    const { value: selectedPoint, setValue: setSelectedPoint } =
      wwLib.wwVariable.useComponentVariable({
        uid: props.uid,
        name: "selectedPoint",
        type: "object",
        defaultValue: null,
      });

    // ----- Reactive derived state -----
    const styleUrl = computed(() => {
      const custom = props.content?.customStyleUrl;
      if (custom && typeof custom === "string" && custom.trim().length > 0) {
        return custom.trim();
      }
      const style = props.content?.mapStyle ?? "liberty";
      return `https://tiles.openfreemap.org/styles/${style}`;
    });

    const center = computed(() => [
      Number(props.content?.initialLongitude ?? 0),
      Number(props.content?.initialLatitude ?? 0),
    ]);

    const zoom = computed(() => Number(props.content?.initialZoom ?? 0));

    const processedPoints = computed(() => {
      const items = Array.isArray(props.content?.points)
        ? props.content.points
        : [];
      return items
        .map((item, index) => {
          // Resolve a point field: mapping formula → raw item field → default.
          const field = (formula, key, dflt) =>
            resolveMappingFormula?.(formula, item) ?? item?.[key] ?? dflt;
          const c = props.content;

          // Prefer the mapped ID field, then the row's own id/uid, then the
          // array index. Whatever this resolves to is what the selectPoint /
          // hoverPoint actions match against (via findPointById).
          const rawId =
            field(c?.pointsIdFormula, "id") ?? item?.uid ?? index;

          return {
            id: `point-${rawId}`,
            latitude: Number(field(c?.pointsLatitudeFormula, "latitude")),
            longitude: Number(field(c?.pointsLongitudeFormula, "longitude")),
            label: field(c?.pointsLabelFormula, "label", ""),
            description: field(c?.pointsDescriptionFormula, "description", ""),
            color: field(c?.pointsColorFormula, "color", ""),
            image: field(c?.pointsImageFormula, "image", ""),
            icon: field(c?.pointsIconFormula, "icon", ""),
            iconTrailing: field(c?.pointsIconTrailingFormula, "iconTrailing", ""),
            displayIcon:
              field(c?.pointsDisplayIconFormula, "displayIcon", true) !== false,
            displayIconTrailing:
              field(c?.pointsDisplayIconTrailingFormula, "displayIconTrailing", true) !==
              false,
            iconColor: field(c?.pointsIconColorFormula, "iconColor", ""),
            iconColorSelected: field(
              c?.pointsIconColorSelectedFormula,
              "iconColorSelected",
              ""
            ),
            originalItem: item,
          };
        })
        .filter(
          (p) =>
            Number.isFinite(p.latitude) &&
            Number.isFinite(p.longitude) &&
            p.latitude >= -90 &&
            p.latitude <= 90 &&
            p.longitude >= -180 &&
            p.longitude <= 180
        );
    });

    // Coordinates of the currently selected point (or null if none / removed).
    const selectedCoords = computed(() => {
      const p = processedPoints.value.find(
        (pt) => pt.id === selectedPointId.value
      );
      return p ? [p.longitude, p.latitude] : null;
    });

    // How far to lift the popup so it clears the marker when opening above the
    // point. Measured from the selected marker's actual rendered height (its
    // element is anchored at the tip), so custom marker types — icon, pill,
    // image — clear by their true height instead of the default pin's. Falls
    // back to the default pin height (~41px) before a marker is measured.
    const DEFAULT_MARKER_LIFT = 41;
    const markerLift = ref(DEFAULT_MARKER_LIFT);

    // Measure the currently selected marker's element height (the distance from
    // its tip up to its top, since markers are anchored at the bottom/tip).
    const measureMarkerLift = () => {
      const entry = markersById.get(selectedPointId.value);
      const h = entry?.marker?.getElement?.()?.offsetHeight;
      markerLift.value = Number.isFinite(h) && h > 0 ? h : DEFAULT_MARKER_LIFT;
    };

    // "top" = popup opens above the point (the default); "bottom" = below it.
    // updatePopupPlacement() flips this when there isn't room above.
    const popupPlacement = ref("top");
    // Measured popup height, needed to offset a downward-opening popup so its
    // top edge (not its bottom) sits just under the marker tip.
    const popupHeight = ref(0);

    const popupGapPx = () => {
      const gap = Number(props.content?.popupGap ?? 8);
      return Number.isFinite(gap) ? gap : 8;
    };

    // The marker keeps anchor "bottom"; we only change the offset. Above the
    // point we push the box up past the marker; below it we push the whole box
    // down so its top edge clears the point by `gap`.
    const popupOffset = computed(() => {
      const gap = popupGapPx();
      if (popupPlacement.value === "bottom") {
        return [0, gap + popupHeight.value];
      }
      return [0, -(markerLift.value + gap)];
    });

    // Decide whether the popup should open above (default) or below the point,
    // based on the room available on each side of it within the map viewport.
    const updatePopupPlacement = () => {
      if (!(props.content?.autoFlipPopup ?? true)) {
        popupPlacement.value = "top";
        measureMarkerLift();
        return;
      }
      if (!map || !popupAnchorEl.value) return;
      const coords = selectedCoords.value;
      if (!coords) return;
      const h = popupAnchorEl.value.offsetHeight || 0;
      popupHeight.value = h;
      measureMarkerLift();
      const gap = popupGapPx();
      const pt = map.project(coords);
      const containerH = map.getContainer()?.clientHeight ?? 0;
      const spaceAbove = pt.y - markerLift.value - gap;
      const spaceBelow = containerH - pt.y - gap;
      // Keep the default (above) unless the popup can't fit there but does have
      // more room below — avoids flip-flopping when both sides are tight.
      popupPlacement.value =
        spaceAbove < h && spaceBelow > spaceAbove ? "bottom" : "top";
    };

    // Shape exposed to trigger events / selectedPoint: the Formula-resolved
    // fields (what the user configured via the mapping formulas) plus the
    // untouched original row for anything not covered by the mapping.
    const pointPayload = (point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      label: point.label,
      description: point.description,
      color: point.color,
      image: point.image,
      icon: point.icon,
      iconTrailing: point.iconTrailing,
      displayIcon: point.displayIcon,
      displayIconTrailing: point.displayIconTrailing,
      iconColor: point.iconColor,
      iconColorSelected: point.iconColorSelected,
      originalItem: point.originalItem,
    });

    // ----- Popup management (Path A: popup rendered as an anchored Marker) -----
    const ensurePopupMarker = () => {
      if (!map || !popupAnchorEl.value) return null;
      if (!popupMarker) {
        popupMarker = new maplibregl.Marker({
          element: popupAnchorEl.value,
          anchor: "bottom",
          offset: popupOffset.value,
        });
        popupMarker.setLngLat(selectedCoords.value || center.value);
        popupMarker.addTo(map);
      }
      return popupMarker;
    };

    const openPopup = (point) => {
      selectedPointId.value = point.id;
      setSelectedPoint(pointPayload(point));
      if (!(props.content?.showPopups ?? true)) return;
      const marker = ensurePopupMarker();
      if (!marker) return;
      if (selectedCoords.value) marker.setLngLat(selectedCoords.value);
      isPopupVisible.value = true;
      // Placement depends on the rendered popup height, so measure after Vue
      // has made it visible in the DOM.
      nextTick(updatePopupPlacement);
      emit("trigger-event", {
        name: "popup:open",
        event: { point: pointPayload(point) },
      });
    };

    // When the popup node is used as a MapLibre Marker element, MapLibre
    // attaches its own `mousedown` listener to it that calls
    // `preventDefault()` — which aborts the browser's text-selection gesture,
    // making popup content unselectable. This template listener is attached at
    // mount, before the popup Marker is lazily created on first open, so it
    // runs first in bubble order; `stopImmediatePropagation` then prevents
    // MapLibre's same-element handler from firing. We deliberately do NOT call
    // `preventDefault` ourselves, so text selection works. It also stops the
    // event reaching the map canvas (which would start a drag / close popup).
    const onPopupMouseDown = (e) => {
      e.stopImmediatePropagation();
    };

    const closePopup = () => {
      if (!isPopupVisible.value) return;
      isPopupVisible.value = false;
      selectedPointId.value = null;
      emit("trigger-event", { name: "popup:close", event: {} });
    };

    // Component action (see `actions` in ww-config.js). Moves the map to the
    // given coordinates, optionally changing zoom and animating the transition.
    // Missing/invalid zoom keeps the current zoom; lng/lat are required.
    const flyTo = (latitude, longitude, zoom, animate = true) => {
      if (!map) return;
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const target = { center: [lng, lat] };
      const z = Number(zoom);
      if (Number.isFinite(z)) target.zoom = z;
      if (animate) map.flyTo(target);
      else map.jumpTo(target);
    };

    // Resolve a user-supplied id to a processed point. `p.id` is the canonical
    // `point-${rawId}` built from the mapped ID field (see processedPoints), so
    // callers can pass either that raw id value or the composed marker id. Used
    // by the selectPoint / hoverPoint component actions.
    const findPointById = (id) => {
      if (id === null || id === undefined || id === "") return null;
      const key = String(id);
      return (
        processedPoints.value.find(
          (p) => p.id === key || p.id === `point-${key}`
        ) ?? null
      );
    };

    // Component action (see `actions` in ww-config.js). Selects the point whose
    // id matches the given value, highlighting its marker and opening its popup
    // exactly as a user click would. No-op if nothing matches.
    const selectPoint = (id) => {
      const point = findPointById(id);
      if (point) openPopup(point);
    };

    // Dispatch a synthetic mouse event to a marker so it reacts exactly like a
    // real pointer hover. Hover is wired across two elements — the outer marker
    // element (z-index lift + hover trigger events) and, for pills, the inner
    // styled element (colour / scale swap) — and mouseenter/mouseleave don't
    // bubble, so we dispatch to both. An icon marker's svg child carries no
    // listener, so nothing double-fires.
    const dispatchMarkerHover = (pointId, type) => {
      const el = markersById.get(pointId)?.marker.getElement();
      if (!el) return;
      const win = el.ownerDocument?.defaultView || window;
      for (const target of [el, el.firstElementChild]) {
        target?.dispatchEvent(new win.MouseEvent(type, { bubbles: false }));
      }
    };

    // Component actions (see `actions` in ww-config.js). Drive a marker's hover
    // state from outside the map — e.g. hovering a card in a list beside the
    // map. hoverPoint enters the hover (leaving any other hovered marker first
    // so only one is hovered at a time); unhoverPoint leaves it. Called with no
    // id (or a non-matching one), unhoverPoint clears whatever is hovered.
    const hoverPoint = (id) => {
      const point = findPointById(id);
      if (!point) return;
      if (hoveredPointId.value && hoveredPointId.value !== point.id) {
        dispatchMarkerHover(hoveredPointId.value, "mouseleave");
      }
      dispatchMarkerHover(point.id, "mouseenter");
    };

    const unhoverPoint = (id) => {
      const pointId = findPointById(id)?.id ?? hoveredPointId.value;
      if (pointId) dispatchMarkerHover(pointId, "mouseleave");
    };

    // Editor only: force the popup open on the first point so it can be
    // designed. Pans to the point so the popup is actually in view. No-op in
    // the published app (isEditing is false there).
    const applyEditorPopup = () => {
      if (!map || !isEditing.value) return;
      if (
        props.content?.forcePopupInEditor &&
        (props.content?.showPopups ?? true)
      ) {
        const first = processedPoints.value[0];
        if (!first) return;
        // Only act (and re-center) when this point isn't already shown, so we
        // don't snap the map back while the user is panning around.
        const alreadyShown =
          isPopupVisible.value && selectedPointId.value === first.id;
        if (alreadyShown) return;
        map.jumpTo({ center: [first.longitude, first.latitude] });
        openPopup(first);
      } else {
        closePopup();
      }
    };

    const clearMarkers = () => {
      markersById.forEach(({ marker }) => marker.remove());
      markersById.clear();
    };

    // Per-point fields that affect marker appearance/position. Used to skip
    // rebuilding a marker whose point hasn't actually changed.
    const pointsEqual = (a, b) =>
      a.latitude === b.latitude &&
      a.longitude === b.longitude &&
      a.label === b.label &&
      a.description === b.description &&
      a.color === b.color &&
      a.image === b.image &&
      a.icon === b.icon &&
      a.iconTrailing === b.iconTrailing &&
      a.displayIcon === b.displayIcon &&
      a.displayIconTrailing === b.displayIconTrailing &&
      a.iconColor === b.iconColor &&
      a.iconColorSelected === b.iconColorSelected;

    // Resolve a WeWeb Image value to a usable src. Picker values are relative
    // paths (e.g. "designs/.../foo.png") that must be prefixed with the CDN;
    // bound URLs / uploads / data URIs are already absolute and pass through.
    const resolveImageUrl = (value) => {
      if (!value || typeof value !== "string") return "";
      const v = value.trim();
      if (!v) return "";
      if (
        /^(https?:)?\/\//i.test(v) ||
        v.startsWith("data:") ||
        v.startsWith("blob:")
      ) {
        return v;
      }
      const util =
        wwLib?.wwUtils?.resolveImageUrl || wwLib?.wwUtils?.getCdnUrl;
      if (typeof util === "function") return util(v);
      return `https://cdn.weweb.io/${v.replace(/^\/+/, "")}`;
    };

    // Resolve a WeWeb SystemIcon value to its SVG markup, mirroring it into the
    // given ref.
    const watchSystemIcon = (getValue, target) =>
      watch(
        getValue,
        async (iconValue) => {
          if (!iconValue || !getIcon) {
            target.value = "";
            return;
          }
          try {
            const svg = await getIcon(iconValue);
            target.value = svg || "";
          } catch {
            target.value = "";
          }
        },
        { immediate: true }
      );
    watchSystemIcon(() => props.content?.markerIcon, resolvedIconSvg);
    watchSystemIcon(() => props.content?.markerIconTrailing, resolvedIconSvgTrailing);

    // Parse a resolved icon SVG string into a reusable <svg> template element
    // that can be cloned per marker (rather than re-parsing via innerHTML for
    // every point).
    const parseIconTemplate = (svgMarkup) => {
      if (!svgMarkup) return null;
      const doc = wwLib.getFrontDocument();
      const wrapper = doc.createElement("div");
      wrapper.innerHTML = svgMarkup;
      return wrapper.querySelector("svg");
    };

    // Templates for the style-panel leading/trailing icons (used as the
    // fallback for points that don't define their own icon).
    let iconSvgTemplate = null;
    let iconSvgTemplateTrailing = null;
    watch(
      resolvedIconSvg,
      (svgMarkup) => {
        iconSvgTemplate = parseIconTemplate(svgMarkup);
      },
      { immediate: true }
    );
    watch(
      resolvedIconSvgTrailing,
      (svgMarkup) => {
        iconSvgTemplateTrailing = parseIconTemplate(svgMarkup);
      },
      { immediate: true }
    );

    // Per-point icon templates, keyed by SystemIcon value. Icons resolve
    // asynchronously, so we cache each distinct value and rebuild the markers
    // once new ones arrive.
    const pointIconTemplates = new Map();
    const resolvePointIcons = async () => {
      if (!getIcon) return;
      const values = new Set();
      processedPoints.value.forEach((p) => {
        if (p.icon) values.add(p.icon);
        if (p.iconTrailing) values.add(p.iconTrailing);
      });
      const pending = [...values].filter((v) => !pointIconTemplates.has(v));
      if (!pending.length) return;
      // Resolve the distinct new icons in parallel rather than one at a time.
      await Promise.all(
        pending.map(async (value) => {
          try {
            const svg = await getIcon(value);
            pointIconTemplates.set(value, parseIconTemplate(svg || ""));
          } catch {
            pointIconTemplates.set(value, null);
          }
        })
      );
      renderMarkers(true);
    };

    // Clone an icon for a point. Each icon has its own "Display icon" toggle;
    // when off that icon is hidden. Otherwise use the point's own icon if
    // defined (and resolved), falling back to the corresponding style-panel icon.
    const cloneIconForPoint = (point, position = "leading") => {
      const enabled =
        position === "trailing" ? point.displayIconTrailing : point.displayIcon;
      if (enabled === false) return null;
      const pointValue = position === "trailing" ? point.iconTrailing : point.icon;
      if (pointValue && pointIconTemplates.has(pointValue)) {
        const tpl = pointIconTemplates.get(pointValue);
        return tpl ? tpl.cloneNode(true) : null;
      }
      const fallback =
        position === "trailing" ? iconSvgTemplateTrailing : iconSvgTemplate;
      return fallback ? fallback.cloneNode(true) : null;
    };

    // Resting icon color for a point. When the point is selected, use its own
    // selected color, then the global selected color; otherwise use its own
    // icon color, then the global icon color.
    const iconColorForPoint = (point) => {
      const base =
        point.iconColor || props.content?.markerIconColor || "#FFFFFF";
      if (point.id === selectedPointId.value) {
        return (
          point.iconColorSelected ||
          props.content?.markerIconColorSelected ||
          base
        );
      }
      return base;
    };

    // Build an <img> element to use as a custom marker, or null to fall back
    // to the built-in colored pin.
    const buildImageElement = (imageUrl) => {
      const src = resolveImageUrl(imageUrl);
      if (!src) return null;
      const doc = wwLib.getFrontDocument();
      const el = doc.createElement("img");
      el.src = src;
      el.alt = "";
      el.draggable = false;
      el.style.width = `${Number(props.content?.markerWidth ?? 32)}px`;
      el.style.height = `${Number(props.content?.markerHeight ?? 40)}px`;
      el.style.objectFit = "contain";
      el.style.display = "block";
      return el;
    };

    // Apply the shared pill styling (background/text/padding/radius/shadow)
    // used by both the text-pill and icon-text-pill marker types.
    const applyPillStyle = (el, point) => {
      const isSelected = point.id === selectedPointId.value;
      const baseBg = point.color || props.content?.pillBgColor || "#111827";
      const baseText = props.content?.pillTextColor || "#FFFFFF";
      const effectiveBg = (isSelected && props.content?.pillBgColorSelected) || baseBg;
      const effectiveText = (isSelected && props.content?.pillTextColorSelected) || baseText;

      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.boxSizing = "border-box";
      el.style.whiteSpace = "nowrap";
      el.style.lineHeight = "1";
      el.style.color = effectiveText;
      el.style.fontSize = `${Number(props.content?.pillTextSize ?? 14)}px`;
      el.style.fontWeight = props.content?.pillTextWeight || "600";
      el.style.background = effectiveBg;
      el.style.padding = props.content?.pillPadding || "6px 12px";
      el.style.borderRadius = props.content?.pillRadius || "999px";
      el.style.boxShadow =
        props.content?.pillShadow ?? "0 1px 4px rgba(0, 0, 0, 0.25)";

      // Resting scale: a selected pill sits enlarged; everything animates via
      // the transition below. Pills are bottom-anchored, so scaling from the
      // bottom keeps the tip glued to the point. The transform lives on this
      // inner pill element (not the MapLibre marker wrapper, whose transform
      // MapLibre overwrites on every move) — see buildPillElement.
      const scale = Number(props.content?.pillScale ?? 1);
      const restingScale = isSelected && scale > 1 ? scale : 1;
      el.style.transformOrigin = "center bottom";
      el.style.transition =
        "background-color 0.15s ease, color 0.15s ease, transform 0.15s ease";
      el.style.transform = `scale(${restingScale})`;

      return { baseBg: effectiveBg, baseText: effectiveText };
    };

    // Wire the shared hover behavior (background/text/icon color swap) for
    // pill-style markers. Selected state takes priority — hover is a no-op on
    // a selected pill so the selected colors are never overridden.
    const wirePillHover = (el, baseBg, baseText, iconHover = {}, point = null) => {
      const hoverBg = props.content?.pillBgColorHover;
      const hoverText = props.content?.pillTextColorHover;
      const { iconColor, iconColorHover } = iconHover;
      const iconSvgEls = (iconHover.iconSvgEls || []).filter(Boolean);
      const scale = Number(props.content?.pillScale ?? 1);
      const hasScale = Number.isFinite(scale) && scale > 1;

      if (!hoverBg && !hoverText && !iconColorHover && !hasScale) return;

      // Selected colors take priority: hover must not override them.
      const selectedColorsActive = () =>
        point !== null &&
        (props.content?.pillBgColorSelected || props.content?.pillTextColorSelected) &&
        point.id === selectedPointId.value;

      // Whether this point is the selected one (used for the resting scale a
      // selected pill keeps once the pointer leaves it).
      const isSelected = () => point !== null && point.id === selectedPointId.value;

      // The transition (incl. transform) is set once in applyPillStyle, so the
      // background/color/scale changes here all animate smoothly.
      el.addEventListener("mouseenter", () => {
        if (hasScale) el.style.transform = `scale(${scale})`;
        if (selectedColorsActive()) return;
        if (hoverBg) el.style.background = hoverBg;
        if (hoverText) el.style.color = hoverText;
        if (iconColorHover)
          iconSvgEls.forEach((icon) => (icon.style.color = iconColorHover));
      });
      el.addEventListener("mouseleave", () => {
        // A selected pill stays enlarged; otherwise it settles back to 1.
        if (hasScale)
          el.style.transform = isSelected() ? `scale(${scale})` : "scale(1)";
        el.style.background = baseBg;
        el.style.color = baseText;
        iconSvgEls.forEach((icon) => (icon.style.color = iconColor));
      });
    };

    // Build a rounded "pill" element showing the point's label.
    const buildPillElement = (point) => {
      const doc = wwLib.getFrontDocument();
      // The outer wrapper is the MapLibre marker element — MapLibre owns its
      // transform to position it. The inner pill carries the visual styling and
      // the hover/selected scale, so our scale transform is never overwritten
      // by MapLibre's positioning translate on the wrapper.
      const wrapper = doc.createElement("div");
      const el = doc.createElement("div");
      wrapper.appendChild(el);
      const { baseBg, baseText } = applyPillStyle(el, point);

      el.textContent = point.label ?? "";
      wirePillHover(el, baseBg, baseText, {}, point);
      return wrapper;
    };

    // Prepare an SVG element for currentColor-based coloring. Forces `fill:
    // currentColor` (rather than just stripping the attribute, which doesn't
    // guarantee the element inherits `color`) on the root <svg> so any
    // descendant without its own paint follows `color`, and rewrites every
    // explicit `fill`/`stroke` that isn't "none"/"transparent". Handling both
    // paints matters because outline icon families (Phosphor regular, Lucide,
    // …) draw with `stroke` and `fill="none"`, not a solid fill.
    const prepareIconSvg = (svgEl, size, color) => {
      svgEl.style.width = `${size}px`;
      svgEl.style.height = `${size}px`;
      svgEl.style.display = "block";
      svgEl.style.color = color;
      svgEl.style.transition = "color 0.15s ease";
      svgEl.style.fill = "currentColor";
      [svgEl, ...svgEl.querySelectorAll("*")].forEach((el) => {
        ["fill", "stroke"].forEach((prop) => {
          const val = el.getAttribute(prop);
          if (val && val !== "none" && val !== "transparent") {
            el.style[prop] = "currentColor";
          }
        });
      });
      return svgEl;
    };

    // Build a colored circle with an icon inside.
    const buildIconElement = (point) => {
      const doc = wwLib.getFrontDocument();
      const size = Number(props.content?.markerIconSize ?? 20);
      const bgColor = point.color || props.content?.defaultMarkerColor || "#F23636";
      const iconColor = iconColorForPoint(point);
      const iconColorHover = props.content?.markerIconColorHover;

      const el = doc.createElement("div");
      el.style.width = `${size + 16}px`;
      el.style.height = `${size + 16}px`;
      el.style.borderRadius = "50%";
      el.style.background = bgColor;
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.25)";

      let iconSvgEl = cloneIconForPoint(point);
      if (iconSvgEl) {
        prepareIconSvg(iconSvgEl, size, iconColor);
        el.appendChild(iconSvgEl);
      }

      if (iconColorHover && iconSvgEl) {
        el.addEventListener("mouseenter", () => {
          iconSvgEl.style.color = iconColorHover;
        });
        el.addEventListener("mouseleave", () => {
          iconSvgEl.style.color = iconColor;
        });
      }

      return el;
    };

    // Build a pill element with an icon prepended to the label text.
    const buildIconPillElement = (point) => {
      const doc = wwLib.getFrontDocument();
      // See buildPillElement: outer wrapper is positioned by MapLibre, inner
      // pill carries the styling + scale transform.
      const wrapper = doc.createElement("div");
      const el = doc.createElement("div");
      wrapper.appendChild(el);
      const { baseBg, baseText } = applyPillStyle(el, point);
      const iconSize = Number(props.content?.markerIconSize ?? 20);
      const iconColor = iconColorForPoint(point);
      const iconColorHover = props.content?.markerIconColorHover;
      const iconGap = Number(props.content?.markerIconGap ?? 6);
      el.style.gap = `${iconGap}px`;

      let leadingIconEl = cloneIconForPoint(point, "leading");
      if (leadingIconEl) {
        leadingIconEl.style.flexShrink = "0";
        prepareIconSvg(leadingIconEl, iconSize, iconColor);
        el.appendChild(leadingIconEl);
      }

      const textSpan = doc.createElement("span");
      textSpan.textContent = point.label ?? "";
      el.appendChild(textSpan);

      let trailingIconEl = cloneIconForPoint(point, "trailing");
      if (trailingIconEl) {
        trailingIconEl.style.flexShrink = "0";
        prepareIconSvg(trailingIconEl, iconSize, iconColor);
        el.appendChild(trailingIconEl);
      }

      wirePillHover(el, baseBg, baseText, {
        iconSvgEls: [leadingIconEl, trailingIconEl],
        iconColor,
        iconColorHover,
      }, point);
      return wrapper;
    };

    // `forceRebuild` is used when a global appearance setting changes (marker
    // type, colors, icon, pill style, etc.) — every marker must be rebuilt
    // regardless of whether the underlying point data changed. Without it,
    // ordinary per-point data updates only touch the markers whose fields
    // actually changed, instead of tearing down and rebuilding every marker.
    const renderMarkers = (forceRebuild = false) => {
      if (!map) return;

      const markerType = props.content?.markerType ?? "pin";
      const defaultColor = props.content?.defaultMarkerColor || "#F23636";
      const defaultImage = props.content?.defaultMarkerImage || "";
      const anchor = props.content?.markerImageAnchor || "bottom";

      const seenIds = new Set();

      processedPoints.value.forEach((point) => {
        seenIds.add(point.id);
        const existing = markersById.get(point.id);

        if (!forceRebuild && existing && pointsEqual(existing.point, point)) {
          existing.point = point;
          return;
        }

        if (existing) existing.marker.remove();

        let element = null;
        if (markerType === "image") {
          element = buildImageElement(point.image || defaultImage);
        } else if (markerType === "text-pill") {
          element = buildPillElement(point);
        } else if (markerType === "icon") {
          element = buildIconElement(point);
        } else if (markerType === "icon-text-pill") {
          element = buildIconPillElement(point);
        }

        const marker = new maplibregl.Marker(
          element
            ? { element, anchor }
            : { color: point.color || defaultColor }
        ).setLngLat([point.longitude, point.latitude]);

        marker.addTo(map);
        wireMarkerEvents(marker.getElement(), point);
        markersById.set(point.id, { marker, point });
      });

      markersById.forEach(({ marker }, id) => {
        if (!seenIds.has(id)) {
          marker.remove();
          markersById.delete(id);
        }
      });

      applyMarkerZIndex();
    };

    // Lift the selected (and currently hovered) marker above all others so it's
    // never obscured by neighbouring pills. MapLibre stacks markers by DOM
    // order, so an explicit z-index is needed to bring one to the front. Hover
    // sits above selection so hovering any marker brings it fully into view.
    const zIndexForMarker = (id) => {
      if (id === hoveredPointId.value) return "2";
      if (id === selectedPointId.value) return "1";
      return "";
    };
    const applyMarkerZIndex = () => {
      markersById.forEach(({ marker }, id) => {
        const el = marker.getElement();
        if (!el) return;
        el.style.zIndex = zIndexForMarker(id);
      });
    };

    // Wire click / hover events on a marker element for a given point.
    const wireMarkerEvents = (el, point) => {
      el.style.cursor = "pointer";
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        emit("trigger-event", {
          name: "marker:click",
          event: { point: pointPayload(point) },
        });
        openPopup(point);
      });
      el.addEventListener("mouseenter", () => {
        hoveredPointId.value = point.id;
        applyMarkerZIndex();
        emit("trigger-event", {
          name: "marker:mouseenter",
          event: { point: pointPayload(point) },
        });
      });
      el.addEventListener("mouseleave", () => {
        if (hoveredPointId.value === point.id) {
          hoveredPointId.value = null;
          applyMarkerZIndex();
        }
        emit("trigger-event", {
          name: "marker:mouseleave",
          event: { point: pointPayload(point) },
        });
      });
    };

    const syncControls = () => {
      if (!map) return;

      if (props.content?.showNavigation) {
        if (!navControl) {
          navControl = new maplibregl.NavigationControl();
          map.addControl(navControl, "top-right");
        }
      } else if (navControl) {
        map.removeControl(navControl);
        navControl = null;
      }

      if (props.content?.showGeolocate) {
        if (!geoControl) {
          geoControl = new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
          });
          map.addControl(geoControl, "top-right");
        }
      } else if (geoControl) {
        map.removeControl(geoControl);
        geoControl = null;
      }

      if (props.content?.scrollZoom ?? true) {
        map.scrollZoom.enable();
      } else {
        map.scrollZoom.disable();
      }

      if (props.content?.showAttribution ?? true) {
        if (!attributionControl) {
          attributionControl = new maplibregl.AttributionControl();
          map.addControl(attributionControl, "bottom-right");
        }
      } else if (attributionControl) {
        map.removeControl(attributionControl);
        attributionControl = null;
      }
    };

    // WeWeb doesn't reliably inject CSS imported from node_modules, and without
    // MapLibre's CSS the canvas is mispositioned and drag/pan interaction breaks
    // (tiles/markers still show via inline transforms). Inject it explicitly.
    const ensureMapLibreCss = () => {
      const doc = wwLib.getFrontDocument();
      if (!doc || doc.getElementById("maplibre-gl-css")) return;
      const link = doc.createElement("link");
      link.id = "maplibre-gl-css";
      link.rel = "stylesheet";
      // Pin to the actual running maplibre-gl version so this never drifts
      // from whatever version was resolved by the "^" range in package.json.
      const version = maplibregl.getVersion?.() || "4.7.1";
      link.href = `https://unpkg.com/maplibre-gl@${version}/dist/maplibre-gl.css`;
      doc.head.appendChild(link);
    };

    let initAttempts = 0;
    let isUnmounted = false;
    const initMap = () => {
      if (map || isUnmounted) return;
      ensureMapLibreCss();
      // The element ref may not be attached yet in WeWeb — retry a few frames.
      if (!mapContainer.value) {
        if (initAttempts++ > 60) {
          console.warn(
            "[maplibre-map] Gave up waiting for the container element to mount; the map was not initialized."
          );
          return;
        }
        const win = wwLib.getFrontWindow();
        win.setTimeout(initMap, 50);
        return;
      }

      // MapLibre validates `container` with `instanceof HTMLElement` against
      // the HTMLElement class from whichever document its own bundled code
      // runs in. In the WeWeb editor that's a different document/realm than
      // the one Vue mounts our template into (mapContainer.value), so both
      // passing the Vue-rendered element and passing its id (which MapLibre
      // resolves via a bare `document.getElementById` in its own realm)
      // fail there — see the "Invalid type" / "Container ... not found"
      // errors this used to throw. Creating the element via the bare
      // `document` here puts it in MapLibre's own realm so the check
      // passes; appending it into the Vue-rendered wrapper afterward is
      // what makes it actually show up in the right place on the page (the
      // instanceof check only runs once, at construction, before that
      // append happens). Works the same in the published app, where there's
      // no realm split to begin with.
      glContainer = document.createElement("div");
      glContainer.style.position = "absolute";
      glContainer.style.inset = "0";
      glContainer.style.width = "100%";
      glContainer.style.height = "100%";
      mapContainer.value.appendChild(glContainer);

      map = new maplibregl.Map({
        container: glContainer,
        style: styleUrl.value,
        center: center.value,
        zoom: zoom.value,
        // Attribution is managed manually via syncControls() so it can be
        // toggled at runtime (bindable prop), same as nav/geolocate below.
        attributionControl: false,
        scrollZoom: props.content?.scrollZoom ?? true,
      });

      map.on("load", () => {
        setIsMapLoaded(true);
        // Defensive: make sure interaction handlers are active and the canvas
        // actually receives pointer events.
        try {
          map.dragPan.enable();
          map.doubleClickZoom.enable();
          map.touchZoomRotate.enable();
          map.keyboard.enable();
          const canvasContainer = map.getCanvasContainer();
          if (canvasContainer) canvasContainer.style.pointerEvents = "auto";
          const canvas = map.getCanvas();
          if (canvas) canvas.style.pointerEvents = "auto";
        } catch (e) {
          /* no-op */
        }
        map.resize();
        syncControls();
        resolvePointIcons();
        renderMarkers();
        emit("trigger-event", { name: "map:load", event: {} });
        applyEditorPopup();
      });

      map.on("click", (e) => {
        emit("trigger-event", {
          name: "map:click",
          event: { lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat } },
        });
        // Keep the popup open while it's force-opened in the editor.
        if (isEditing.value && props.content?.forcePopupInEditor) return;
        closePopup();
      });

      // Re-evaluate popup placement as the point moves across the viewport
      // (pan/zoom/rotate), so it flips when the point nears the top edge.
      map.on("move", () => {
        if (isPopupVisible.value) updatePopupPlacement();
      });

      map.on("moveend", () => {
        const c = map.getCenter();
        const z = map.getZoom();
        setMapCenter({ lng: c.lng, lat: c.lat });
        setMapZoom(z);
        emit("trigger-event", {
          name: "map:move",
          event: { center: { lng: c.lng, lat: c.lat }, zoom: z },
        });
      });

      const win = wwLib.getFrontWindow();
      if (win?.ResizeObserver) {
        resizeObserver = new win.ResizeObserver(() => {
          map?.resize();
          if (isPopupVisible.value) updatePopupPlacement();
        });
        resizeObserver.observe(mapContainer.value);
      }
    };

    // ----- Watchers -----
    // DOM markers persist across setStyle (they live in the map container, not
    // the style), so we only swap the style.
    watch(styleUrl, (newUrl) => {
      if (!map || !newUrl) return;
      map.setStyle(newUrl);
    });

    // Use a primitive key so this only fires when the coordinates actually
    // change — not on every content re-pass (which would snap the map back to
    // the initial center and break user panning).
    watch(
      () =>
        `${Number(props.content?.initialLongitude)},${Number(
          props.content?.initialLatitude
        )}`,
      () => {
        const lng = Number(props.content?.initialLongitude);
        const lat = Number(props.content?.initialLatitude);
        if (map && Number.isFinite(lng) && Number.isFinite(lat)) {
          map.setCenter([lng, lat]);
        }
      }
    );

    watch(zoom, (newZoom) => {
      if (map && Number.isFinite(newZoom)) {
        map.setZoom(newZoom);
      }
    });

    watch(
      processedPoints,
      () => {
        resolvePointIcons();
        renderMarkers();
      },
      { deep: true }
    );

    watch(
      () => [
        props.content?.showNavigation,
        props.content?.showGeolocate,
        props.content?.scrollZoom,
        props.content?.showAttribution,
      ],
      () => {
        syncControls();
      }
    );

    // Marker appearance changes re-render the markers.
    watch(
      () => [
        props.content?.markerType,
        props.content?.defaultMarkerColor,
        props.content?.defaultMarkerImage,
        props.content?.markerWidth,
        props.content?.markerHeight,
        props.content?.markerImageAnchor,
        props.content?.pillTextColor,
        props.content?.pillTextColorHover,
        props.content?.pillTextSize,
        props.content?.pillTextWeight,
        props.content?.pillBgColor,
        props.content?.pillBgColorHover,
        props.content?.pillBgColorSelected,
        props.content?.pillTextColorSelected,
        props.content?.pillScale,
        props.content?.pillPadding,
        props.content?.pillRadius,
        props.content?.pillShadow,
        props.content?.markerIcon,
        props.content?.markerIconTrailing,
        props.content?.markerIconSize,
        props.content?.markerIconColor,
        props.content?.markerIconColorHover,
        props.content?.markerIconColorSelected,
        props.content?.markerIconGap,
        resolvedIconSvg.value,
        resolvedIconSvgTrailing.value,
      ],
      () => {
        renderMarkers(true);
      }
    );

    // Keep the popup glued to its point when the point's coordinates change
    // (e.g. bound data updates); close it if the selected point disappears.
    watch(selectedCoords, (coords) => {
      if (popupMarker && coords) popupMarker.setLngLat(coords);
      if (isPopupVisible.value && !coords) closePopup();
    });

    // Rebuild markers when the selection changes so per-point selected colors
    // are applied to the newly selected point and cleared elsewhere.
    watch(selectedPointId, () => {
      const type = props.content?.markerType ?? "pin";
      if (["icon", "icon-text-pill", "text-pill"].includes(type)) {
        renderMarkers(true); // rebuild applies selected colors + z-index
      } else {
        applyMarkerZIndex(); // pin/image markers just need the z-index bump
      }
    });

    watch(popupOffset, (offset) => {
      if (popupMarker) popupMarker.setOffset(offset);
    });

    watch(
      () => props.content?.showPopups,
      (enabled) => {
        if (!enabled) closePopup();
      }
    );

    // Re-apply the forced editor popup when the toggle or points change.
    // (No-op in the published app since applyEditorPopup checks isEditing.)
    watch(
      () => [
        isEditing.value,
        props.content?.forcePopupInEditor,
        props.content?.showPopups,
        processedPoints.value.length,
      ],
      () => applyEditorPopup(),
      { immediate: true }
    );

    onMounted(() => {
      nextTick(() => initMap());
    });

    onBeforeUnmount(() => {
      isUnmounted = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      clearMarkers();
      if (popupMarker) {
        popupMarker.remove();
        popupMarker = null;
      }
      if (map) {
        map.remove();
        map = null;
      }
      // Vue removes mapContainer.value (and glContainer with it) on unmount.
      glContainer = null;
    });

    return {
      mapContainer,
      popupAnchorEl,
      isPopupVisible,
      mapCenter,
      mapZoom,
      isMapLoaded,
      selectedPoint,
      isEditing,
      // Exposed as WeWeb component actions (see `actions` in ww-config.js).
      flyTo,
      selectPoint,
      hoverPoint,
      unhoverPoint,
      onPopupMouseDown,
      // Exposed as a WeWeb component action (see `actions` in ww-config.js).
      closePopup,
    };
  },
};
</script>

<style lang="scss" scoped>
.maplibre-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 200px;
  overflow: hidden;

  &__container {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  // Popup host — MapLibre relocates this node into its marker pane and
  // positions it; we only ensure it can hold dropped WeWeb content.
  &__popup {
    z-index: 2;
    // MapLibre's interactive canvas container sets `cursor: grab` and
    // `user-select: none`; both are inherited CSS properties, so without an
    // explicit reset here the popup's contents can't be selected and always
    // show the grab/pointer cursor. Resetting to `auto` lets the browser pick
    // the right cursor per element (text cursor over text, etc.) and makes the
    // content selectable, matching normal page behavior.
    cursor: auto;
    user-select: text;
    -webkit-user-select: text;
  }

  &__popup-layout {
    min-width: 40px;
    min-height: 24px;
  }
}
</style>
