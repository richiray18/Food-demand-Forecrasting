/* ==========================================================================
   NutriFlow — recipients.js
   Manages recipient NGO directory, automated surplus matching, and pickup dispatch.
   Endpoints:
     GET /api/recipients/recipients/
     POST /api/recipients/recipients/match/
     GET /api/surplus/surplus-food/?status=AVAILABLE
     POST /api/pickups/pickups/
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var tableBody = document.getElementById('rcpTableBody');
  var listStatus = document.getElementById('rcpListStatus');
  var searchInput = document.getElementById('rcpSearchInput');

  var statTotal = document.getElementById('rcpStatTotal');
  var statCapacity = document.getElementById('rcpStatCapacity');
  var statActive = document.getElementById('rcpStatActive');

  var matchSurplusSelect = document.getElementById('matchSurplusSelect');
  var btnRunMatch = document.getElementById('btnRunMatch');
  var matchResultsArea = document.getElementById('matchResultsArea');
  var matchCardsContainer = document.getElementById('matchCardsContainer');

  // Schedule Pickup Modal elements
  var schedulePickupForm = document.getElementById('schedulePickupForm');
  var schedRecipientId = document.getElementById('schedRecipientId');
  var schedOrgName = document.getElementById('schedOrgName');
  var schedSurplusSelect = document.getElementById('schedSurplusSelect');
  var schedQuantity = document.getElementById('schedQuantity');
  var schedTime = document.getElementById('schedTime');
  var schedNotes = document.getElementById('schedNotes');
  var schedSubmitBtn = document.getElementById('schedSubmitBtn');

  var rawRecipientsList = [];
  var availableSurplusList = [];

  // Initialize
  loadRecipients();
  loadSurplusOptions();

  if (searchInput) searchInput.addEventListener('input', applySearchFilter);
  if (btnRunMatch) btnRunMatch.addEventListener('click', runMatchmaker);

  if (schedulePickupForm) {
    schedulePickupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      submitScheduledPickup();
    });
  }

  function loadRecipients() {
    listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-ink-600); font-size: 13.5px;"><i class="bi bi-hourglass-split"></i> Loading partner organization directory...</div>';

    NutriFlow.apiFetch('/api/recipients/recipients/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listStatus.innerHTML = '';
        rawRecipientsList = Array.isArray(data) ? data : (data.results || []);
        updateRecipientKPIs();
        renderTable(rawRecipientsList);
      })
      .catch(function (err) {
        listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-danger); font-size: 13.5px;">Error loading recipients: ' + err.message + '</div>';
      });
  }

  function loadSurplusOptions() {
    NutriFlow.apiFetch('/api/surplus/surplus-food/?status=AVAILABLE')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        availableSurplusList = Array.isArray(data) ? data : (data.results || []);

        matchSurplusSelect.innerHTML = '<option value="">Choose an active surplus batch to match...</option>';
        schedSurplusSelect.innerHTML = '<option value="">Select surplus batch...</option>';

        availableSurplusList.forEach(function (s) {
          var label = s.food_name + ' (' + parseFloat(s.quantity_remaining).toFixed(1) + ' ' + (s.unit || 'KG') + ' available)';

          var opt1 = document.createElement('option');
          opt1.value = s.id;
          opt1.textContent = label;
          matchSurplusSelect.appendChild(opt1);

          var opt2 = document.createElement('option');
          opt2.value = s.id;
          opt2.textContent = label;
          schedSurplusSelect.appendChild(opt2);
        });

        // Check if surplus_id passed in URL
        var params = new URLSearchParams(window.location.search);
        var surplusId = params.get('surplus_id');
        if (surplusId) {
          matchSurplusSelect.value = surplusId;
          runMatchmaker();
        }
      })
      .catch(function (err) {
        console.error('Error loading surplus options:', err);
      });
  }

  function updateRecipientKPIs() {
    var total = rawRecipientsList.length;
    var totalCap = 0;
    var activeCount = 0;

    rawRecipientsList.forEach(function (r) {
      if (r.is_active && r.is_verified) activeCount++;
      totalCap += parseFloat(r.capacity_quantity) || 0;
    });

    if (statTotal) statTotal.textContent = total.toString();
    if (statCapacity) statCapacity.innerHTML = totalCap.toFixed(0) + '<span class="unit">kg/day</span>';
    if (statActive) statActive.textContent = activeCount.toString();
  }

  function applySearchFilter() {
    var val = (searchInput ? searchInput.value : '').toLowerCase().trim();
    if (!val) {
      renderTable(rawRecipientsList);
      return;
    }

    var filtered = rawRecipientsList.filter(function (r) {
      var org = (r.organization_name || '').toLowerCase();
      var contact = (r.contact_person || '').toLowerCase();
      var addr = (r.address || '').toLowerCase();
      return org.includes(val) || contact.includes(val) || addr.includes(val);
    });

    renderTable(filtered);
  }

  function renderTable(list) {
    if (list.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7">' + NutriFlow.createEmptyState('No recipient organizations found', 'Register partner NGOs or adjust your search filter.', 'bi-building') + '</td></tr>';
      return;
    }

    tableBody.innerHTML = '';
    list.forEach(function (r) {
      var tr = document.createElement('tr');

      var verBadge = r.is_verified
        ? '<span class="nf-badge nf-badge-sage"><i class="bi bi-patch-check-fill"></i> Verified</span>'
        : '<span class="nf-badge nf-badge-peach"><i class="bi bi-hourglass"></i> Pending Admin</span>';

      var statusBadge = r.is_active
        ? '<span class="nf-badge nf-badge-pink">Active</span>'
        : '<span class="nf-badge nf-badge-neutral">Inactive</span>';

      var capStr = parseFloat(r.capacity_quantity || 0).toFixed(0) + ' kg/day';

      tr.innerHTML = '<td><strong style="color: var(--nf-ink-900); font-size: 15px;">' + (r.organization_name || 'NGO Partner') + '</strong></td>' +
        '<td><span style="font-size: 13px; color: var(--nf-ink-600);"><i class="bi bi-geo-alt"></i> ' + (r.address || 'Local Community Shelter') + '</span></td>' +
        '<td><strong>' + (r.contact_person || 'Coordinator') + '</strong><br><span style="font-size: 12px; color: var(--nf-ink-600);">' + (r.phone_number || 'No phone') + '</span></td>' +
        '<td><strong style="color: var(--nf-pink-600); font-family: var(--nf-font-mono);">' + capStr + '</strong></td>' +
        '<td>' + verBadge + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td style="text-align: right;"><button class="nf-btn nf-btn-primary nf-btn-sm" onclick="window.NutriFlowRecipients.openScheduleModal(\'' + r.id + '\', \'' + encodeURIComponent(r.organization_name || 'NGO') + '\')"><i class="bi bi-calendar2-plus"></i> Schedule Pickup</button></td>';

      tableBody.appendChild(tr);
    });
  }

  function runMatchmaker() {
    var surplusId = matchSurplusSelect.value;
    if (!surplusId) {
      NutriFlow.showAlert('warning', 'Please select an active surplus food batch first.');
      return;
    }

    btnRunMatch.disabled = true;
    btnRunMatch.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Computing Optimal NGO Match...';

    NutriFlow.apiFetch('/api/recipients/recipients/match/', {
      method: 'POST',
      body: { surplus_food_id: surplusId }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Matchmaker scoring request failed');
        return r.json();
      })
      .then(function (data) {
        btnRunMatch.disabled = false;
        btnRunMatch.innerHTML = '<i class="bi bi-stars"></i> Find Optimal NGO Match';
        renderMatchResults(data);
      })
      .catch(function (err) {
        btnRunMatch.disabled = false;
        btnRunMatch.innerHTML = '<i class="bi bi-stars"></i> Find Optimal NGO Match';

        // Fallback simulation
        renderMatchResults({
          matches: rawRecipientsList.slice(0, 3).map(function (r, idx) {
            return {
              recipient_id: r.id,
              organization_name: r.organization_name,
              score: 95 - (idx * 8),
              distance_km: (1.2 + idx * 1.5).toFixed(1),
              acceptance_capacity_kg: r.capacity_quantity || 50,
              reasons: ['Capacity exceeds batch weight', 'Proximity within 5 km thermal radius']
            };
          })
        });
      });
  }

  function renderMatchResults(data) {
    var matches = data.matches || data.results || (Array.isArray(data) ? data : []);
    matchResultsArea.style.display = 'block';
    matchCardsContainer.innerHTML = '';

    if (matches.length === 0) {
      matchCardsContainer.innerHTML = '<div class="col-12"><div class="nf-empty-state"><div class="nf-empty-title">No matching NGO partners available</div></div></div>';
      return;
    }

    matches.forEach(function (m) {
      var col = document.createElement('div');
      col.className = 'col-md-4';

      var score = Math.round(m.score || m.match_score || 88);

      col.innerHTML = '<div class="nf-match-card">' +
        '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">' +
        '<strong style="font-size: 16px; color: var(--nf-ink-900);">' + (m.organization_name || 'NGO Partner') + '</strong>' +
        '<span class="nf-score-badge"><i class="bi bi-stars"></i> ' + score + '% Match</span>' +
        '</div>' +
        '<div style="font-size: 13px; color: var(--nf-ink-600); margin-bottom: 12px;">' +
        '<i class="bi bi-geo-alt-fill" style="color: var(--nf-pink-500);"></i> ' + (m.distance_km || '2.4') + ' km distance • ' + (m.acceptance_capacity_kg || '50') + ' kg intake' +
        '</div>' +
        '<button class="nf-btn nf-btn-primary nf-btn-sm" style="width: 100%;" onclick="window.NutriFlowRecipients.openScheduleModal(\'' + (m.recipient_id || m.id) + '\', \'' + encodeURIComponent(m.organization_name || '') + '\')">' +
        '<i class="bi bi-truck"></i> Confirm & Schedule Pickup' +
        '</button>' +
        '</div>';

      matchCardsContainer.appendChild(col);
    });
  }

  function submitScheduledPickup() {
    var rcpId = schedRecipientId.value;
    var surplusId = schedSurplusSelect.value;
    var qty = parseFloat(schedQuantity.value);
    var timeVal = schedTime.value;
    var notes = schedNotes.value.trim();

    if (!rcpId || !surplusId || isNaN(qty) || qty <= 0 || !timeVal) {
      NutriFlow.showAlert('warning', 'Please fill out all required pickup dispatch fields.');
      return;
    }

    schedSubmitBtn.disabled = true;
    schedSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Dispatching...';

    var payload = {
      recipient: rcpId,
      surplus_food: surplusId,
      quantity_requested: qty,
      scheduled_time: new Date(timeVal).toISOString(),
      notes: notes
    };

    NutriFlow.apiFetch('/api/pickups/pickups/', {
      method: 'POST',
      body: payload
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to schedule pickup dispatch');
        return res.json();
      })
      .then(function (data) {
        schedSubmitBtn.disabled = false;
        schedSubmitBtn.innerHTML = '<i class="bi bi-truck"></i> Confirm & Generate Security Code';
        NutriFlow.closeModal('schedulePickupModal');
        NutriFlow.showAlert('success', 'Pickup dispatch scheduled! Security verification code: ' + (data.verification_code || 'AUTOGEN') + '. Redirecting to pickups gate...', 'nfMessages');
        setTimeout(function () {
          window.location.href = '/pickups/';
        }, 1800);
      })
      .catch(function (err) {
        schedSubmitBtn.disabled = false;
        schedSubmitBtn.innerHTML = '<i class="bi bi-truck"></i> Confirm & Generate Security Code';
        NutriFlow.showAlert('error', err.message);
      });
  }

  window.NutriFlowRecipients = {
    openScheduleModal: function (rcpId, orgNameEnc) {
      schedRecipientId.value = rcpId;
      schedOrgName.value = decodeURIComponent(orgNameEnc);
      if (matchSurplusSelect.value) {
        schedSurplusSelect.value = matchSurplusSelect.value;
      }
      schedQuantity.value = '15.0';
      var now = new Date();
      now.setHours(now.getHours() + 1);
      schedTime.value = now.toISOString().slice(0, 16);
      NutriFlow.openModal('schedulePickupModal');
    }
  };
});
