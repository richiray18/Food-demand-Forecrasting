/* ==========================================================================
   NutriFlow — dashboard.js
   Fetches today's meal consumption logs and renders stats + table.
   Endpoint: GET /meals/consumption-logs/?date=YYYY-MM-DD
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var API_BASE = 'http://127.0.0.1:8000/api/v1/';
  var LOGIN_URL = '../accounts/login.html';

  var todayDateEl = document.getElementById('nfTodayDate');
  var statusEl = document.getElementById('nfDashboardStatus');
  var tableCard = document.getElementById('nfTableCard');
  var tableBody = document.getElementById('nfLogsTableBody');

  var statPrepared = document.getElementById('nfStatPrepared');
  var statConsumed = document.getElementById('nfStatConsumed');
  var statSurplus = document.getElementById('nfStatSurplus');
  var statHeadcount = document.getElementById('nfStatHeadcount');

  var token = localStorage.getItem('access_token');

  if (!token) {
    window.location.href = LOGIN_URL;
    return;
  }

  var todayStr = getTodayDateString();
  todayDateEl.textContent = formatDisplayDate(todayStr);

  loadDashboard(todayStr);

  function loadDashboard(dateStr) {
    showStatus('loading', 'Loading today\'s meal data...');

    fetch(API_BASE + 'meals/consumption-logs/?date=' + encodeURIComponent(dateStr), {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    })
      .then(function (response) {
        if (response.status === 401) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = LOGIN_URL;
          return null;
        }

        if (!response.ok) {
          throw new Error('Request failed with status ' + response.status);
        }

        return response.json();
      })
      .then(function (data) {
        if (data === null) {
          return;
        }

        // Handles either a plain array response or a DRF-paginated
        // response with a "results" array, without assuming extra fields.
        var rows = Array.isArray(data) ? data : (data.results || []);

        if (rows.length === 0) {
          showStatus('empty', 'No meal data available for today.');
          tableCard.style.display = 'none';
          resetStats();
          return;
        }

        clearStatus();
        renderStats(rows);
        renderTable(rows);
        tableCard.style.display = 'block';
      })
      .catch(function (error) {
        showStatus('error', 'Unable to load dashboard data. Please try again. (' + error.message + ')');
        tableCard.style.display = 'none';
        resetStats();
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
    statHeadcount.textContent = totalHeadcount.toString();
  }

  function renderTable(rows) {
    tableBody.innerHTML = '';

    rows.forEach(function (row) {
      var tr = document.createElement('tr');

      tr.appendChild(makeCell(row.date));
      tr.appendChild(makeCell(row.session_name));
      tr.appendChild(makeCell(row.item_name));
      tr.appendChild(makeCell(toNumber(row.quantity_prepared_kg).toFixed(1)));
      tr.appendChild(makeCell(toNumber(row.quantity_consumed_kg).toFixed(1)));
      tr.appendChild(makeCell(toNumber(row.surplus_kg).toFixed(1)));
      tr.appendChild(makeCell(row.headcount));

      tableBody.appendChild(tr);
    });
  }

  function makeCell(value) {
    var td = document.createElement('td');
    td.textContent = (value === null || value === undefined) ? '—' : value;
    return td;
  }

  function resetStats() {
    statPrepared.innerHTML = '—<span class="unit">kg</span>';
    statConsumed.innerHTML = '—<span class="unit">kg</span>';
    statSurplus.innerHTML = '—<span class="unit">kg</span>';
    statHeadcount.textContent = '—';
  }

  function showStatus(type, message) {
    var alertClass = 'nf-alert-info';
    if (type === 'error') {
      alertClass = 'nf-alert-error';
    } else if (type === 'empty') {
      alertClass = 'nf-alert-warning';
    }

    statusEl.innerHTML = '<div class="nf-alert ' + alertClass + '">' + message + '</div>';
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
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
});