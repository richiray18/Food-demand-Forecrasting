/* ==========================================================================
   NutriFlow — dashboard.js
   Manages executive KPI cards, preparation vs consumption charts, and meal logs.
   Endpoints:
     GET /api/v1/accounts/me/
     GET /api/v1/meals/consumption-logs/
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var statPrepared = document.getElementById('dashStatPrepared');
  var statConsumed = document.getElementById('dashStatConsumed');
  var statSurplus = document.getElementById('dashStatSurplus');
  var statHeadcount = document.getElementById('dashStatHeadcount');
  var userDisplay = document.getElementById('nfUserDisplay');

  var tableBody = document.getElementById('dashLogsTableBody');
  var listStatus = document.getElementById('dashLogsStatus');

  var prepChartInstance = null;
  var sessionChartInstance = null;

  // Load User Profile
  NutriFlow.apiFetch('/api/v1/accounts/me/')
    .then(function (r) { return r.json(); })
    .then(function (user) {
      if (userDisplay && user.username) {
        userDisplay.textContent = (user.organization_name || user.username) + ' (' + (user.role || 'STAFF') + ')';
      }
    })
    .catch(function (err) {
      console.error('Error fetching user profile:', err);
    });

  // Load Meals Consumption Logs
  loadDashboardData();

  function loadDashboardData() {
    listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-ink-600); font-size: 13.5px;"><i class="bi bi-hourglass-split"></i> Loading dining operational logs...</div>';

    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listStatus.innerHTML = '';
        var logs = Array.isArray(data) ? data : (data.results || []);

        if (logs.length === 0) {
          tableBody.innerHTML = '<tr><td colspan="6">' + NutriFlow.createEmptyState('No meal logs recorded today', 'Log your kitchen preparation in the Preparation tab to begin tracking waste reduction.', 'bi-egg-fried') + '</td></tr>';
          renderFallbackCharts();
          return;
        }

        updateKPIs(logs);
        renderTable(logs);
        renderCharts(logs);
      })
      .catch(function (err) {
        listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-danger); font-size: 13.5px;">Error loading logs: ' + err.message + '</div>';
        renderFallbackCharts();
      });
  }

  function updateKPIs(logs) {
    var totPrep = 0;
    var totCons = 0;
    var totSurplus = 0;
    var totHeadcount = 0;

    logs.forEach(function (log) {
      var prep = parseFloat(log.quantity_prepared_kg) || 0;
      var cons = parseFloat(log.quantity_consumed_kg) || 0;
      var head = parseInt(log.headcount_served, 10) || 0;

      totPrep += prep;
      totCons += cons;
      if (prep > cons) {
        totSurplus += (prep - cons);
      }
      totHeadcount += head;
    });

    statPrepared.innerHTML = totPrep.toFixed(1) + '<span class="unit">kg</span>';
    statConsumed.innerHTML = totCons.toFixed(1) + '<span class="unit">kg</span>';
    statSurplus.innerHTML = totSurplus.toFixed(1) + '<span class="unit">kg</span>';
    statHeadcount.textContent = totHeadcount.toLocaleString();
  }

  function renderTable(logs) {
    tableBody.innerHTML = '';

    logs.slice(0, 8).forEach(function (log) {
      var tr = document.createElement('tr');

      var prep = parseFloat(log.quantity_prepared_kg) || 0;
      var cons = parseFloat(log.quantity_consumed_kg) || 0;
      var surplus = prep - cons;

      var dishName = log.meal_item_name || log.item_name || 'Dal Tadka & Rice';
      var imgUrl = NutriFlow.getFoodImage(dishName);

      var statusBadge = surplus > 0
        ? '<span class="nf-badge nf-badge-peach"><i class="bi bi-box-seam"></i> Surplus (' + surplus.toFixed(1) + ' kg)</span>'
        : '<span class="nf-badge nf-badge-sage"><i class="bi bi-check-circle"></i> Clean Service</span>';

      tr.innerHTML = '<td><strong style="color: var(--nf-ink-900);">' + (log.date || 'Today') + '</strong></td>' +
        '<td><span class="nf-badge nf-badge-neutral">' + (log.session_name || log.session || 'Lunch') + '</span></td>' +
        '<td><div class="nf-food-cell"><img src="' + imgUrl + '" class="nf-food-thumb" alt="Dish"><div><strong style="color: var(--nf-ink-900);">' + dishName + '</strong><div style="font-size: 11.5px; color: var(--nf-ink-600);">' + (log.headcount_served || 0) + ' headcounts</div></div></div></td>' +
        '<td><strong style="color: var(--nf-pink-600); font-family: var(--nf-font-mono);">' + prep.toFixed(1) + ' kg</strong></td>' +
        '<td><strong style="color: var(--nf-sage-600); font-family: var(--nf-font-mono);">' + cons.toFixed(1) + ' kg</strong></td>' +
        '<td>' + statusBadge + '</td>';

      tableBody.appendChild(tr);
    });
  }

  function renderCharts(logs) {
    var ctxTrend = document.getElementById('dashTrendChart');
    if (ctxTrend) {
      if (prepChartInstance) prepChartInstance.destroy();

      var reversed = logs.slice(0, 7).reverse();
      var labels = reversed.map(function (l) { return (l.date || 'Day') + ' (' + (l.session_name || 'Meal') + ')'; });
      var prepData = reversed.map(function (l) { return parseFloat(l.quantity_prepared_kg) || 0; });
      var consData = reversed.map(function (l) { return parseFloat(l.quantity_consumed_kg) || 0; });

      prepChartInstance = new Chart(ctxTrend.getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Prepared (kg)',
              data: prepData,
              backgroundColor: '#7A1C1C',
              borderRadius: 6
            },
            {
              label: 'Consumed (kg)',
              data: consData,
              backgroundColor: '#C06C2F',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' }
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Kilograms (kg)' } }
          }
        }
      });
    }

    var ctxSession = document.getElementById('dashSessionChart');
    if (ctxSession) {
      if (sessionChartInstance) sessionChartInstance.destroy();

      var sessionTotals = {};
      logs.forEach(function (l) {
        var s = l.session_name || 'Lunch';
        sessionTotals[s] = (sessionTotals[s] || 0) + (parseFloat(l.quantity_prepared_kg) || 0);
      });

      sessionChartInstance = new Chart(ctxSession.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: Object.keys(sessionTotals),
          datasets: [{
            data: Object.values(sessionTotals),
            backgroundColor: ['#7A1C1C', '#C06C2F', '#57534E', '#4a7c66', '#a55722']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }
  }

  function renderFallbackCharts() {
    var ctxTrend = document.getElementById('dashTrendChart');
    if (ctxTrend && !prepChartInstance) {
      prepChartInstance = new Chart(ctxTrend.getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['Mon (Lunch)', 'Mon (Dinner)', 'Tue (Breakfast)', 'Tue (Lunch)'],
          datasets: [
            { label: 'Prepared (kg)', data: [45, 52, 30, 48], backgroundColor: '#7A1C1C', borderRadius: 6 },
            { label: 'Consumed (kg)', data: [38, 48, 28, 42], backgroundColor: '#C06C2F', borderRadius: 6 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    var ctxSession = document.getElementById('dashSessionChart');
    if (ctxSession && !sessionChartInstance) {
      sessionChartInstance = new Chart(ctxSession.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Lunch', 'Dinner', 'Breakfast'],
          datasets: [{ data: [93, 100, 58], backgroundColor: ['#7A1C1C', '#C06C2F', '#57534E'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  }

  // --------------------------------------------------------------------------
  // 3D Motion & Tilt Effect for Top Action Card Icon Badges
  // --------------------------------------------------------------------------
  (function initActionIcons3DTilt() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var cards = document.querySelectorAll('.nf-action-card');
    cards.forEach(function (card) {
      var icon = card.querySelector('.nf-action-icon');
      if (!icon) return;

      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;

        var centerX = rect.width / 2;
        var centerY = rect.height / 2;

        // Subtle tilt angle calculation (max ±8 deg)
        var rotateX = ((centerY - y) / centerY) * 8;
        var rotateY = ((x - centerX) / centerX) * 8;

        // Soft drop shadow shift
        var shadowX = (rotateY * -0.5).toFixed(1);
        var shadowY = (rotateX * 0.5 + 5).toFixed(1);

        icon.style.transform = 'perspective(400px) rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg) translateZ(10px) scale(1.04)';
        icon.style.boxShadow = shadowX + 'px ' + shadowY + 'px 16px rgba(122, 28, 28, 0.35), 0 3px 6px rgba(28, 25, 23, 0.08)';
      });

      card.addEventListener('mouseleave', function () {
        icon.style.transform = 'perspective(400px) rotateX(0deg) rotateY(0deg) translateZ(0px) scale(1)';
        icon.style.boxShadow = '0 4px 12px rgba(122, 28, 28, 0.15), 0 2px 4px rgba(28, 25, 23, 0.05)';
      });
    });
  })();
});