/* NicaRunner — Sidebar toggle + responsive */
(function () {
  const sidebar = document.querySelector('.app-sidebar');
  const toggle = document.querySelector('.sidebar-toggle');
  const mainArea = document.querySelector('.app-main-area');
  if (!sidebar || !toggle) return;

  // Load saved preference
  const saved = localStorage.getItem('nicarunner-sidebar-expanded');
  const prefersExpanded = saved === 'true';

  function setExpanded(state) {
    if (state) {
      sidebar.classList.add('expanded');
    } else {
      sidebar.classList.remove('expanded');
    }
    localStorage.setItem('nicarunner-sidebar-expanded', state ? 'true' : 'false');
    updateScrim(state);
  }

  function updateScrim(state) {
    let scrim = document.querySelector('.sidebar-scrim');
    const isMobile = window.innerWidth < 1024;

    if (isMobile && state) {
      if (!scrim) {
        scrim = document.createElement('div');
        scrim.className = 'sidebar-scrim';
        scrim.addEventListener('click', function () { setExpanded(false); });
        document.body.appendChild(scrim);
      }
      scrim.classList.add('visible');
    } else if (scrim) {
      scrim.classList.remove('visible');
      if (!isMobile) scrim.remove();
    }
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    setExpanded(!sidebar.classList.contains('expanded'));
  });

  // Close drawer on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar.classList.contains('expanded')) {
      setExpanded(false);
    }
  });

  // Initial state
  setExpanded(prefersExpanded);

  // Re-evaluate on resize
  let resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      const isMobile = window.innerWidth < 1024;
      if (isMobile && sidebar.classList.contains('expanded')) {
        updateScrim(true);
      } else {
        updateScrim(false);
      }
    }, 150);
  });

  // Close user-menu dropdown on outside click
  document.addEventListener('click', function (e) {
    var open = document.querySelector('.user-menu.open');
    if (open && !open.contains(e.target)) {
      open.classList.remove('open');
    }
  });
})();
