# Branding

Current originals: `automora-main-original.png` and `automora-launcher-original.png`. The main icon is rounded during packaging; launcher artwork is preserved. The UI uses the packaged images in `src/assets`.

To regenerate, install Python 3 and Pillow (`python -m pip install Pillow`), then run `python branding/build-icons.py`. The script emits DIB-backed multi-size Windows ICO files for WinForms compatibility. An experimental Tauri output is generated only if that directory exists.

The Automora name and logos identify this project. The MIT code license does not grant trademark rights or endorsement of forks.
