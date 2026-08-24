/* ==========================================================================
   NutriFlow — main.js
   Core frontend utilities, authentication state, API wrapper, and Indian food dish image mapping.
   ========================================================================== */

(function (window) {
  'use strict';

  var API_BASE_URL = 'http://127.0.0.1:8000';

  // Authentic Indian Food Photography Unsplash Collection Mapping
  var INDIAN_FOOD_IMAGES = {
    'paneer': 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80', // Paneer Butter Masala
    'dal': 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80',    // Yellow Dal Tadka
    'rice': 'https://images.unsplash.com/photo-1516714435131-44d6b64dc6a2?auto=format&fit=crop&w=400&q=80',   // Basmati Steamed Rice
    'roti': 'https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=400&q=80',   // Tandoori Roti / Naan
    'upma': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80',   // South Indian Upma / Idli
    'curd': 'https://images.unsplash.com/photo-1571217697479-7108990c7499?auto=format&fit=crop&w=400&q=80',   // Fresh Yogurt / Curd
    'gulab': 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=400&q=80',  // Gulab Jamun
    'jamun': 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=400&q=80',  // Gulab Jamun
    'biryani': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=400&q=80',// Dum Biryani
    'thali': 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=400&q=80',  // Indian Thali Feast
    'chole': 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=400&q=80',  // Chole Bhature
    'curry': 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=400&q=80',  // Indian Curry
    'sabzi': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&q=80',  // Mix Veg Sabzi
    'default': 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=400&q=80' // Default Indian Meal
  };

  function getCsrfToken() {
    var cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      var cookies = document.cookie.split(';');
      for (var i = 0; i < cookies.length; i++) {
        var cookie = cookies[i].trim();
        if (cookie.substring(0, 10) === 'csrftoken=') {
          cookieValue = decodeURIComponent(cookie.substring(10));
          break;
        }
      }
    }
    if (!cookieValue) {
      var el = document.querySelector('[name=csrfmiddlewaretoken]');
      if (el) cookieValue = el.value;
    }
    return cookieValue;
  }

  var currentUserCache = null;

  var NutriFlow = {
    getAuthToken: function () {
      return localStorage.getItem('nutriflow_token');
    },

    setAuthToken: function (token) {
      localStorage.setItem('nutriflow_token', token);
    },

    clearAuth: function () {
      localStorage.removeItem('nutriflow_token');
      localStorage.removeItem('nutriflow_user');
      currentUserCache = null;
    },

    isAuthenticated: function () {
      return !!this.getAuthToken();
    },

    getCurrentUser: function () {
      if (currentUserCache) {
        return Promise.resolve(currentUserCache);
      }
      var stored = localStorage.getItem('nutriflow_user');
      if (stored) {
        try {
          currentUserCache = JSON.parse(stored);
          return Promise.resolve(currentUserCache);
        } catch (e) {}
      }
      return this.apiFetch('/api/v1/accounts/me/')
        .then(function (res) {
          if (!res.ok) throw new Error('Failed to fetch user');
          return res.json();
        })
        .then(function (data) {
          currentUserCache = data;
          localStorage.setItem('nutriflow_user', JSON.stringify(data));
          return data;
        })
        .catch(function (err) {
          return null;
        });
    },

    apiFetch: function (endpoint, options) {
      options = options || {};
      options.headers = options.headers || {};

      var token = this.getAuthToken();
      if (token) {
        options.headers['Authorization'] = 'Bearer ' + token;
      }

      var csrf = getCsrfToken();
      if (csrf && !options.headers['X-CSRFToken']) {
        options.headers['X-CSRFToken'] = csrf;
      }

      if (!options.headers['Content-Type'] && !(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
      }

      if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        options.body = JSON.stringify(options.body);
      }

      var url = endpoint.startsWith('http') ? endpoint : (API_BASE_URL + endpoint);

      return fetch(url, options).then(function (response) {
        if (response.status === 401 && !endpoint.includes('/accounts/login')) {
          NutriFlow.clearAuth();
          if (window.location.pathname !== '/' && !window.location.pathname.includes('/login')) {
            window.location.href = '/';
          }
        }
        return response;
      });
    },

    showAlert: function (type, message, containerId) {
      var target = document.getElementById(containerId || 'nfMessages');
      if (!target) return;

      var alertClass = 'nf-badge-pink';
      var icon = 'bi-info-circle-fill';
      if (type === 'success') { alertClass = 'nf-badge-success'; icon = 'bi-check-circle-fill'; }
      else if (type === 'error' || type === 'danger') { alertClass = 'nf-badge-danger'; icon = 'bi-exclamation-triangle-fill'; }
      else if (type === 'warning') { alertClass = 'nf-badge-warning'; icon = 'bi-exclamation-circle-fill'; }

      var alertDiv = document.createElement('div');
      alertDiv.className = 'alert ' + alertClass + ' alert-dismissible fade show mb-3';
      alertDiv.style.borderRadius = 'var(--nf-radius-md)';
      alertDiv.style.padding = '12px 18px';
      alertDiv.style.display = 'flex';
      alertDiv.style.alignItems = 'center';
      alertDiv.style.justifySpaceBetween = 'space-between';

      alertDiv.innerHTML = '<div style="display:flex; align-items:center; gap:10px;"><i class="bi ' + icon + '"></i> <span>' + message + '</span></div>' +
                           '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" style="font-size:12px;"></button>';

      target.appendChild(alertDiv);
      setTimeout(function () {
        if (alertDiv.parentNode) alertDiv.remove();
      }, 5000);
    },

    openModal: function (modalId) {
      var modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    },

    closeModal: function (modalId) {
      var modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
    },

    formatCurrency: function (amount) {
      var val = parseFloat(amount) || 0;
      return '₹' + val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    },

    getFoodImage: function (itemName) {
      if (!itemName) return INDIAN_FOOD_IMAGES['default'];
      var lower = itemName.toLowerCase();

      for (var key in INDIAN_FOOD_IMAGES) {
        if (key !== 'default' && lower.includes(key)) {
          return INDIAN_FOOD_IMAGES[key];
        }
      }
      return INDIAN_FOOD_IMAGES['default'];
    },

    createEmptyState: function (title, description, iconClass) {
      iconClass = iconClass || 'bi-box-seam';
      return '<div class="nf-empty-state">' +
               '<div class="nf-empty-icon"><i class="bi ' + iconClass + '"></i></div>' +
               '<div class="nf-empty-title">' + title + '</div>' +
               '<div class="nf-empty-desc">' + description + '</div>' +
             '</div>';
    }
  };

  function updateRoleSidebar(user) {
    var navContainer = document.querySelector('.nf-nav');
    if (!navContainer || !user) return;

    var role = user.role || 'KITCHEN_STAFF';
    var path = window.location.pathname;

    var links = [];
    if (role === 'KITCHEN_STAFF') {
      links = [
        { path: '/dashboard/kitchen/', nav: 'dashboard', icon: 'bi-speedometer2', text: 'Kitchen Overview' },
        { path: '/forecast/', nav: 'forecast', icon: 'bi-graph-up-arrow', text: 'Demand Forecast' },
        { path: '/preparation/', nav: 'preparation', icon: 'bi-egg-fried', text: 'Meal Preparation' },
        { path: '/surplus/', nav: 'surplus', icon: 'bi-box-seam', text: 'HACCP Surplus Log' }
      ];
    } else if (role === 'ADMIN') {
      links = [
        { path: '/dashboard/admin/', nav: 'dashboard', icon: 'bi-speedometer2', text: 'Executive Control' },
        { path: '/forecast/', nav: 'forecast', icon: 'bi-graph-up-arrow', text: 'Demand Trends' },
        { path: '/surplus/', nav: 'surplus', icon: 'bi-shield-check', text: 'Safety Compliance' },
        { path: '/recipients/', nav: 'recipients', icon: 'bi-people-fill', text: 'NGO Verification' },
        { path: '/pickups/', nav: 'pickups', icon: 'bi-truck', text: 'Pickups Dispatch' },
        { path: '/impact/', nav: 'impact', icon: 'bi-heart-pulse-fill', text: 'Impact ESG' }
      ];
    } else if (role === 'RECIPIENT_ORG') {
      links = [
        { path: '/dashboard/recipient/', nav: 'dashboard', icon: 'bi-speedometer2', text: 'Available Surplus' },
        { path: '/pickups/', nav: 'pickups', icon: 'bi-truck', text: 'My Pickups & Claims' }
      ];
    } else if (role === 'ESG_LEAD') {
      links = [
        { path: '/dashboard/esg/', nav: 'dashboard', icon: 'bi-speedometer2', text: 'ESG Dashboard' },
        { path: '/impact/', nav: 'impact', icon: 'bi-heart-pulse-fill', text: 'Audit Reporting' }
      ];
    } else {
      links = [
        { path: '/dashboard/', nav: 'dashboard', icon: 'bi-speedometer2', text: 'Dashboard' },
        { path: '/forecast/', nav: 'forecast', icon: 'bi-graph-up-arrow', text: 'Forecast' },
        { path: '/preparation/', nav: 'preparation', icon: 'bi-egg-fried', text: 'Preparation' },
        { path: '/surplus/', nav: 'surplus', icon: 'bi-box-seam', text: 'Surplus' },
        { path: '/recipients/', nav: 'recipients', icon: 'bi-people-fill', text: 'Recipients' },
        { path: '/pickups/', nav: 'pickups', icon: 'bi-truck', text: 'Pickups' },
        { path: '/impact/', nav: 'impact', icon: 'bi-heart-pulse-fill', text: 'Impact' }
      ];
    }

    var html = '';
    links.forEach(function (l) {
      var isActive = path === l.path || (l.nav === 'dashboard' && path.includes('/dashboard')) ? 'active' : '';
      html += '<a href="' + l.path + '" class="nf-nav-link ' + isActive + '" data-nav="' + l.nav + '">' +
                '<i class="bi ' + l.icon + '"></i>' +
                '<span>' + l.text + '</span>' +
              '</a>';
    });
    navContainer.innerHTML = html;

    // Update Topbar User Display
    var userDisplay = document.getElementById('nfUserDisplay');
    if (userDisplay) {
      var roleName = (role === 'KITCHEN_STAFF') ? 'Kitchen Staff' :
                     (role === 'ADMIN') ? 'Campus Admin' :
                     (role === 'RECIPIENT_ORG') ? (user.organization_name || 'NGO Partner') :
                     (role === 'ESG_LEAD') ? 'ESG Lead' : 'Staff Account';

      userDisplay.innerHTML = '<strong>' + (user.username || 'User') + '</strong> <span class="nf-badge nf-badge-amber" style="margin-left:6px; font-size:11px;">' + roleName + '</span>';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Sidebar toggle for mobile
    var toggleBtn = document.getElementById('nfSidebarToggle');
    var sidebar = document.getElementById('nfSidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', function () {
        sidebar.classList.toggle('open');
      });
    }

    // Handle User Info & Dynamic Navigation / Role Redirection
    if (NutriFlow.isAuthenticated()) {
      NutriFlow.getCurrentUser().then(function (user) {
        if (!user) return;
        updateRoleSidebar(user);

        // Auto-route generic /dashboard/ to specific role dashboard
        var path = window.location.pathname;
        if (path === '/dashboard/' || path === '/dashboard') {
          var targetPath = '/dashboard/kitchen/';
          if (user.role === 'ADMIN') targetPath = '/dashboard/admin/';
          else if (user.role === 'RECIPIENT_ORG') targetPath = '/dashboard/recipient/';
          else if (user.role === 'ESG_LEAD') targetPath = '/dashboard/esg/';

          if (path !== targetPath) {
            window.location.href = targetPath;
          }
        }
      });
    }

    // Handle backdrop click to close modal
    document.addEventListener('click', function (e) {
      if (e.target && e.target.classList.contains('nf-modal-backdrop') && e.target.classList.contains('active')) {
        NutriFlow.closeModal(e.target.id);
      }
    });

    // Handle logout button
    var logoutBtn = document.getElementById('nfLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        NutriFlow.clearAuth();
        window.location.href = '/';
      });
    }
  });

  window.NutriFlow = NutriFlow;
})(window);