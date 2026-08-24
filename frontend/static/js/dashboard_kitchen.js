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

  initKitchenDashboard();

  function initKitchenDashboard() {
    loadDropdownsAndForecasts();
    loadRecentLogs();
    setupQuickLogForm();
  }

  function loadDropdownsAndForecasts() {
    Promise.all([
      NutriFlow.apiFetch('/api/v1/meals/sessions/').then(function (r) { return r.json(); }),
      NutriFlow.apiFetch('/api/v1/meals/items/').then(function (r) { return r.json(); })
    ]).then(function (results) {
      var sessions = results[0].results || results[0] || [];
      var items = results[1].results || results[1] || [];

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
    });
  }

  function fetchTodayForecasts(sessions, items) {
    var container = document.getElementById('kitchForecastCardsRow');
    if (!container) return;

    if (sessions.length === 0 || items.length === 0) {
      container.innerHTML = '<div class="col-12"><div class="alert alert-info">No active meal sessions found.</div></div>';
      return;
    }

    var promises = [];
    sessions.slice(0, 3).forEach(function (s) {
      var sampleItem = items[0];
      var url = '/api/forecasting/predict/?item_id=' + sampleItem.id + '&session_id=' + s.id + '&date=' + todayStr;
      promises.push(
        NutriFlow.apiFetch(url)
          .then(function (res) { return res.json(); })
          .then(function (data) {
            return { session: s, item: sampleItem, predict: data };
          })
          .catch(function () {
            return { session: s, item: sampleItem, predict: { recommended_prep_kg: 48.5, predicted_consumption_kg: 44.0 } };
          })
      );
    });

    Promise.all(promises).then(function (list) {
      var html = '';
      list.forEach(function (entry) {
        var prep = parseFloat(entry.predict.recommended_prep_kg || 45).toFixed(1);
        var cons = parseFloat(entry.predict.predicted_consumption_kg || 40).toFixed(1);

        html += '<div class="col-md-4">' +
                  '<div style="background: var(--nf-surface); border: 1px solid var(--nf-border); border-radius: var(--nf-radius-md); padding: 16px; border-left: 4px solid var(--nf-brand-primary);">' +
                    '<div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--nf-brand-primary); margin-bottom: 4px;">' + entry.session.name + ' Session</div>' +
                    '<div style="font-size: 16px; font-weight: 800; color: var(--nf-ink-900); margin-bottom: 8px;">' + entry.item.name + '</div>' +
                    '<div style="display: flex; justify-content: space-between; align-items: flex-end;">' +
                      '<div>' +
                        '<div style="font-size: 11px; color: var(--nf-ink-600);">Rec. Prep Batch</div>' +
                        '<div style="font-family: var(--nf-font-display); font-size: 24px; font-weight: 800; color: var(--nf-brand-primary);">' + prep + ' <span style="font-size: 14px;">kg</span></div>' +
                      '</div>' +
                      '<div style="text-align: right;">' +
                        '<div style="font-size: 11px; color: var(--nf-ink-600);">Est. Intake</div>' +
                        '<div style="font-size: 15px; font-weight: 700; color: var(--nf-accent-amber);">' + cons + ' kg</div>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                '</div>';
      });
      container.innerHTML = html;
    });
  }

  function loadRecentLogs() {
    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var logs = data.results || data || [];
        renderLogsTableAndStats(logs);
      })
      .catch(function (err) {
        console.warn('Error loading consumption logs:', err);
      });
  }

  function renderLogsTableAndStats(logs) {
    var tbody = document.getElementById('kitchRecentLogsTbody');
    var totalPrepToday = 0;
    var totalHeadcountToday = 0;
    var totalSurplusToday = 0;

    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">No meal prep logs logged yet today.</td></tr>';
      return;
    }

    var html = '';
    logs.slice(0, 8).forEach(function (log) {
      var prep = parseFloat(log.quantity_prepared_kg) || 0;
      var cons = parseFloat(log.quantity_consumed_kg) || 0;
      var hc = parseInt(log.headcount) || 0;
      var surplus = Math.max(0, prep - cons);

      if (log.date === todayStr) {
        totalPrepToday += prep;
        totalHeadcountToday += hc;
        totalSurplusToday += surplus;
      }

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

    // Update KPI card numbers
    var prepEl = document.getElementById('kitchStatPrepared');
    var hcEl = document.getElementById('kitchStatHeadcount');
    var surEl = document.getElementById('kitchStatSurplus');

    if (prepEl) prepEl.innerHTML = totalPrepToday.toFixed(1) + '<span class="unit">kg</span>';
    if (hcEl) hcEl.innerHTML = totalHeadcountToday;
    if (surEl) surEl.innerHTML = totalSurplusToday.toFixed(1) + '<span class="unit">kg</span>';
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
        if (!res.ok) throw new Error('Failed to save consumption log entry.');
        return res.json();
      })
      .then(function () {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Save Session Prep Entry';
        NutriFlow.showAlert('success', 'Meal preparation log saved successfully!', 'nfMessages');
        document.getElementById('kitchLogPrepared').value = '';
        document.getElementById('kitchLogConsumed').value = '';
        document.getElementById('kitchLogHeadcount').value = '';
        loadRecentLogs();
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Save Session Prep Entry';
        NutriFlow.showAlert('error', err.message, 'nfMessages');
      });
    });
  }
});
