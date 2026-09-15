# Photo workspace remaster — 1.0.0 Alpha 1

## Changes

- Yellow (#FFC639) workspace with larger labels, visible keyboard focus, scrolling layer inspector and a compact layout on narrow windows.
- Real pixel zoom: 1:1, fit-to-view, zoom controls and a separate Hand (H) tool. Transparency uses a checkerboard behind the image only.
- Mosaic edits the selected visible pixel layer; brush size no longer changes with viewport zoom. Text layers are protected from pixel painting.
- Crop and document rotation/flip retain layer pixels, text metadata and transforms instead of flattening them. Shift-resize preserves the initial aspect ratio.
- Imported image layers retain original resolution. Text canvases resize to fit their contents; non-text property changes no longer redraw text with a potentially different local font.
- Unsaved status, close confirmation, save-in-progress protection, validated project reads and temporary-file replacement on successful saves.
- JPEG quality control and white transparency background; temperature tint preserves alpha. PNG retains transparency.
- Text input no longer triggers editor letter shortcuts. Native shortcut actions are not executed twice.
- UI no longer downloads Google Fonts, allowing offline startup.

## Verification

Run `npm test` with Node 22.14+ for geometry and real project-file tests, and `npm run dist:win` for the Windows x64 installer.

Automated tests cover reversible layer transforms, crop coordinates, malformed project validation, Unicode names/content, gzip and legacy JSON reads, overwrite and preservation on invalid writes.

Live UI interaction and macOS execution have not been verified in this environment. Project files embed raster images and text metadata, but do not embed font files: reopening preserves the saved rendered text; editing text on another OS may use a substitute font. Free transform currently supports translation, rotation and independent axis scaling, not perspective/warp.
