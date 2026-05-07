## Vendored 7-Zip extractor

- Binaries:
  - `7z.exe`
  - `7z.dll`
- Upstream: 7-Zip 26.00 x64
- Canonical source package: `https://github.com/ip7z/7zip/releases/download/26.00/7z2600-x64.exe`
- Reproducible extraction source: `https://github.com/ip7z/7zip/releases/download/26.00/7z2600-x64.msi`
- Upstream download page: `https://www.7-zip.org/download.html`
- License: `License.txt`
- SHA256 (`7z.exe`): `4A41AA37786C7EAE7451E81C2C97458D5D1AE5A3A8154637A0D5F77ADC05E619`
- SHA256 (`7z.dll`): `BBD705E3B58CA7677C1E9E67473F166A6712DA034DCB567D571FBB67507A443F`
- SHA256 (`License.txt`): `32369594A3A9F7C643D124035120EAA6A7707E75E57C4386EF509F801447BC49`

These binaries are vendored only for the Windows tools-pack installer build.
The installer embeds `7z.exe` and `7z.dll` temporarily to extract the packaged
Open Design `.7z` payload during installation.

These files remain subject to the upstream 7-Zip license and are not relicensed
under this repository's Apache-2.0 license. In particular, see `License.txt` for
the GNU LGPL, BSD, and unRAR restriction notices.
