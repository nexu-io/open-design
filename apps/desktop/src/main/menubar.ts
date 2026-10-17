import { Menu, Tray, nativeImage } from "electron";

// The logo glyph from apps/web/public/logo-mark.svg, black on transparent at
// 18x18 and 36x36 px. As a template image macOS tints it like other menu bar
// icons, for light and dark menu bars.
const ICON_1X = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAABDElEQVQ4y7XUMUoDQRgF4E+RgCBewWKLFMHGI3gZew8QW7u1WLGzTJUjqJ2NEKxSWOoFhKQT41j4K+MySTaCDx4s/7z/zT9vdpd/xgA1ppgHp1EbdDHoocECH5hgFJxEbRGa3iqTWySMURU0Vayl0BbNmhAMO0w+DG1TymQRu3XFOHp+ZVbH+fPj3OMCh0uMquip8+I0wiyNn/CAE+y3NJPo/cHc183kOIgdE96DM1xmmlH02onCXmH0Z9zhONMtxXb23C+sX6/p7+MlL6RC2LCL1xVhp3bY36GWrv98iVHx+lPGs3V5hKb4QqYWN/5EtjKjkvkjnrJgjyLLK5zird10U5gq58yGv5E/4xPVfVpkx92lXQAAAABJRU5ErkJggg==";
const ICON_2X = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAACZ0lEQVRYw+2YP2gUQRTGfxGVKy4eRwL2uSuiRWIbJClEu6sSMGmFdLZne30KsdaTFJY5EPyDTcQijQbEcDaKYCqbeIooCd4FPC12lrwdZ3fezl5Ikw8G9ibvffPt7Mz7EzhFNsYCfMpAA7gGzAJTwAXzt1/ALtAFXgHPgf3jEl8HHgIHwF/lOADaxndkKAFrwGEOIfY4NBwl32K+T1YDHgMz1nwf2AS2gI/AdzM/AUwDC8ANh4D3wCLwOWRnrgB71pt+BZpAReFfMbY9i2PPcOdCzSFmA6gGvFjV+NqialqCEtEtiZ2HQIuwGxljzHAMBW8XxZmC6PDJt2kVEGKjZXGv+RzqJG/TRsGdce1Uh+TtywwJbZIHOOTM+FAledDbaYZlkkGvmWL3DngBLAHnAkU1SQbPsstoRRj9Jv1q37N28S5wOaegilkj5llxGT0QBk8zyGZwR+PXwCowrhT1TPjedxls4/9cMd6Snib2gXXgqofjjvDZdhnIg9bwkN3OECTHB7PwRQdHg+Sn/w8DYTDnEVQlymdy8X7G2HFwzAnfQTx5VhicR48fwBPgpvk9RBl1fTiTMj+h8F0vuPakeP7pE3RJQbgJfCkgaFo87/oEzSsIh8CjAoIWxHPXZSAPaFZglKgb+z85xdiBcdknSBOLYmwFCFKlDltQD11yvZVTkDq5ugJbB3/5USZqdzTIVX6kRdsTK9DSBJ1YCevLSx3Ci/yOxaUq8jXJssdo2qDZrK2UgrToAy85ahS/mflJjhrF6xRsFEPb5JG20hKfjkFIoX82zBcUNSAqtN4QlaTLpETgUxTBP7WbYj/YXNTYAAAAAElFTkSuQmCC";

/**
 * macOS menu bar icon for the packaged app. Left click opens the window and
 * right click offers Open / Quit. `setContextMenu` is deliberately unused: it
 * would pop the menu on left click too. Callers must keep the returned Tray
 * referenced; a collected Tray removes the icon.
 */
export function createMenubarTray(options: { onOpen: () => void; onQuit: () => void }): Tray {
  const icon = nativeImage.createFromDataURL(ICON_1X);
  icon.addRepresentation({ scaleFactor: 2, dataURL: ICON_2X });
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  const menu = Menu.buildFromTemplate([
    { label: "Open", click: options.onOpen },
    { label: "Quit", click: options.onQuit },
  ]);
  tray.on("click", options.onOpen);
  tray.on("right-click", () => tray.popUpContextMenu(menu));
  return tray;
}
