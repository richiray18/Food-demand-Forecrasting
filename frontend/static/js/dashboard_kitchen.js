/* ==========================================================================
   NutriFlow — dashboard_kitchen.js
   Kitchen Staff Dashboard logic: ML batch prep predictions, quick log form, recent entries.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var sessionsMap = {};
  var itemsMap = {};
  var todayStr = new Date().toISOString().split('T')[0];

  // Set default date to today
  var dateInput = document.getElementById('kitchLogDate');
  if (dateInput) dateInput.value = todayStr;

  var cachedSessions = [];
  var cachedItems = [];

  initKitchenDashboard();

  function initKitchenDashboard() {
    loadDropdownsAndForecasts();
    loadRecentLogs();
    setupQuickLogForm();

    // Periodic dashboard refresh cycle (every 60s)
    setInterval(refreshKitchenDashboard, 60000);
  }

  function refreshKitchenDashboard() {
    if (cachedSessions.length > 0 && cachedItems.length > 0) {
      fetchTodayForecasts(cachedSessions, cachedItems);
    } else {
      loadDropdownsAndForecasts();
    }
    loadRecentLogs();
  }

  function loadDropdownsAndForecasts() {
    Promise.all([
      NutriFlow.apiFetch('/api/v1/meals/sessions/').then(function (r) { return r.json(); }),
      NutriFlow.apiFetch('/api/v1/meals/items/').then(function (r) { return r.json(); })
    ]).then(function (results) {
      var sessions = results[0].results || results[0] || [];
      var items = results[1].results || results[1] || [];

      cachedSessions = sessions;
      cachedItems = items;

      var sessionSelect = document.getElementById('kitchLogSession');
      var itemSelect = document.getElementById('kitchLogItem');

      if (sessionSelect) {
        sessionSelect.innerHTML = '<option value="">Select Session...</option>';
        sessions.forEach(function (s) {
          sessionsMap[s.id] = s.name;
          sessionSelect.innerHTML += '<option value="' + s.id + '">' + s.name + ' (' + s.start_time.substring(0,5) + ')</option>';
        });
      }

      if (itemSelect) {
        itemSelect.innerHTML = '<option value="">Select Dish Item...</option>';
        items.forEach(function (it) {
          itemsMap[it.id] = it.name;
          itemSelect.innerHTML += '<option value="' + it.id + '">' + it.name + ' (' + it.category + ')</option>';
        });
      }

      // Fetch sample forecasts for today's sessions
      fetchTodayForecasts(sessions, items);
    }).catch(function (err) {
      console.warn('Failed loading dropdowns for kitchen dashboard:', err);
      var targetEl = document.getElementById('kitchStatTarget');
      if (targetEl) targetEl.innerHTML = '—<span class="unit">kg</span>';
    });
  }

  function fetchTodayForecasts(sessions, items) {
    var container = document.getElementById('kitchForecastCardsRow');
    var targetEl = document.getElementById('kitchStatTarget');

    if (!sessions || sessions.length === 0 || !items || items.length === 0) {
      console.warn('[KitchenDashboard] No active meal sessions or items found for today.');
      if (container) {
        container.innerHTML = '<div class="col-12"><div class="alert alert-info">No active meal sessions found.</div></div>';
      }
      if (targetEl) {
        targetEl.innerHTML = '—<span class="unit">kg</span>';
      }
      return;
    }

    var promises = [];
    var sessionsToFetch = sessions.slice(0, 3);
    var sampleItem = items[0];

    sessionsToFetch.forEach(function (s) {
      var url = '/api/forecasting/predict/?item_id=' + encodeURIComponent(sampleItem.id) +
                '&session_id=' + encodeURIComponent(s.id) +
                '&date=' + encodeURIComponent(todayStr);
      promises.push(
        NutriFlow.apiFetch(url)
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (data) {
            return { session: s, item: sampleItem, predict: data };
          })
          .catch(function (err) {
            console.warn('[KitchenDashboard] Prediction fetch failed for session ' + s.name + ':', err);
            return null;
          })
      );
    });

    Promise.all(promises).then(function (results) {
      var list = results.filter(function (entry) { return entry !== null && entry.predict; });

      // Sanity check if the forecast array is empty for the day
      if (list.length === 0) {
        console.warn('[KitchenDashboard] Forecast array is empty for today; no predictions resolved.');
        if (container) {
          container.innerHTML = '<div class="col-12"><div class="alert alert-warning">No AI forecast predictions available for today.</div></div>';
        }
        if (targetEl) {
          targetEl.innerHTML = '—<span class="unit">kg</span>';
        }
        return;
      }

      var totalTargetKg = 0;
      var hasValidNumber = false;
      var html = '';

      list.forEach(function (entry) {
        var p = entry.predict || {};
        var prepVal = null;

        if (p.recommended_quantity_prepared_kg != null && !isNaN(parseFloat(p.recommended_quantity_prepared_kg))) {
          prepVal = parseFloat(p.recommended_quantity_prepared_kg);
        } else if (p.recommended_prep_kg != null && !isNaN(parseFloat(p.recommended_prep_kg))) {
          prepVal = parseFloat(p.recommended_prep_kg);
        } else if (p.recommended_kg != null && !isNaN(parseFloat(p.recommended_kg))) {
          prepVal = parseFloat(p.recommended_kg);
        } else if (p.predicted_quantity_kg != null && !isNaN(parseFloat(p.predicted_quantity_kg))) {
          prepVal = parseFloat(p.predicted_quantity_kg);
        } else if (p.baseline_kg != null && !isNaN(parseFloat(p.baseline_kg))) {
          prepVal = parseFloat(p.baseline_kg);
        }

        if (prepVal !== null && !isNaN(prepVal)) {
          totalTargetKg += prepVal;
          hasValidNumber = true;
        }

        var prepDisplay = (prepVal !== null ? prepVal : 45.0).toFixed(1);
        var consVal = (p.predicted_consumption_kg != null && !isNaN(parseFloat(p.predicted_consumption_kg)))
          ? parseFloat(p.predicted_consumption_kg)
          : (parseFloat(prepDisplay) * 0.9);
        var consDisplay = consVal.toFixed(1);

        html += '<div class="col-md-4">' +
                  '<div style="background: var(--nf-surface); border: 1px solid var(--nf-border); border-radius: var(--nf-radius-md); padding: 16px; border-left: 4px solid var(--nf-brand-primary);">' +
                    '<div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--nf-brand-primary); margin-bottom: 4px;">' + entry.session.name + ' Session</div>' +
                    '<div style="font-size: 16px; font-weight: 800; color: var(--nf-ink-900); margin-bottom: 8px;">' + entry.item.name + '</div>' +
                    '<div style="display: flex; justify-content: space-between; align-items: flex-end;">' +
                      '<div>' +
                        '<div style="font-size: 11px; color: var(--nf-ink-600);">Rec. Prep Batch</div>' +
                        '<div style="font-family: var(--nf-font-display); font-size: 24px; font-weight: 800; color: var(--nf-brand-primary);">' + prepDisplay + ' <span style="font-size: 14px;">kg</span></div>' +
                      '</div>' +
                      '<div style="text-align: right;">' +
                        '<div style="font-size: 11px; color: var(--nf-ink-600);">Est. Intake</div>' +
                        '<div style="font-size: 15px; font-weight: 700; color: var(--nf-accent-amber);">' + consDisplay + ' kg</div>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                '</div>';
      });

      if (container) {
        container.innerHTML = html;
      }

      // Update #kitchStatTarget with computed total and preserve unit span
      if (targetEl) {
        if (hasValidNumber) {
          targetEl.innerHTML = totalTargetKg.toFixed(1) + '<span class="unit">kg</span>';
        } else {
          console.warn('[KitchenDashboard] Forecast results resolved without numerical prep targets.');
          targetEl.innerHTML = '—<span class="unit">kg</span>';
        }
      }
    }).catch(function (err) {
      console.warn('[KitchenDashboard] Error resolving today forecasts:', err);
      if (targetEl) {
        targetEl.innerHTML = '—<span class="unit">kg</span>';
      }
    });
  }

  var kitchPrepChartInstance = null;
  var kitchSurplusChartInstance = null;

  function loadRecentLogs() {
    // Fetch aggregated summary for today's KPI metrics
    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/summary/')
      .then(function (res) { return res.json(); })
      .then(function (summary) {
        var prepEl = document.getElementById('kitchStatPrepared');
        var hcEl = document.getElementById('kitchStatHeadcount');
        var surEl = document.getElementById('kitchStatSurplus');

        if (prepEl) prepEl.innerHTML = (parseFloat(summary.prepared_today) || 0).toFixed(1) + '<span class="unit">kg</span>';
        if (hcEl) hcEl.innerHTML = (parseInt(summary.headcount_served, 10) || 0).toLocaleString();
        if (surEl) surEl.innerHTML = (parseFloat(summary.surplus_generated) || 0).toFixed(1) + '<span class="unit">kg</span>';
      })
      .catch(function (err) {
        console.warn('Error loading summary stats:', err);
      });

    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var logs = data.results || data || [];
        renderLogsTableAndStats(logs);
        renderKitchenCharts(logs);
      })
      .catch(function (err) {
        console.warn('Error loading consumption logs:', err);
      });
  }

  function renderLogsTableAndStats(logs) {
    var tbody = document.getElementById('kitchRecentLogsTbody');
    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">No meal prep logs logged yet today.</td></tr>';
      return;
    }

    var html = '';
    logs.slice(0, 8).forEach(function (log) {
      var prep = parseFloat(log.quantity_prepared_kg) || 0;
      var cons = parseFloat(log.quantity_consumed_kg) || 0;
      var surplus = Math.max(0, prep - cons);

      var sName = log.session_name || sessionsMap[log.session] || 'Session ' + log.session;
      var iName = log.item_name || itemsMap[log.item] || 'Item ' + log.item;

      html += '<tr>' +
                '<td>' + log.date + '</td>' +
                '<td><span class="nf-badge nf-badge-amber">' + sName + '</span></td>' +
                '<td><strong>' + iName + '</strong></td>' +
                '<td>' + prep.toFixed(1) + ' kg</td>' +
                '<td>' + cons.toFixed(1) + ' kg</td>' +
                '<td><span class="nf-badge ' + (surplus > 0 ? 'nf-badge-coral' : 'nf-badge-teal') + '">' + surplus.toFixed(1) + ' kg surplus</span></td>' +
              '</tr>';
    });

    tbody.innerHTML = html;
  }

  function renderKitchenCharts(logs) {
    if (!logs || logs.length === 0) return;

    // Group logs by date to compute daily prep, consumed, and surplus
    var dateMap = {};
    logs.forEach(function (l) {
      var d = l.date || 'Today';
      if (!dateMap[d]) {
        dateMap[d] = { prep: 0, cons: 0, surplus: 0 };
      }
      var p = parseFloat(l.quantity_prepared_kg) || 0;
      var c = parseFloat(l.quantity_consumed_kg) || 0;
      dateMap[d].prep += p;
      dateMap[d].cons += c;
      dateMap[d].surplus += Math.max(0, p - c);
    });

    var dates = Object.keys(dateMap).sort().slice(-14);
    var prepData = dates.map(function (d) { return dateMap[d].prep; });
    var consData = dates.map(function (d) { return dateMap[d].cons; });
    var surplusData = dates.map(function (d) { return dateMap[d].surplus; });

    // Chart 1: Prepared vs Consumed (Bar Chart)
    var ctxPrep = document.getElementById('kitchPrepVsConsumedChart');
    if (ctxPrep) {
      if (kitchPrepChartInstance) kitchPrepChartInstance.destroy();

      kitchPrepChartInstance = new Chart(ctxPrep.getContext('2d'), {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [
            {
              label: 'Prepared (kg)',
              data: prepData,
              backgroundColor: '#7A1C1C',
              borderRadius: 6,
              borderSkipped: false
            },
            {
              label: 'Consumed (kg)',
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
    }

    // Chart 2: Daily Surplus Trend (Line Chart)
    var ctxSurplus = document.getElementById('kitchSurplusTrendChart');
    if (ctxSurplus) {
      if (kitchSurplusChartInstance) kitchSurplusChartInstance.destroy();

      kitchSurplusChartInstance = new Chart(ctxSurplus.getContext('2d'), {
        type: 'line',
        data: {
          labels: dates,
          datasets: [
            {
              label: 'Surplus Generated (kg)',
              data: surplusData,
              borderColor: '#C06C2F',
              backgroundColor: 'rgba(192, 108, 47, 0.12)',
              fill: true,
              tension: 0.35,
              pointBackgroundColor: '#7A1C1C',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              pointRadius: 5,
              pointHoverRadius: 7
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 750, easing: 'easeInOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return ' Surplus Gap: ' + context.parsed.y.toFixed(1) + ' kg';
                }
              }
            }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0, 0, 0, 0.05)', drawBorder: false },
              title: { display: true, text: 'Surplus Gap (kg)', font: { family: 'Plus Jakarta Sans', size: 11 } }
            }
          }
        }
      });
    }
  }

  function setupQuickLogForm() {
    var form = document.getElementById('kitchQuickLogForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var date = document.getElementById('kitchLogDate').value;
      var session = document.getElementById('kitchLogSession').value;
      var item = document.getElementById('kitchLogItem').value;
      var prep = document.getElementById('kitchLogPrepared').value;
      var cons = document.getElementById('kitchLogConsumed').value;
      var headcount = document.getElementById('kitchLogHeadcount').value;
      var notes = document.getElementById('kitchLogNotes').value;

      if (!date || !session || !item || !prep || !cons) {
        NutriFlow.showAlert('warning', 'Please fill in all required meal preparation fields.', 'nfMessages');
        return;
      }

      var btn = document.getElementById('kitchSubmitLogBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving Log...';

      var payload = {
        date: date,
        session: parseInt(session),
        item: parseInt(item),
        quantity_prepared_kg: parseFloat(prep),
        quantity_consumed_kg: parseFloat(cons),
        headcount: headcount ? parseInt(headcount) : 0,
        notes: notes || ''
      };

      NutriFlow.apiFetch('/api/v1/meals/consumption-logs/', {
        method: 'POST',
        body: payload
      })
      .then(function (res) {
        if (!res.ok) {
          return NutriFlow.parseApiError(res, 'Failed to save consumption log entry.').then(function (errMsg) {
            throw new Error(errMsg);
          });
        }
        return res.json();
      })
      .then(function () {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Save Session Prep Entry';
        NutriFlow.showAlert('success', 'Meal preparation log saved successfully!', 'nfMessages');
        document.getElementById('kitchLogPrepared').value = '';
        document.getElementById('kitchLogConsumed').value = '';
        document.getElementById('kitchLogHeadcount').value = '';
        document.getElementById('kitchLogNotes').value = '';
        loadRecentLogs();
        refreshKitchenDashboard();
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Save Session Prep Entry';
        NutriFlow.showAlert('error', err.message || 'Failed to save consumption log entry.', 'nfMessages');
      });
    });
  }
});
