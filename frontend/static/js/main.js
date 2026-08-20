/* ==========================================================================
   NutriFlow — main.js
   Common frontend functionality shared across all pages.
   Works with: frontend/templates/base.html + frontend/static/css/style.css
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  initSidebarToggle();
  initActiveNav();
  initLogout();
});

/* ---------------------------------------------------------------------- */
/* Sidebar toggle (responsive open/close + optional backdrop)             */
/* ---------------------------------------------------------------------- */
function initSidebarToggle() {
  var sidebar = document.getElementById('nfSidebar');
  var toggleBtn = document.getElementById('nfSidebarToggle');
  var layout = document.querySelector('.nf-layout');

  if (!sidebar || !toggleBtn || !layout) {
    return;
  }

  var backdrop = null;

  function createBackdrop() {
    if (backdrop) {
      return backdrop;
    }
    backdrop = document.createElement('div');
    backdrop.className = 'nf-sidebar-backdrop';
    backdrop.addEventListener('click', closeSidebar);
    layout.appendChild(backdrop);
    return backdrop;
  }

  function openSidebar() {
    sidebar.classList.add('nf-sidebar--open');
    createBackdrop();
  }

  function closeSidebar() {
    sidebar.classList.remove('nf-sidebar--open');
    if (backdrop && backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
      backdrop = null;
    }
  }

  function toggleSidebar() {
    if (sidebar.classList.contains('nf-sidebar--open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  toggleBtn.addEventListener('click', toggleSidebar);

  window.addEventListener('resize', function () {
    if (window.innerWidth > 1024) {
      closeSidebar();
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Active navigation highlighting (based on data-nav + current URL)       */
/* ---------------------------------------------------------------------- */
function initActiveNav() {
  var navLinks = document.querySelectorAll('.nf-nav-link[data-nav]');
  var currentPath = window.location.pathname;

  navLinks.forEach(function (link) {
    var navKey = link.getAttribute('data-nav');
    if (!navKey) {
      return;
    }

    var isActive = currentPath.indexOf('/' + navKey + '/') !== -1;

    if (isActive) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Logout (clears stored JWT, redirects to login page)                    */
/* ---------------------------------------------------------------------- */
function initLogout() {
  var logoutBtn = document.getElementById('nfLogoutBtn');

  if (!logoutBtn) {
    return;
  }

  logoutBtn.addEventListener('click', function (event) {
    event.preventDefault();

    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    window.location.href = getLoginUrl();
  });
}

/* ---------------------------------------------------------------------- */
/* Resolve the login page URL relative to this script's own location,     */
/* so it works correctly regardless of how deep the current page is       */
/* nested inside frontend/templates/                                      */
/* ---------------------------------------------------------------------- */
function getLoginUrl() {
  var scriptEl = document.currentScript || document.querySelector('script[src*="main.js"]');
  var scriptUrl = new URL(scriptEl.src, window.location.href);
  var rootPath = scriptUrl.pathname.split('/static/js/main.js')[0];

  return rootPath + '/templates/accounts/login.html';
}