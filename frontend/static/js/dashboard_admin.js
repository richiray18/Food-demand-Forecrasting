/* ==========================================================================
   NutriFlow — dashboard_admin.js
   Campus Administrator Dashboard logic: Cross-campus directory, safety compliance, NGO verification.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var complianceChartInstance = null;
  var trendChartInstance = null;
  var verificationChartInstance = null;

  initAdminDashboard();

  function initAdminDashboard() {
    loadCampuses();
    loadComplianceAndSurplus();
    loadRecipientPartners();
    loadImpactSummary();
    loadConsumptionTrends();
  }

  function loadCampuses() {
    NutriFlow.apiFetch('/api/v1/config/campuses/')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var campuses = data.results || data || [];
        var countEl = document.getElementById('adminStatCampuses');
        if (countEl) countEl.textContent = campuses.length;

        var tbody = document.getElementById('adminCampusesTbody');
        if (!tbody) return;

        if (campuses.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">No campus facilities configured.</td></tr>';
          return;
        }

        var html = '';
        campuses.forEach(function (c) {
          html += '<tr>' +
                    '<td><strong>' + c.name + '</strong></td>' +
                    '<td><code>' + (c.code || 'MAIN') + '</code></td>' +
                    '<td>' + (c.student_capacity ? c.student_capacity.toLocaleString() : '1,500') + ' students</td>' +
                    '<td><span class="nf-badge nf-badge-amber">Active Operation</span></td>' +
                  '</tr>';
        });
        tbody.innerHTML = html;
      })
      .catch(function (err) {
        console.warn('Error loading campuses:', err);
      });
  }

  function loadComplianceAndSurplus() {
    NutriFlow.apiFetch('/api/surplus/surplus-food/')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var items = data.results || data || [];
        var availableCount = 0;
        var reservedCount = 0;
        var pickedUpCount = 0;
        var expiredCount = 0;

        items.forEach(function (it) {
          if (it.status === 'AVAILABLE') availableCount++;
          else if (it.status === 'RESERVED') reservedCount++;
          else if (it.status === 'PICKED_UP' || it.status === 'COMPLETED' || it.status === 'CLAIMED') pickedUpCount++;
          else if (it.status === 'EXPIRED' || it.status === 'DISCARDED') expiredCount++;
        });

        var availEl = document.getElementById('compStatAvailable');
        var claimEl = document.getElementById('compStatClaimed');
        var expEl = document.getElementById('compStatExpired');

        var claimedTotal = reservedCount + pickedUpCount;

        if (availEl) availEl.textContent = availableCount;
        if (claimEl) claimEl.textContent = claimedTotal;
        if (expEl) expEl.textContent = expiredCount;

        var total = availableCount + claimedTotal + expiredCount;
        var compRate = total > 0 ? (((availableCount + claimedTotal) / total) * 100).toFixed(1) : 100.0;
        var compRateEl = document.getElementById('adminStatCompliance');
        if (compRateEl) compRateEl.innerHTML = compRate + '<span class="unit">%</span>';

        renderComplianceChart(availableCount, reservedCount, pickedUpCount, expiredCount);
      })
      .catch(function (err) {
        console.warn('Error loading surplus compliance:', err);
      });
  }

  function renderComplianceChart(avail, reserved, pickedUp, expired) {
    var ctx = document.getElementById('adminComplianceChart');
    if (!ctx) return;

    if (complianceChartInstance) complianceChartInstance.destroy();

    var hasData = (avail + reserved + pickedUp + expired) > 0;
    var dataValues = hasData ? [avail, reserved, pickedUp, expired] : [0, 0, 0, 0];

    complianceChartInstance = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Available Safe', 'Reserved', 'Picked Up', 'Expired / Discarded'],
        datasets: [{
          data: dataValues,
          backgroundColor: ['#4A7C66', '#D97706', '#7A1C1C', '#DC2626'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 750, easing: 'easeInOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Plus Jakarta Sans', size: 11 } } },
          tooltip: {
            callbacks: {
              label: function (context) {
                return ' ' + context.label + ': ' + context.parsed + ' items';
              }
            }
          }
        }
      }
    });
  }

  function loadRecipientPartners() {
    NutriFlow.apiFetch('/api/recipients/recipients/')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var recipients = data.results || data || [];
        var totalCount = recipients.length;
        var verifiedCount = 0;

        recipients.forEach(function (r) {
          if (r.is_verified) verifiedCount++;
        });

        var unverifiedCount = totalCount - verifiedCount;

        var ngosEl = document.getElementById('adminStatNGOs');
        var subEl = document.getElementById('adminStatVerifiedSub');
        if (ngosEl) ngosEl.textContent = totalCount;
        if (subEl) subEl.innerHTML = '<i class="bi bi-check2-all"></i> ' + verifiedCount + ' Verified';

        renderRecipientVerificationChart(verifiedCount, unverifiedCount);

        var tbody = document.getElementById('adminRecipientsTbody');
        if (!tbody) return;

        if (recipients.length === 0) {
          tbody.innerHTML = '<tr><td colspan="3" class="text-center py-3 text-muted">No NGO partners registered.</td></tr>';
          return;
        }

        var html = '';
        recipients.slice(0, 6).forEach(function (r) {
          var isVer = r.is_verified;
          var statusBadge = isVer
            ? '<span class="nf-badge nf-badge-amber"><i class="bi bi-check-circle-fill"></i> Verified</span>'
            : '<span class="nf-badge nf-badge-coral"><i class="bi bi-clock-history"></i> Pending Admin</span>';

          html += '<tr>' +
                    '<td><strong>' + (r.organization_name || 'NGO Partner') + '</strong></td>' +
                    '<td>' + (r.capacity_quantity || 100) + ' ' + (r.capacity_unit || 'KG') + '</td>' +
                    '<td>' + statusBadge + '</td>' +
                  '</tr>';
        });
        tbody.innerHTML = html;
      })
      .catch(function (err) {
        console.warn('Error loading recipient partners:', err);
      });
  }

  function renderRecipientVerificationChart(verified, unverified) {
    var ctx = document.getElementById('adminRecipientVerificationChart');
    if (!ctx) return;

    if (verificationChartInstance) verificationChartInstance.destroy();

    verificationChartInstance = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Verified Partners', 'Pending / Unverified'],
        datasets: [{
          data: [verified, unverified],
          backgroundColor: ['#4A7C66', '#C06C2F'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 750, easing: 'easeInOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Plus Jakarta Sans', size: 11 } } },
          tooltip: {
            callbacks: {
              label: function (context) {
                return ' ' + context.label + ': ' + context.parsed + ' orgs';
              }
            }
          }
        }
      }
    });
  }

  function loadImpactSummary() {
    NutriFlow.apiFetch('/api/impact/summary/')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var budgetEl = document.getElementById('adminStatBudget');
        if (budgetEl) budgetEl.textContent = NutriFlow.formatCurrency(data.estimated_savings || 0);
      })
      .catch(function (err) {
        console.warn('Error loading impact summary:', err);
      });
  }

  function loadConsumptionTrends() {
    var ctx = document.getElementById('adminTrendChart');
    if (!ctx) return;

    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var logs = data.results || data || [];
        var sessionMap = {};

        logs.forEach(function (l) {
          var sName = l.session_name || 'Session ' + l.session;
          if (!sessionMap[sName]) {
            sessionMap[sName] = { prep: 0, cons: 0 };
          }
          sessionMap[sName].prep += parseFloat(l.quantity_prepared_kg) || 0;
          sessionMap[sName].cons += parseFloat(l.quantity_consumed_kg) || 0;
        });

        var sessions = Object.keys(sessionMap);
        if (sessions.length === 0) {
          sessions = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
        }

        var prepData = sessions.map(function (s) { return sessionMap[s] ? sessionMap[s].prep : 0; });
        var consData = sessions.map(function (s) { return sessionMap[s] ? sessionMap[s].cons : 0; });

        if (trendChartInstance) trendChartInstance.destroy();

        trendChartInstance = new Chart(ctx.getContext('2d'), {
          type: 'bar',
          data: {
            labels: sessions,
            datasets: [
              {
                label: 'Total Prepared (kg)',
                data: prepData,
                backgroundColor: '#7A1C1C',
                borderRadius: 6,
                borderSkipped: false
              },
              {
                label: 'Total Consumed (kg)',
                data: consData,
                backgroundColor: '#C06C2F',
                borderRadius: 6,
                borderSkipped: false
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 750, easing: 'easeInOutQuart' },
            plugins: {
              legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Plus Jakarta Sans', size: 12 } } },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return ' ' + context.dataset.label + ': ' + context.parsed.y.toFixed(1) + ' kg';
                  }
                }
              }
            },
            scales: {
              x: { grid: { display: false } },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(0, 0, 0, 0.05)', drawBorder: false },
                title: { display: true, text: 'Kilograms (kg)', font: { family: 'Plus Jakarta Sans', size: 11 } }
              }
            }
          }
        });
      })
      .catch(function (err) {
        console.warn('Error loading consumption trends for admin dashboard:', err);
      });
  }
});
