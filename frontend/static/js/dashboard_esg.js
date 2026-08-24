/* ==========================================================================
   NutriFlow — dashboard_esg.js
   Sustainability & ESG Lead Dashboard logic: Reporting-grade impact metrics, cumulative charts, time range filtering.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var currentRange = 'week';
  var allImpactRecords = [];
  var cumulativeCostChartInstance = null;
  var co2TrendChartInstance = null;
  var cumulativeMealsChartInstance = null;
  var shareChartInstance = null;

  initESGDashboard();

  function initESGDashboard() {
    setupTimeRangeButtons();
    loadImpactData();
  }

  function setupTimeRangeButtons() {
    var group = document.getElementById('esgTimeRangeBtnGroup');
    if (!group) return;

    var buttons = group.querySelectorAll('button');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        currentRange = btn.getAttribute('data-range') || 'week';
        processAndRenderMetrics();
      });
    });
  }

  function loadImpactData() {
    Promise.all([
      NutriFlow.apiFetch('/api/impact/summary/').then(function (r) { return r.json(); }),
      NutriFlow.apiFetch('/api/impact/records/').then(function (r) { return r.json(); })
    ]).then(function (results) {
      allImpactRecords = results[1].results || results[1] || [];
      processAndRenderMetrics();
    }).catch(function (err) {
      console.warn('Error loading ESG impact data:', err);
    });
  }

  function filterRecordsByRange(records, range) {
    if (range === 'all') return records;

    var now = new Date();
    var cutoff = new Date();

    if (range === 'week') {
      cutoff.setDate(now.getDate() - 7);
    } else if (range === 'month') {
      cutoff.setDate(now.getDate() - 30);
    } else if (range === 'term') {
      cutoff.setDate(now.getDate() - 120);
    }

    return records.filter(function (r) {
      var d = new Date(r.created_at || Date.now());
      return d >= cutoff;
    });
  }

  function processAndRenderMetrics() {
    var filtered = filterRecordsByRange(allImpactRecords, currentRange);

    var totalKg = 0;
    var totalCost = 0;
    var totalCo2 = 0;
    var totalWater = 0;
    var totalMeals = 0;
    var recipientTotals = {};

    filtered.forEach(function (r) {
      var kg = parseFloat(r.food_saved_kg || r.food_rescued_kg) || 0;
      var cost = parseFloat(r.cost_saved) || (kg * 90);
      var co2 = parseFloat(r.co2e_saved_kg || r.co2_offset_kg) || (kg * 2.5);
      var water = kg * 850; // embedded water ratio
      var meals = Math.round(kg * 2.5);

      totalKg += kg;
      totalCost += cost;
      totalCo2 += co2;
      totalWater += water;
      totalMeals += meals;

      var rName = r.recipient_name || 'Community Partner';
      recipientTotals[rName] = (recipientTotals[rName] || 0) + kg;
    });

    // Update KPI Cards
    var costEl = document.getElementById('esgStatCost');
    var co2El = document.getElementById('esgStatCo2');
    var treesEl = document.getElementById('esgStatTrees');
    var waterEl = document.getElementById('esgStatWater');
    var mealsEl = document.getElementById('esgStatMeals');

    if (costEl) costEl.textContent = NutriFlow.formatCurrency(totalCost);
    if (co2El) co2El.innerHTML = totalCo2.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' <span class="unit">kg CO₂e</span>';

    var trees = (totalCo2 / 21.77).toFixed(0);
    if (treesEl) treesEl.innerHTML = '<i class="bi bi-tree-fill"></i> ≈ ' + trees + ' trees equivalent';

    if (waterEl) {
      var waterM = (totalWater / 1000000).toFixed(1);
      waterEl.innerHTML = (totalWater >= 1000000 ? (waterM + 'M') : totalWater.toLocaleString('en-IN', { maximumFractionDigits: 0 })) + ' <span class="unit">L</span>';
    }

    if (mealsEl) mealsEl.innerHTML = totalMeals.toLocaleString('en-IN') + ' <span class="unit">meals</span>';

    renderCumulativeCostChart(filtered);
    renderCo2TrendChart(filtered);
    renderCumulativeMealsChart(filtered);
    renderShareChart(recipientTotals);
    renderAuditTable(filtered);
  }

  function renderCumulativeCostChart(records) {
    var ctx = document.getElementById('esgCumulativeChart');
    if (!ctx) return;

    if (cumulativeCostChartInstance) cumulativeCostChartInstance.destroy();

    var sorted = records.slice().sort(function (a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });

    var labels = [];
    var dataCost = [];
    var cumCost = 0;

    sorted.forEach(function (r, idx) {
      var d = new Date(r.created_at);
      var label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' (' + (r.food_name || 'Rescue #' + (idx + 1)) + ')';
      cumCost += parseFloat(r.cost_saved || 0);
      labels.push(label);
      dataCost.push(cumCost);
    });

    if (sorted.length === 0) {
      labels = ['No Data Available'];
      dataCost = [0];
    }

    cumulativeCostChartInstance = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Cumulative Cost Saved (₹)',
            data: dataCost,
            borderColor: '#7A1C1C',
            backgroundColor: 'rgba(122, 28, 28, 0.12)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#7A1C1C',
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 750, easing: 'easeInOutQuart' },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, font: { family: 'Plus Jakarta Sans', size: 12 } } },
          tooltip: {
            callbacks: {
              label: function (context) {
                return ' Cumulative Saved: ' + NutriFlow.formatCurrency(context.parsed.y);
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0, 0, 0, 0.05)', drawBorder: false },
            title: { display: true, text: 'Financial Value (₹)', font: { family: 'Plus Jakarta Sans', size: 11 } }
          }
        }
      }
    });
  }

  function renderCo2TrendChart(records) {
    var ctx = document.getElementById('esgCo2TrendChart');
    if (!ctx) return;

    if (co2TrendChartInstance) co2TrendChartInstance.destroy();

    var sorted = records.slice().sort(function (a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });

    var labels = [];
    var dataCo2 = [];

    sorted.forEach(function (r, idx) {
      var d = new Date(r.created_at);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      dataCo2.push(parseFloat(r.co2e_saved_kg || r.co2_offset_kg || 0));
    });

    if (sorted.length === 0) {
      labels = ['No Data'];
      dataCo2 = [0];
    }

    co2TrendChartInstance = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'CO₂e Avoided per Dispatch (kg)',
          data: dataCo2,
          borderColor: '#C06C2F',
          backgroundColor: 'rgba(192, 108, 47, 0.12)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#C06C2F',
          pointRadius: 4
        }]
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
                return ' CO₂e Avoided: ' + context.parsed.y.toFixed(1) + ' kg CO₂e';
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0, 0, 0, 0.05)', drawBorder: false },
            title: { display: true, text: 'kg CO₂e', font: { family: 'Plus Jakarta Sans', size: 11 } }
          }
        }
      }
    });
  }

  function renderCumulativeMealsChart(records) {
    var ctx = document.getElementById('esgCumulativeMealsChart');
    if (!ctx) return;

    if (cumulativeMealsChartInstance) cumulativeMealsChartInstance.destroy();

    var sorted = records.slice().sort(function (a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });

    var labels = [];
    var dataMeals = [];
    var cumKg = 0;

    sorted.forEach(function (r, idx) {
      var d = new Date(r.created_at);
      cumKg += parseFloat(r.food_saved_kg || r.food_rescued_kg || 0);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      dataMeals.push(Math.round(cumKg * 2.5));
    });

    if (sorted.length === 0) {
      labels = ['No Data'];
      dataMeals = [0];
    }

    cumulativeMealsChartInstance = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Cumulative Meals Redistributed',
          data: dataMeals,
          borderColor: '#4A7C66',
          backgroundColor: 'rgba(74, 124, 102, 0.15)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#4A7C66',
          pointRadius: 4
        }]
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
                return ' Cumulative Meals: ' + context.parsed.y.toLocaleString() + ' meals';
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0, 0, 0, 0.05)', drawBorder: false },
            title: { display: true, text: 'Meals Rescued', font: { family: 'Plus Jakarta Sans', size: 11 } }
          }
        }
      }
    });
  }

  function renderShareChart(recipientTotals) {
    var ctx = document.getElementById('esgShareChart');
    if (!ctx) return;

    if (shareChartInstance) shareChartInstance.destroy();

    var labels = Object.keys(recipientTotals);
    var values = Object.values(recipientTotals);

    if (labels.length === 0) {
      labels = ['No Completed Dispatches'];
      values = [1];
    }

    shareChartInstance = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: ['#7A1C1C', '#C06C2F', '#4A7C66', '#D97706', '#57534E'],
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
                return ' ' + context.label + ': ' + context.parsed.toFixed(1) + ' kg';
              }
            }
          }
        }
      }
    });
  }

  function renderAuditTable(records) {
    var tbody = document.getElementById('esgAuditTbody');
    if (!tbody) return;

    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No completed ESG impact records logged.</td></tr>';
      return;
    }

    var html = '';
    records.slice(0, 10).forEach(function (r) {
      var dStr = r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : 'Today';
      var kg = parseFloat(r.food_saved_kg || 0);
      var cost = parseFloat(r.cost_saved || (kg * 90));
      var co2 = parseFloat(r.co2e_saved_kg || (kg * 2.5));
      var water = kg * 850;

      html += '<tr>' +
                '<td>' + dStr + '</td>' +
                '<td><strong>' + (r.recipient_name || 'Verified NGO') + '</strong></td>' +
                '<td>' + kg.toFixed(1) + ' kg</td>' +
                '<td>' + NutriFlow.formatCurrency(cost) + '</td>' +
                '<td>' + co2.toFixed(1) + ' kg</td>' +
                '<td>' + water.toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' L</td>' +
              '</tr>';
    });

    tbody.innerHTML = html;
  }
});
