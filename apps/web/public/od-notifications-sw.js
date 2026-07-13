// Browser service workers must be served as JavaScript files. This tiny
// runtime exists only to display task-completion notifications and focus
// the existing Open Design tab when the user clicks one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = typeof data.url === 'string' ? data.url : self.location.origin;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    const sameOrigin = windows.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch {
        return false;
      }
    });

    if (sameOrigin) {
      if ('navigate' in sameOrigin) {
        try {
          await sameOrigin.navigate(targetUrl);
        } catch {
          /* focus the existing tab below */
        }
      }
      return sameOrigin.focus();
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
    return undefined;
  })());
});
