#!/bin/bash

if type update-alternatives >/dev/null 2>&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# Install apparmor profile. (Ubuntu 24+)
# First check if the version of AppArmor running on the device supports our profile.
# This is in order to keep backwards compatibility with Ubuntu 22.04 which does not support abi/4.0.
# In that case, we just skip installing the profile since the app runs fine without it on 22.04.
#
# Those apparmor_parser flags are akin to performing a dry run of loading a profile.
# https://wiki.debian.org/AppArmor/HowToUse#Dumping_profiles
#
# Unfortunately, at the moment AppArmor doesn't have a good story for backwards compatibility.
# https://askubuntu.com/questions/1517272/writing-a-backwards-compatible-apparmor-profile
if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"

    # Updating the current AppArmor profile is not possible and probably not meaningful in a chroot'ed environment.
    # Use cases are for example environments where images for clients are maintained.
    # There, AppArmor might correctly be installed, but live updating makes no sense.
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      # Extra flags taken from dh_apparmor:
      # > By using '-W -T' we ensure that any abstraction updates are also pulled in.
      # https://wiki.debian.org/AppArmor/Contribute/FirstTimeProfileImport
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
  fi
fi

# Relocate the app icon into a hicolor size directory the theme actually
# declares. electron-builder writes it to 1024x1024, and the Icon Theme
# Specification lookup only scans the sizes listed in the theme's
# Directories= key (…, 256x256, 512x512, scalable) — an icon in an
# undeclared size directory never renders in application menus.
for size_dir in /usr/share/icons/hicolor/512x512/apps /usr/share/icons/hicolor/256x256/apps; do
    mkdir -p "$size_dir"
    for name in "open-design.png" "Open Design.png"; do
        if [ -f "/usr/share/icons/hicolor/1024x1024/apps/$name" ]; then
            cp -f "/usr/share/icons/hicolor/1024x1024/apps/$name" "$size_dir/open-design.png"
            break
        fi
    done
done
rm -rf /usr/share/icons/hicolor/1024x1024/apps/open-design.png /usr/share/icons/hicolor/1024x1024/apps/"Open Design.png" 2>/dev/null || true

# The rpm lane names the desktop entry and icon after the display product
# name; repoint the Icon key at the space-free file (the deb lane is
# already space-free — the sed is a harmless no-op there).
sed -i 's|^Icon=Open Design$|Icon=open-design|' "/usr/share/applications/Open Design.desktop" 2>/dev/null || true

if hash gtk-update-icon-cache 2>/dev/null; then
    gtk-update-icon-cache -f /usr/share/icons/hicolor 2>/dev/null || true
fi
