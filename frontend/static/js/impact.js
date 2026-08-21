/* ==========================================================================
   NutriFlow — impact.js
   Manages sustainability analytics, environmental equivalencies, and audit ledger.
   Endpoints:
     GET /api/impact/summary/
     GET /api/impact/records/
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var statRescued = document.getElementById('impStatRescued');
  var portionsSub = document.getElementById('impPortionsSub');
  var statSavings = document.getElementById('impStatSavings');
  var statCarbon = document.getElementById('impStatCarbon');
  var statRecipients = document.getElementById('impStatRecipients');
  var pickupsSub = document.getElementById('impPickupsSub');

  var ecoTrees = document.getElementById('ecoTrees');
  var ecoCarKm = document.getElementById('ecoCarKm');
  var ecoWater = document.getElementById('ecoWater');

  var tableBody = document.getElementById('impTableBody');
  var listStatus = document.getElementById('impListStatus');
  var ledgerBadge = document.getElementById('impLedgerBadge');

  var trendChartInstance = null;
  var recipientChartInstance = null;

  // Initialize
  loadImpactSummary();
  loadImpactRecords();

  function loadImpactSummary() {
    NutriFlow.apiFetch('/api/impact/summary/')
      .then(function (r) { return r.json(); })
      .then(function (summary) {
        var foodKg = parseFloat(summary.food_rescued_kg) || 0;
        var costSaved = parseFloat(summary.estimated_savings) || 0;
        var pickupsCount = parseInt(summary.pickups_completed, 10) || 0;
        var recipientCount = parseInt(summary.recipient_count, 10) || 0;

        // Approx 2.5 kg CO2e per kg cooked food
        var carbonSaved = foodKg * 2.5;

        // Render Hero KPIs
        statRescued.innerHTML = foodKg.toFixed(1) + '<span class="unit">kg</span>';
        var mealsCount = Math.round(foodKg * 2.5);
        portionsSub.textContent = '≈ ' + mealsCount.toLocaleString() + ' meals served to communities';

        statSavings.textContent = NutriFlow.formatCurrency(costSaved);
        statCarbon.innerHTML = carbonSaved.toFixed(1) + '<span class="unit">kg</span>';

        statRecipients.textContent = recipientCount.toString();
        pickupsSub.textContent = 'via ' + pickupsCount + ' completed pickups';

        // Render Environmental Equivalencies
        // 1 mature tree absorbs ~21.77 kg CO2 / year
        var treesVal = (carbonSaved / 21.77).toFixed(1);
        ecoTrees.textContent = treesVal + ' trees';

        // Average passenger vehicle emits ~0.192 kg CO2 / km
        var carKmVal = Math.round(carbonSaved / 0.192);
        ecoCarKm.textContent = carKmVal.toLocaleString() + ' km';

        // Average embedded water ~850 Litres / kg of cooked diet
        var waterL = Math.round(foodKg * 850);
        ecoWater.textContent = waterL.toLocaleString() + ' L';
      })
      .catch(function (err) {
        console.error('Failed to load impact summary:', err);
      });
  }

  function loadImpactRecords() {
    listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-ink-400); font-size: 13.5px;"><i class="bi bi-hourglass-split"></i> Loading verified impact ledger...</div>';

    NutriFlow.apiFetch('/api/impact/records/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listStatus.innerHTML = '';
        var records = Array.isArray(data) ? data : (data.results || []);

        ledgerBadge.textContent = records.length + (records.length === 1 ? ' entry' : ' entries');

        if (records.length === 0) {
          tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--nf-ink-400); padding: 36px;">No completed pickup impact records yet. Complete pickups in the logistics tab to log impact.</td></tr>';
          renderFallbackCharts();
          return;
        }

        renderLedgerTable(records);
        renderCharts(records);
      })
      .catch(function (err) {
        listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-danger); font-size: 13.5px;">Error loading records: ' + err.message + '</div>';
        renderFallbackCharts();
      });
  }

  function renderLedgerTable(records) {
    tableBody.innerHTML = '';

    records.forEach(function (rec) {
      var tr = document.createElement('tr');
      var foodKg = parseFloat(rec.food_saved_kg) || 0;
      var cost = parseFloat(rec.cost_saved) || 0;
      var co2 = parseFloat(rec.co2e_saved_kg) || 0;

      var dateFormatted = rec.created_at ? formatRecordDate(rec.created_at) : 'Recent';

      tr.innerHTML = '<td><strong>' + dateFormatted + '</strong></td>' +
        '<td><strong style="color: var(--nf-green-900);">' + (rec.recipient_name || 'Partner NGO') + '</strong></td>' +
        '<td>' + (rec.food_name || 'Surplus Meal Batch') + '</td>' +
        '<td><strong style="color: var(--nf-green-700); font-family: var(--nf-font-mono);">' + foodKg.toFixed(1) + ' kg</strong></td>' +
        '<td><strong style="color: var(--nf-amber-600); font-family: var(--nf-font-mono);">' + NutriFlow.formatCurrency(cost) + '</strong></td>' +
        '<td><span style="font-family: var(--nf-font-mono); font-weight: 600;">' + co2.toFixed(1) + ' kg CO₂e</span></td>' +
        '<td><span class="nf-badge nf-badge-success"><i class="bi bi-shield-check"></i> Handover Verified</span></td>';

      tableBody.appendChild(tr);
    });
  }

  function renderCharts(records) {
    // 1. Cumulative Rescue Trend Line
    var ctxTrend = document.getElementById('impTrendChart');
    if (ctxTrend) {
      if (trendChartInstance) trendChartInstance.destroy();

      var reversed = records.slice(0, 10).reverse();
      var labels = reversed.map(function (r, i) {
        return r.created_at ? formatRecordDate(r.created_at) : ('Dispatch #' + (i + 1));
      });

      var cumKg = 0;
      var kgTrend = reversed.map(function (r) {
        cumKg += parseFloat(r.food_saved_kg) || 0;
        return cumKg;
      });

      var cumCost = 0;
      var costTrend = reversed.map(function (r) {
        cumCost += parseFloat(r.cost_saved) || 0;
        return cumCost;
      });

      trendChartInstance = new Chart(ctxTrend.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Cumulative Rescued (kg)',
              data: kgTrend,
              borderColor: '#3c8a5b',
              backgroundColor: 'rgba(60, 138, 91, 0.1)',
              yAxisID: 'yKg',
              fill: true,
              tension: 0.3
            },
            {
              label: 'Cumulative Cost Saved (₹)',
              data: costTrend,
              borderColor: '#e2a63b',
              backgroundColor: 'rgba(226, 166, 59, 0.05)',
              yAxisID: 'yCost',
              fill: false,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            yKg: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: 'kg Rescued' }
            },
            yCost: {
              type: 'linear',
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: '₹ Saved' }
            }
          }
        }
      });
    }

    // 2. Recipient Distribution Doughnut
    var ctxRecip = document.getElementById('impRecipientChart');
    if (ctxRecip) {
      if (recipientChartInstance) recipientChartInstance.destroy();

      var recipTotals = {};
      records.forEach(function (r) {
        var name = r.recipient_name || 'Community Shelter';
        recipTotals[name] = (recipTotals[name] || 0) + (parseFloat(r.food_saved_kg) || 0);
      });

      recipientChartInstance = new Chart(ctxRecip.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: Object.keys(recipTotals),
          datasets: [{
            data: Object.values(recipTotals),
            backgroundColor: ['#234830', '#4c8c63', '#e2a63b', '#2e6e8e', '#c4442e']
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
    var ctxTrend = document.getElementById('impTrendChart');
    if (ctxTrend && !trendChartInstance) {
      trendChartInstance = new Chart(ctxTrend.getContext('2d'), {
        type: 'line',
        data: {
          labels: ['Dispatch 1', 'Dispatch 2', 'Dispatch 3', 'Dispatch 4'],
          datasets: [{
            label: 'Cumulative Rescued (kg)',
            data: [15, 38, 72, 110],
            borderColor: '#3c8a5b',
            backgroundColor: 'rgba(60, 138, 91, 0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }

    var ctxRecip = document.getElementById('impRecipientChart');
    if (ctxRecip && !recipientChartInstance) {
      recipientChartInstance = new Chart(ctxRecip.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['City Food Bank', 'Youth Shelter', 'Community Kitchen'],
          datasets: [{
            data: [45, 35, 20],
            backgroundColor: ['#234830', '#4c8c63', '#e2a63b']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }
  }

  function formatRecordDate(isoStr) {
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
});
