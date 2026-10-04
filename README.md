# Inside My Rig

An interactive 3D model of my PC: Ryzen 7 7800X3D, RTX 4070 SUPER, B650 AORUS ELITE AX.
Hit **Explode** to blow it apart, click any part to spin it 360° and see its specs and usage.

Live at **https://stairfamily21-gif.github.io**

## Install it as an app
- **PC (Chrome / Edge):** open the site and click the install icon in the address bar.
- **Phone:** open the site, then choose *Add to Home Screen*.

## Refresh the usage numbers
The site shows a snapshot, because a website can't read a PC live. To update it, run this on the PC:

```powershell
powershell -ExecutionPolicy Bypass -File .\update-stats.ps1 -Push
```

## Preview locally
```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```
Then open http://localhost:8765

## Files
| File | What it is |
| --- | --- |
| `index.html` | The page |
| `style.css` | Look and layout |
| `main.js` | The 3D scene, built with [three.js](https://threejs.org) |
| `stats.js` | Hardware + usage snapshot (generated) |
| `update-stats.ps1` | Captures a new snapshot |
| `manifest.webmanifest`, `sw.js`, `icons/` | Make it installable as an app |
