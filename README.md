# SISA Desktop

Desktop version of SISA with an updated 360° Peking opera scene.

Explore 150 five-second audio clips from *Qin Xianglian* in a panoramic scene. Drag to look around, click a sound point to listen, or use the clip library. Arrow keys turn the view; Enter selects a centered point; Space pauses or resumes, and Esc stops audio. The player includes volume, replay and stop controls. One clip plays at a time.

## GitHub Pages

Publish this repository from **Settings → Pages → Deploy from a branch → main → /(root)**.

Expected site address after successful deployment: <https://yuqiwang1717.github.io/sisadesktop/>.

## Local preview

Run `python3 -m http.server 8000 --bind 127.0.0.1` from this directory, then open <http://127.0.0.1:8000/>. Keep the server running. Opening the HTML through `file://` cannot load the module and sound map.

## Research and assets

This desktop adaptation builds on Yuqi Wang and collaborators' DIS 2025 SISA research and the [original prototype](https://github.com/siruiii/audioTSNE-final-prototype). Findings from the original VR study do not establish the effectiveness of this desktop version.

The original B1 audio, 2D/3D coordinates, group IDs and clip filenames are preserved. The panorama is an AI-generated, source-guided interpretation of an early arrival scene, not an expert-validated reconstruction. See `ATTRIBUTION.md` and `asset-manifest.json` for provenance. No research-session logs, participant records or remote analytics are included.

This is a focused deployment export. Keep the original project and media as the source of future revisions.
