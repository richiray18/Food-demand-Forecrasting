/* ==========================================================================
   NutriFlow — dashboard.js
   Fetches meal consumption logs, computes variance, renders KPIs, smart alerts & Chart.js charts.
   Endpoint: GET /api/v1/meals/consumption-logs/?date=YYYY-MM-DD
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var todayDateEl = document.getElementById('nfTodayDate');
  var statusEl = document.getElementById('nfDashboardStatus');
  var tableCard = document.getElementById('nfTableCard');
  var tableBody = document.getElementById('nfLogsTableBody');
  var logCountBadge = document.getElementById('nfLogCountBadge');
  var dateFilterInput = document.getElementById('nfDateFilter');
  var refreshBtn = document.getElementById('nfRefreshBtn');
  var alertsContainer = document.getElementById('nfSmartAlertsContainer');

  var statPrepared = document.getElementById('nfStatPrepared');
  var statConsumed = document.getElementById('nfStatConsumed');
  var statSurplus = document.getElementById('nfStatSurplus');
  var statHeadcount = document.getElementById('nfStatHeadcount');
  var surplusRateLabel = document.getElementById('nfSurplusRateLabel');

  var demandChartInstance = null;
  var sessionChartInstance = null;

  // Initialize Date
  var initialDate = getTodayDateString();
  dateFilterInput.value = initialDate;
  todayDateEl.textContent = formatDisplayDate(initialDate);

  loadDashboard(initialDate);

  // Event Listeners
  dateFilterInput.addEventListener('change', function () {
    var selected = dateFilterInput.value;
    if (selected) {
      todayDateEl.textContent = formatDisplayDate(selected);
      loadDashboard(selected);
    }
  });

  refreshBtn.addEventListener('click', function () {
    var selected = dateFilterInput.value || getTodayDateString();
    loadDashboard(selected);
  });

  function loadDashboard(dateStr) {
    showStatus('loading', '<i class="bi bi-hourglass-split"></i> Loading meal operations data for ' + dateStr + '...');

    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/?date=' + encodeURIComponent(dateStr))
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Server responded with status ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        var rows = Array.isArray(data) ? data : (data.results || []);

        if (rows.length === 0) {
          // Try fetching without date filter to see if recent records exist to suggest
          fetchFallbackNotice(dateStr);
          return;
        }

        clearStatus();
        renderStats(rows);
        renderCharts(rows);
        renderSmartAlerts(rows);
        renderTable(rows);
        tableCard.style.display = 'block';
      })
      .catch(function (error) {
        showStatus('error', '<i class="bi bi-exclamation-octagon-fill"></i> Unable to load dashboard data. (' + error.message + ')');
        tableCard.style.display = 'none';
        resetStats();
      });
  }

  function fetchFallbackNotice(dateStr) {
    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/')
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (allData) {
        var allRows = Array.isArray(allData) ? allData : (allData && allData.results ? allData.results : []);
        var hint = '';
        if (allRows.length > 0) {
          var latestDate = allRows[0].date;
          hint = '<br><button class="nf-btn nf-btn-primary nf-btn-sm" style="margin-top: 10px;" id="nfLoadLatestBtn">Load Latest Data (' + latestDate + ')</button>';
        }
        showStatus('empty', '<i class="bi bi-calendar-x"></i> No meal records found for ' + dateStr + '.' + hint);
        tableCard.style.display = 'none';
        resetStats();
        destroyCharts();
        alertsContainer.innerHTML = '';

        var loadLatestBtn = document.getElementById('nfLoadLatestBtn');
        if (loadLatestBtn && allRows.length > 0) {
          loadLatestBtn.addEventListener('click', function () {
            dateFilterInput.value = allRows[0].date;
            todayDateEl.textContent = formatDisplayDate(allRows[0].date);
            loadDashboard(allRows[0].date);
          });
        }
      })
      .catch(function () {
        showStatus('empty', 'No meal data available for ' + dateStr + '.');
      });
  }

  function renderStats(rows) {
    var totalPrepared = 0;
    var totalConsumed = 0;
    var totalSurplus = 0;
    var totalHeadcount = 0;

    rows.forEach(function (row) {
      totalPrepared += toNumber(row.quantity_prepared_kg);
      totalConsumed += toNumber(row.quantity_consumed_kg);
      totalSurplus += toNumber(row.surplus_kg);
      totalHeadcount += toNumber(row.headcount);
    });

    statPrepared.innerHTML = totalPrepared.toFixed(1) + '<span class="unit">kg</span>';
    statConsumed.innerHTML = totalConsumed.toFixed(1) + '<span class="unit">kg</span>';
    statSurplus.innerHTML = totalSurplus.toFixed(1) + '<span class="unit">kg</span>';
    statHeadcount.textContent = totalHeadcount.toLocaleString();

    var surplusRate = totalPrepared > 0 ? ((totalSurplus / totalPrepared) * 100).toFixed(1) : 0;
    surplusRateLabel.textContent = surplusRate + '% Surplus Ratio';
  }

  function renderSmartAlerts(rows) {
    alertsContainer.innerHTML = '';
    var alerts = [];

    var highSurplusItems = rows.filter(function (r) {
      return toNumber(r.surplus_kg) >= 8.0;
    });

    if (highSurplusItems.length > 0) {
      var itemNames = highSurplusItems.map(function (i) { return (i.item_name || 'Item') + ' (' + toNumber(i.surplus_kg).toFixed(1) + 'kg)'; }).join(', ');
      alerts.push({
        type: 'warning',
        icon: 'bi-exclamation-triangle-fill',
        title: 'Action Required: High Surplus Detected',
        text: 'Significant surplus logged for ' + itemNames + '. Food safety window active — route to NGO pickup before danger threshold.'
      });
    }

    var totalPrepared = rows.reduce(function (sum, r) { return sum + toNumber(r.quantity_prepared_kg); }, 0);
    var totalConsumed = rows.reduce(function (sum, r) { return sum + toNumber(r.quantity_consumed_kg); }, 0);
    var accuracy = totalPrepared > 0 ? (100 - Math.abs(totalPrepared - totalConsumed) / totalPrepared * 100).toFixed(1) : 100;

    if (accuracy >= 88) {
      alerts.push({
        type: 'success',
        icon: 'bi-check-circle-fill',
        title: 'High AI Forecast Accuracy (' + accuracy + '%)',
        text: 'Kitchen batch preparations were tightly aligned with actual dining consumption for this schedule.'
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        type: 'info',
        icon: 'bi-shield-check',
        title: 'Operations Stable',
        text: 'All meal sessions running within standard variance tolerances.'
      });
    }

    alerts.forEach(function (alert) {
      var alertDiv = document.createElement('div');
      alertDiv.className = 'nf-alert ' + (alert.type === 'warning' ? 'nf-alert-warning' : (alert.type === 'success' ? 'nf-alert-success' : 'nf-alert-info'));
      alertDiv.style.marginBottom = '8px';
      alertDiv.innerHTML = '<i class="bi ' + alert.icon + '" style="font-size: 18px;"></i><div><strong>' + alert.title + '</strong> — ' + alert.text + '</div>';
      alertsContainer.appendChild(alertDiv);
    });
  }

  function renderCharts(rows) {
    // 1. Demand Comparison Bar Chart
    var ctxDemand = document.getElementById('nfDemandChart');
    if (ctxDemand) {
      if (demandChartInstance) demandChartInstance.destroy();

      var labels = rows.map(function (r) {
        return (r.item_name || 'Dish') + ' (' + (r.session_name || 'Slot') + ')';
      });
      var prepData = rows.map(function (r) { return toNumber(r.quantity_prepared_kg); });
      var consData = rows.map(function (r) { return toNumber(r.quantity_consumed_kg); });

      demandChartInstance = new Chart(ctxDemand.getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Prepared (kg)',
              data: prepData,
              backgroundColor: '#4c8c63',
              borderRadius: 6
            },
            {
              label: 'Consumed (kg)',
              data: consData,
              backgroundColor: '#e2a63b',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return context.dataset.label + ': ' + context.raw.toFixed(1) + ' kg';
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Kilograms (kg)' }
            }
          }
        }
      });
    }

    // 2. Session Share Doughnut Chart
    var ctxSession = document.getElementById('nfSessionPieChart');
    if (ctxSession) {
      if (sessionChartInstance) sessionChartInstance.destroy();

      var sessionTotals = {};
      rows.forEach(function (r) {
        var sName = r.session_name || 'Other';
        sessionTotals[sName] = (sessionTotals[sName] || 0) + toNumber(r.quantity_consumed_kg);
      });

      var sLabels = Object.keys(sessionTotals);
      var sValues = Object.values(sessionTotals);

      sessionChartInstance = new Chart(ctxSession.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: sLabels,
          datasets: [{
            data: sValues,
            backgroundColor: ['#234830', '#4c8c63', '#e2a63b', '#2e6e8e'],
            borderWidth: 2
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

      var summaryEl = document.getElementById('nfSessionSummary');
      if (summaryEl) {
        summaryEl.textContent = 'Highest demand: ' + (sLabels[0] || 'N/A');
      }
    }
  }

  function renderTable(rows) {
    tableBody.innerHTML = '';
    logCountBadge.textContent = rows.length + (rows.length === 1 ? ' record' : ' records');

    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      var prepared = toNumber(row.quantity_prepared_kg);
      var consumed = toNumber(row.quantity_consumed_kg);
      var surplus = toNumber(row.surplus_kg);

      var statusBadge = '';
      if (surplus > 5) {
        statusBadge = '<span class="nf-badge nf-badge-warning"><i class="bi bi-exclamation-triangle"></i> Surplus ' + surplus.toFixed(1) + 'kg</span>';
      } else if (surplus < 0) {
        statusBadge = '<span class="nf-badge nf-badge-danger"><i class="bi bi-dash-circle"></i> Shortage</span>';
      } else {
        statusBadge = '<span class="nf-badge nf-badge-success"><i class="bi bi-check-circle"></i> Balanced</span>';
      }

      tr.innerHTML = '<td><strong>' + (row.date || '—') + '</strong></td>' +
        '<td><span class="nf-badge nf-badge-neutral">' + (row.session_name || '—') + '</span></td>' +
        '<td><strong style="color: var(--nf-green-900);">' + (row.item_name || '—') + '</strong></td>' +
        '<td>' + prepared.toFixed(1) + ' kg</td>' +
        '<td>' + consumed.toFixed(1) + ' kg</td>' +
        '<td><strong style="color: ' + (surplus > 0 ? 'var(--nf-warning)' : 'inherit') + ';">' + surplus.toFixed(1) + ' kg</strong></td>' +
        '<td>' + (row.headcount || '—') + '</td>' +
        '<td>' + statusBadge + '</td>';

      tableBody.appendChild(tr);
    });
  }

  function destroyCharts() {
    if (demandChartInstance) {
      demandChartInstance.destroy();
      demandChartInstance = null;
    }
    if (sessionChartInstance) {
      sessionChartInstance.destroy();
      sessionChartInstance = null;
    }
  }

  function resetStats() {
    statPrepared.innerHTML = '—<span class="unit">kg</span>';
    statConsumed.innerHTML = '—<span class="unit">kg</span>';
    statSurplus.innerHTML = '—<span class="unit">kg</span>';
    statHeadcount.textContent = '—';
    surplusRateLabel.textContent = '0% Surplus Ratio';
  }

  function showStatus(type, message) {
    var alertClass = 'nf-alert-info';
    if (type === 'error') alertClass = 'nf-alert-error';
    if (type === 'empty') alertClass = 'nf-alert-warning';

    statusEl.innerHTML = '<div class="nf-alert ' + alertClass + '" style="margin-bottom: 20px;">' + message + '</div>';
  }

  function clearStatus() {
    statusEl.innerHTML = '';
  }

  function toNumber(value) {
    var n = parseFloat(value);
    return isNaN(n) ? 0 : n;
  }

  function getTodayDateString() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function formatDisplayDate(dateStr) {
    var parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
});