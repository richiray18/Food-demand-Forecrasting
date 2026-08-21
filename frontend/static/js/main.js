/* ==========================================================================
   NutriFlow — main.js
   Common frontend functionality shared across all pages.
   Works with: frontend/templates/base.html + frontend/static/css/style.css
   ========================================================================== */

// Global NutriFlow Utility Namespace
window.NutriFlow = (function () {
  var API_HOST = '';

  function getToken() {
    return localStorage.getItem('access_token');
  }

  function setTokens(access, refresh) {
    if (access) localStorage.setItem('access_token', access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
  }

  function clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  function isAuthPage() {
    var p = window.location.pathname;
    return p === '/' || p === '' || p.indexOf('/login') !== -1;
  }

  function getLoginUrl() {
    return '/';
  }

  function requireAuth() {
    var token = getToken();
    if (!token && !isAuthPage()) {
      window.location.href = getLoginUrl();
      return false;
    }
    return true;
  }

  function apiFetch(endpoint, options) {
    options = options || {};
    options.headers = options.headers || {};

    var token = getToken();
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    var url = endpoint.startsWith('http') ? endpoint : (API_HOST + endpoint);

    return fetch(url, options).then(function (response) {
      if (response.status === 401) {
        clearTokens();
        if (!isAuthPage()) {
          window.location.href = getLoginUrl();
        }
        throw new Error('Authentication expired. Please log in again.');
      }
      return response;
    });
  }

  function showAlert(type, message, timeoutMs) {
    var container = document.getElementById('nfMessages');
    if (!container) return;

    var alertClass = 'nf-alert-info';
    var iconClass = 'bi-info-circle';
    if (type === 'success') {
      alertClass = 'nf-alert-success';
      iconClass = 'bi-check-circle-fill';
    } else if (type === 'error' || type === 'danger') {
      alertClass = 'nf-alert-error';
      iconClass = 'bi-exclamation-triangle-fill';
    } else if (type === 'warning') {
      alertClass = 'nf-alert-warning';
      iconClass = 'bi-exclamation-circle-fill';
    }

    var alertDiv = document.createElement('div');
    alertDiv.className = 'nf-alert ' + alertClass;
    alertDiv.innerHTML = '<i class="bi ' + iconClass + '"></i><span>' + message + '</span>';

    container.appendChild(alertDiv);

    if (timeoutMs !== 0) {
      setTimeout(function () {
        if (alertDiv.parentNode) {
          alertDiv.parentNode.removeChild(alertDiv);
        }
      }, timeoutMs || 5000);
    }
  }

  function loadUserProfile() {
    var userDisplay = document.getElementById('nfUserDisplay');
    if (!userDisplay || !getToken()) return;

    apiFetch('/api/v1/accounts/me/')
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (user) {
        if (user) {
          var name = user.organization_name || user.username;
          var roleTag = user.role ? (' (' + user.role.replace('_', ' ') + ')') : '';
          userDisplay.textContent = name + roleTag;
        }
      })
      .catch(function () {
        // Keep default label
      });
  }

  function openModal(id) {
    var modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('show');
    }
  }

  function closeModal(id) {
    var modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('show');
    }
  }

  function formatKg(val) {
    var num = parseFloat(val);
    return isNaN(num) ? '0.0 kg' : (num.toFixed(1) + ' kg');
  }

  function formatCurrency(val) {
    var num = parseFloat(val);
    return isNaN(num) ? '₹0' : ('₹' + Math.round(num).toLocaleString('en-IN'));
  }

  return {
    API_HOST: API_HOST,
    getToken: getToken,
    setTokens: setTokens,
    clearTokens: clearTokens,
    getLoginUrl: getLoginUrl,
    requireAuth: requireAuth,
    apiFetch: apiFetch,
    showAlert: showAlert,
    loadUserProfile: loadUserProfile,
    openModal: openModal,
    closeModal: closeModal,
    formatKg: formatKg,
    formatCurrency: formatCurrency
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  initSidebarToggle();
  initActiveNav();
  initLogout();
  
  if (window.location.pathname !== '/' && window.location.pathname.indexOf('/login') === -1) {
    NutriFlow.requireAuth();
    NutriFlow.loadUserProfile();
  }
});

/* ---------------------------------------------------------------------- */
/* Sidebar toggle                                                         */
/* ---------------------------------------------------------------------- */
function initSidebarToggle() {
  var sidebar = document.getElementById('nfSidebar');
  var toggleBtn = document.getElementById('nfSidebarToggle');
  var layout = document.querySelector('.nf-layout');

  if (!sidebar || !toggleBtn || !layout) return;

  var backdrop = null;

  function createBackdrop() {
    if (backdrop) return backdrop;
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
/* Active navigation highlighting                                         */
/* ---------------------------------------------------------------------- */
function initActiveNav() {
  var navLinks = document.querySelectorAll('.nf-nav-link[data-nav]');
  var currentPath = window.location.pathname;

  navLinks.forEach(function (link) {
    var navKey = link.getAttribute('data-nav');
    if (!navKey) return;

    var isActive = currentPath.indexOf('/' + navKey) !== -1;
    if (isActive) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Logout handler                                                         */
/* ---------------------------------------------------------------------- */
function initLogout() {
  var logoutBtn = document.getElementById('nfLogoutBtn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', function (event) {
    event.preventDefault();
    NutriFlow.clearTokens();
    window.location.href = '/';
  });
}