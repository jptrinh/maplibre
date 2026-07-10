// Factory for a "map this point field from a collection" Formula property.
// Every points*Formula shares the same shape — only the label and the mapping
// key differ — so they're generated instead of copy-pasted.
const pointFormula = (label, key) => ({
  label: { en: label },
  type: "Formula",
  section: "settings",
  options: (content) => ({
    template:
      Array.isArray(content.points) && content.points.length > 0
        ? content.points[0]
        : null,
  }),
  defaultValue: { type: "f", code: `context.mapping?.['${key}']` },
  hidden: (content, sidepanelContent, boundProps) =>
    !Array.isArray(content.points) ||
    !content.points?.length ||
    !boundProps.points,
});

export default {
  editor: {
    label: {
      en: "MapLibre Map",
    },
    icon: "map",
    customSettingsPropertiesOrder: [
      {
        label: "Map setup",
        properties: ["mapStyle", "customStyleUrl", "initialLatitude", "initialLongitude", "initialZoom"],
      },
      {
        label: "Controls",
        properties: ["scrollZoom", "showNavigation", "showGeolocate", "showAttribution"],
      },
      {
        label: "Points",
        properties: [
          "points",
          "pointsLatitudeFormula",
          "pointsLongitudeFormula",
          "pointsLabelFormula",
          "pointsDescriptionFormula",
          "pointsColorFormula",
          "pointsImageFormula",
          "pointsIconFormula",
          "pointsIconTrailingFormula",
          "pointsDisplayIconFormula",
          "pointsDisplayIconTrailingFormula",
          "pointsIconColorFormula",
          "pointsIconColorSelectedFormula",
        ],
      },

      {
        label: "Popup",
        isCollapsible: true,
        properties: ["showPopups", "autoFlipPopup", "forcePopupInEditor"],
      },
    ],
    customStylePropertiesOrder: [
      "markerType",
      "markerImageAnchor",
      {
        label: "Marker defaults",
        properties: ["defaultMarkerColor", "defaultMarkerImage", "markerWidth", "markerHeight"],
      },
      {
        label: "Icon",
        isCollapsible: true,
        properties: ["markerIcon", "markerIconTrailing", "markerIconSize", "markerIconColor", "markerIconColorHover", "markerIconColorSelected", "markerIconGap"],
      },
      {
        label: "Text pill",
        isCollapsible: true,
        properties: [
          "pillTextColor",
          "pillTextColorHover",
          "pillTextColorSelected",
          "pillTextSize",
          "pillTextWeight",
          "pillBgColor",
          "pillBgColorHover",
          "pillBgColorSelected",
          "pillScale",
          "pillPadding",
          "pillRadius",
          "pillShadow",
        ],
      },
      "popupGap",
    ],
  },
  triggerEvents: [
    { name: "map:load", label: { en: "On map load" }, event: {} },
    {
      name: "map:click",
      label: { en: "On map click" },
      event: { lngLat: { lng: 0, lat: 0 } },
    },
    {
      name: "map:move",
      label: { en: "On map move" },
      event: { center: { lng: 0, lat: 0 }, zoom: 0 },
    },
    {
      name: "marker:click",
      label: { en: "On marker click" },
      event: { point: {} },
    },
    {
      name: "marker:mouseenter",
      label: { en: "On marker mouse enter" },
      event: { point: {} },
    },
    {
      name: "marker:mouseleave",
      label: { en: "On marker mouse leave" },
      event: { point: {} },
    },
    {
      name: "popup:open",
      label: { en: "On popup open" },
      event: { point: {} },
    },
    {
      name: "popup:close",
      label: { en: "On popup close" },
      event: {},
    },
  ],
  actions: [
    {
      action: "closePopup",
      label: { en: "Close popup" },
      /* wwEditor:start */
      args: [],
      /* wwEditor:end */
    },
  ],
  properties: {
    // ----- Map setup -----
    mapStyle: {
      label: { en: "Map style" },
      type: "TextSelect",
      section: "settings",
      options: {
        options: [
          { value: "liberty", label: "Liberty" },
          { value: "bright", label: "Bright" },
          { value: "positron", label: "Positron" },
          { value: "dark", label: "Dark" },
        ],
      },
      defaultValue: "liberty",
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "OpenFreeMap style: liberty | bright | positron | dark",
      },
      propertyHelp: {
        tooltip:
          "The OpenFreeMap base style. Overridden by 'Custom style URL' if set.",
      },
      /* wwEditor:end */
    },
    customStyleUrl: {
      label: { en: "Custom style URL" },
      type: "Text",
      section: "settings",
      defaultValue: "",
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "URL to a MapLibre style JSON. Overrides the map style above.",
      },
      propertyHelp: {
        tooltip:
          "Optional. Point at any MapLibre style JSON. When set, it overrides the selected map style.",
      },
      /* wwEditor:end */
    },
    initialLatitude: {
      label: { en: "Initial latitude" },
      type: "Number",
      section: "settings",
      defaultValue: 52.517,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: { type: "number", tooltip: "Latitude (-90 to 90)" },
      /* wwEditor:end */
    },
    initialLongitude: {
      label: { en: "Initial longitude" },
      type: "Number",
      section: "settings",
      defaultValue: 13.388,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Longitude (-180 to 180)",
      },
      /* wwEditor:end */
    },
    initialZoom: {
      label: { en: "Initial zoom" },
      type: "Number",
      section: "settings",
      min: 0,
      max: 22,
      step: 0.5,
      defaultValue: 9.5,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: { type: "number", tooltip: "Zoom level (0 to 22)" },
      /* wwEditor:end */
    },

    // ----- Controls -----
    scrollZoom: {
      label: { en: "Scroll to zoom" },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
    },
    showNavigation: {
      label: { en: "Show navigation controls" },
      type: "OnOff",
      section: "settings",
      defaultValue: false,
      bindable: true,
      /* wwEditor:start */
      propertyHelp: {
        tooltip: "Zoom in/out and compass buttons.",
      },
      /* wwEditor:end */
    },
    showGeolocate: {
      label: { en: "Show geolocate button" },
      type: "OnOff",
      section: "settings",
      defaultValue: false,
      bindable: true,
    },
    showAttribution: {
      label: { en: "Show attribution" },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
      /* wwEditor:start */
      propertyHelp: {
        tooltip:
          "Keep OpenFreeMap / MapLibre attribution visible (recommended).",
      },
      /* wwEditor:end */
    },

    // ----- Points -----
    points: {
      label: { en: "Points" },
      type: "Array",
      section: "settings",
      bindable: true,
      defaultValue: [
        {
          latitude: 41.8781,
          longitude: -87.6298,
          label: "Chicago",
          description: "The Windy City",
          color: "",
        },
        {
          latitude: 52.517,
          longitude: 13.388,
          label: "Berlin",
          description: "Brandenburg Gate area",
          color: "",
        },
      ],
      options: {
        expandable: true,
        getItemLabel(item) {
          return item?.label || item?.title || "Point";
        },
        item: {
          type: "Object",
          defaultValue: {
            latitude: 0,
            longitude: 0,
            label: "New point",
            description: "",
            color: "",
            image: "",
            icon: "",
            iconTrailing: "",
            displayIcon: true,
            displayIconTrailing: true,
            iconColor: "",
            iconColorSelected: "",
          },
          options: {
            item: {
              latitude: { label: { en: "Latitude" }, type: "Number" },
              longitude: { label: { en: "Longitude" }, type: "Number" },
              label: { label: { en: "Label" }, type: "Text" },
              description: { label: { en: "Description" }, type: "Text" },
              color: { label: { en: "Color" }, type: "Color" },
              image: { label: { en: "Image URL" }, type: "Text" },
              displayIcon: { label: { en: "Display leading icon" }, type: "OnOff", defaultValue: true },
              icon: { label: { en: "Leading icon" }, type: "SystemIcon" },
              displayIconTrailing: { label: { en: "Display trailing icon" }, type: "OnOff", defaultValue: true },
              iconTrailing: { label: { en: "Trailing icon" }, type: "SystemIcon" },
              iconColor: { label: { en: "Icon color" }, type: "Color" },
              iconColorSelected: { label: { en: "Icon color (selected)" }, type: "Color" },
            },
          },
        },
      },
      /* wwEditor:start */
      bindingValidation: {
        type: "array",
        tooltip:
          "Array of point objects with latitude, longitude, label, description, color, image, icon, iconTrailing, displayIcon, displayIconTrailing, iconColor, iconColorSelected.",
      },
      /* wwEditor:end */
    },
    pointsLatitudeFormula: pointFormula("Latitude field", "latitude"),
    pointsLongitudeFormula: pointFormula("Longitude field", "longitude"),
    pointsLabelFormula: pointFormula("Label field", "label"),
    pointsDescriptionFormula: pointFormula("Description field", "description"),
    pointsColorFormula: pointFormula("Marker color", "color"),
    pointsImageFormula: pointFormula("Image field", "image"),
    pointsIconFormula: pointFormula("Leading icon field", "icon"),
    pointsIconTrailingFormula: pointFormula("Trailing icon field", "iconTrailing"),
    pointsDisplayIconFormula: pointFormula("Display leading icon field", "displayIcon"),
    pointsDisplayIconTrailingFormula: pointFormula("Display trailing icon field", "displayIconTrailing"),
    pointsIconColorFormula: pointFormula("Icon color field", "iconColor"),
    pointsIconColorSelectedFormula: pointFormula("Icon color (selected) field", "iconColorSelected"),
    markerType: {
      label: { en: "Marker type" },
      type: "TextSelect",
      section: "style",
      options: {
        options: [
          { value: "pin", label: "Pin" },
          { value: "image", label: "Image" },
          { value: "text-pill", label: "Text pill" },
          { value: "icon", label: "Icon" },
          { value: "icon-text-pill", label: "Icon and Text pill" },
        ],
      },
      defaultValue: "pin",
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "Marker type: pin | image | text-pill | icon | icon-text-pill",
      },
      propertyHelp: {
        tooltip:
          "Pin = colored marker. Image = custom image. Text pill = rounded badge. Icon = icon on a colored circle. Icon and Text pill = icon + text pill.",
      },
      /* wwEditor:end */
    },
    defaultMarkerColor: {
      label: { en: "Default marker color" },
      type: "Color",
      section: "style",
      defaultValue: "#F23636",
      bindable: true,
      hidden: (content) =>
        !["pin", "icon"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      propertyHelp: {
        tooltip:
          "Used for pin and icon markers when a point has no color of its own.",
      },
      /* wwEditor:end */
    },
    defaultMarkerImage: {
      label: { en: "Default marker image" },
      type: "Image",
      section: "style",
      defaultValue: "",
      bindable: true,
      hidden: (content) => (content?.markerType ?? "pin") !== "image",
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "Image used as the marker for points without their own image.",
      },
      propertyHelp: {
        tooltip:
          "Image shown for points without their own 'Image URL'. A point's own image overrides this.",
      },
      /* wwEditor:end */
    },
    markerWidth: {
      label: { en: "Marker width" },
      type: "Number",
      section: "style",
      min: 8,
      max: 200,
      step: 1,
      defaultValue: 32,
      bindable: true,
      hidden: (content) => (content?.markerType ?? "pin") !== "image",
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Image marker width in pixels.",
      },
      /* wwEditor:end */
    },
    markerHeight: {
      label: { en: "Marker height" },
      type: "Number",
      section: "style",
      min: 8,
      max: 200,
      step: 1,
      defaultValue: 40,
      bindable: true,
      hidden: (content) => (content?.markerType ?? "pin") !== "image",
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Image marker height in pixels.",
      },
      /* wwEditor:end */
    },
    markerImageAnchor: {
      label: { en: "Marker anchor" },
      type: "TextSelect",
      section: "style",
      options: {
        options: [
          { value: "bottom", label: "Bottom" },
          { value: "center", label: "Center" },
          { value: "top", label: "Top" },
        ],
      },
      defaultValue: "bottom",
      bindable: true,
      hidden: (content) => (content?.markerType ?? "pin") === "pin",
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "Which part of the marker sits on the coordinate.",
      },
      /* wwEditor:end */
    },
    // ----- Icon props -----
    markerIcon: {
      label: { en: "Leading icon" },
      type: "SystemIcon",
      section: "style",
      defaultValue: "",
      bindable: true,
      hidden: (content) =>
        !["icon", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "Leading icon code displayed on the marker.",
      },
      propertyHelp: {
        tooltip:
          "Icon shown before the label. Used when marker type is 'Icon' or 'Icon and Text pill'.",
      },
      /* wwEditor:end */
    },
    markerIconTrailing: {
      label: { en: "Trailing icon" },
      type: "SystemIcon",
      section: "style",
      defaultValue: "",
      bindable: true,
      hidden: (content) =>
        (content?.markerType ?? "pin") !== "icon-text-pill",
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "Trailing icon code displayed on the marker.",
      },
      propertyHelp: {
        tooltip:
          "Icon shown after the label. Used when marker type is 'Icon and Text pill'.",
      },
      /* wwEditor:end */
    },
    markerIconSize: {
      label: { en: "Icon size" },
      type: "Number",
      section: "style",
      min: 8,
      max: 64,
      step: 1,
      defaultValue: 20,
      bindable: true,
      hidden: (content) =>
        !["icon", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Size of the icon in pixels.",
      },
      /* wwEditor:end */
    },
    markerIconColor: {
      label: { en: "Icon color" },
      type: "Color",
      section: "style",
      defaultValue: "#FFFFFF",
      bindable: true,
      hidden: (content) =>
        !["icon", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "Color of the icon.",
      },
      /* wwEditor:end */
    },
    markerIconColorHover: {
      label: { en: "Icon color (hover)" },
      type: "Color",
      section: "style",
      defaultValue: "",
      bindable: true,
      hidden: (content) =>
        !["icon", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      propertyHelp: {
        tooltip: "Icon color on hover. Leave empty to keep the base color.",
      },
      bindingValidation: {
        type: "string",
        tooltip: "Color of the icon on hover.",
      },
      /* wwEditor:end */
    },
    markerIconColorSelected: {
      label: { en: "Icon color (selected)" },
      type: "Color",
      section: "style",
      defaultValue: "",
      bindable: true,
      hidden: (content) =>
        !["icon", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      propertyHelp: {
        tooltip:
          "Icon color when a point is selected. Leave empty to keep the base color. Overridden by a point's own selected color.",
      },
      bindingValidation: {
        type: "string",
        tooltip: "Color of the icon when the point is selected.",
      },
      /* wwEditor:end */
    },
    markerIconGap: {
      label: { en: "Icon gap" },
      type: "Number",
      section: "style",
      min: 0,
      max: 32,
      step: 1,
      defaultValue: 6,
      bindable: true,
      hidden: (content) =>
        (content?.markerType ?? "pin") !== "icon-text-pill",
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Gap in pixels between the icon and the text.",
      },
      /* wwEditor:end */
    },
    // ----- Text pill styling -----
    pillTextColor: {
      label: { en: "Pill text color" },
      type: "Color",
      section: "style",
      defaultValue: "#FFFFFF",
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
    },
    pillTextColorHover: {
      label: { en: "Pill text color (hover)" },
      type: "Color",
      section: "style",
      defaultValue: "",
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      propertyHelp: {
        tooltip: "Text color on hover. Leave empty to keep the base color.",
      },
      /* wwEditor:end */
    },
    pillTextColorSelected: {
      label: { en: "Pill text color (selected)" },
      type: "Color",
      section: "style",
      defaultValue: "",
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      propertyHelp: {
        tooltip: "Text color when the point is selected. Leave empty to keep the base color.",
      },
      /* wwEditor:end */
    },
    pillTextSize: {
      label: { en: "Pill text size" },
      type: "Number",
      section: "style",
      min: 8,
      max: 48,
      step: 1,
      defaultValue: 14,
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      bindingValidation: { type: "number", tooltip: "Text size in pixels." },
      /* wwEditor:end */
    },
    pillTextWeight: {
      label: { en: "Pill text weight" },
      type: "TextSelect",
      section: "style",
      options: {
        options: [
          { value: "400", label: "Regular" },
          { value: "500", label: "Medium" },
          { value: "600", label: "Semibold" },
          { value: "700", label: "Bold" },
        ],
      },
      defaultValue: "600",
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
    },
    pillBgColor: {
      label: { en: "Pill background color" },
      type: "Color",
      section: "style",
      defaultValue: "#111827",
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      propertyHelp: {
        tooltip:
          "Pill background. A point's own color (if set) overrides this.",
      },
      /* wwEditor:end */
    },
    pillBgColorHover: {
      label: { en: "Pill background color (hover)" },
      type: "Color",
      section: "style",
      defaultValue: "",
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      propertyHelp: {
        tooltip:
          "Pill background on hover. Leave empty to keep the base background.",
      },
      /* wwEditor:end */
    },
    pillBgColorSelected: {
      label: { en: "Pill background color (selected)" },
      type: "Color",
      section: "style",
      defaultValue: "",
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      propertyHelp: {
        tooltip:
          "Pill background when the point is selected. Leave empty to keep the base background.",
      },
      /* wwEditor:end */
    },
    pillScale: {
      label: { en: "Pill scale (hover / selected)" },
      type: "Number",
      section: "style",
      min: 1,
      max: 2,
      step: 0.05,
      defaultValue: 1.1,
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Scale factor applied to a pill when hovered or selected (1 = no scaling).",
      },
      propertyHelp: {
        tooltip:
          "How much the pill grows when hovered or selected, e.g. 1.1 = 10% larger. Set to 1 to disable. The change animates smoothly.",
      },
      /* wwEditor:end */
    },
    pillPadding: {
      label: { en: "Pill padding" },
      type: "Spacing",
      section: "style",
      options: {
        unitChoices: [
          { value: "px", label: "px", min: 0, max: 100 },
          { value: "em", label: "em", min: 0, max: 5 },
        ],
        noRange: true,
        useVar: true,
      },
      defaultValue: "6px 12px 6px 12px",
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "CSS padding value (e.g. '6px 12px').",
      },
      /* wwEditor:end */
    },
    pillRadius: {
      label: { en: "Pill radius" },
      type: "Length",
      section: "style",
      options: {
        unitChoices: [
          { value: "px", label: "px", min: 0, max: 999 },
          { value: "%", label: "%", min: 0, max: 100 },
        ],
        noRange: true,
        useVar: true,
      },
      defaultValue: "999px",
      bindable: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "CSS border-radius (e.g. '999px' for a full pill).",
      },
      /* wwEditor:end */
    },
    pillShadow: {
      label: { en: "Pill shadow" },
      type: "Shadows",
      section: "style",
      defaultValue: "0px 1px 4px 0px rgba(0, 0, 0, 0.25)",
      bindable: true,
      responsive: true,
      states: true,
      classes: true,
      hidden: (content) =>
        !["text-pill", "icon-text-pill"].includes(content?.markerType ?? "pin"),
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip:
          "CSS box-shadow value (e.g. '0px 2px 6px 0px rgba(0,0,0,0.3)'). Leave empty for no shadow.",
      },
      /* wwEditor:end */
    },
    showPopups: {
      label: { en: "Open popup on marker click" },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
      /* wwEditor:start */
      propertyHelp: {
        tooltip:
          "When on, clicking a marker opens the popup (built in the dropzone below) anchored to that point. The clicked point's data is exposed as the 'selectedPoint' component variable. Clicking the map closes it.",
      },
      /* wwEditor:end */
    },
    autoFlipPopup: {
      label: { en: "Flip popup to fit" },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
      hidden: (content) => !(content?.showPopups ?? true),
      /* wwEditor:start */
      propertyHelp: {
        tooltip:
          "When on, the popup opens below the point instead of above it when there isn't enough room above (e.g. the point is near the top of the map). Turn off to always open above.",
      },
      /* wwEditor:end */
    },
    popupContent: {
      hidden: true,
      defaultValue: [],
      /* wwEditor:start */
      bindingValidation: {
        type: "array",
        tooltip: "WeWeb elements rendered inside the map popup.",
      },
      /* wwEditor:end */
    },
    popupGap: {
      label: { en: "Popup gap" },
      type: "Number",
      section: "style",
      min: 0,
      max: 200,
      step: 1,
      defaultValue: 8,
      bindable: true,
      hidden: (content) => !(content?.showPopups ?? true),
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Vertical gap in pixels between the marker tip and the popup.",
      },
      propertyHelp: {
        tooltip: "Space between the marker and the popup above it.",
      },
      /* wwEditor:end */
    },
    forcePopupInEditor: {
      label: { en: "Force popup open (editor)" },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
      hidden: (content) => !(content?.showPopups ?? true),
      /* wwEditor:start */
      propertyHelp: {
        tooltip:
          "Editor only: keep the popup open on the first point so you can design it. No effect in the published app.",
      },
      /* wwEditor:end */
    },
  },
};
