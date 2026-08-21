/* ==========================================================================
   NutriFlow — preparation.js
   Handles the Preparation page: loads sessions/items, submits new
   MealConsumptionLog records, lists recent records, and supports
   edit/delete against the real Django REST API.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {

  /* ------------------------------------------------------------------ */
  /* Endpoint constants — change here only if backend routes change     */
  /* ------------------------------------------------------------------ */
  var API_BASE = 'http://127.0.0.1:8000/api/v1/';
  var SESSIONS_URL = API_BASE + 'meals/sessions/';
  var ITEMS_URL = API_BASE + 'meals/items/';
  var LOGS_URL = API_BASE + 'meals/consumption-logs/';
  var LOGIN_URL = '../accounts/login.html';

  /* ------------------------------------------------------------------ */
  /* Element references                                                 */
  /* ------------------------------------------------------------------ */
  var form = document.getElementById('nfPrepForm');
  var formTitle = document.getElementById('nfPrepFormTitle');
  var cancelEditBtn = document.getElementById('nfCancelEditBtn');

  var dateInput = document.getElementById('prepDate');
  var sessionSelect = document.getElementById('prepSession');
  var itemSelect = document.getElementById('prepItem');
  var headcountInput = document.getElementById('prepHeadcount');
  var qtyPreparedInput = document.getElementById('prepQtyPrepared');
  var qtyConsumedInput = document.getElementById('prepQtyConsumed');
  var weatherSelect = document.getElementById('prepWeatherNote');
  var isHolidayCheckbox = document.getElementById('prepIsHoliday');
  var isExamPeriodCheckbox = document.getElementById('prepIsExamPeriod');

  var surplusPreview = document.getElementById('nfPrepSurplusPreview');

  var submitBtn = document.getElementById('nfPrepSubmitBtn');
  var submitBtnText = document.getElementById('nfPrepSubmitBtnText');

  var prepStatus = document.getElementById('nfPrepStatus');
  var recordsStatus = document.getElementById('nfRecordsStatus');
  var recordsTableCard = document.getElementById('nfRecordsTableCard');
  var recordsTableBody = document.getElementById('nfRecordsTableBody');
  var refreshBtn = document.getElementById('nfRefreshRecordsBtn');

  /* ------------------------------------------------------------------ */
  /* Auth guard                                                         */
  /* ------------------------------------------------------------------ */
  var token = localStorage.getItem('access_token');
  if (!token) {
    window.location.href = LOGIN_URL;
    return;
  }

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */
  var editingRecordId = null; // null = creating a new record

  /* ------------------------------------------------------------------ */
  /* Init                                                               */
  /* ------------------------------------------------------------------ */
  loadSessions();
  loadItems();
  loadRecords();

  qtyPreparedInput.addEventListener('input', updateSurplusPreview);
  qtyConsumedInput.addEventListener('input', updateSurplusPreview);

  form.addEventListener('submit', handleSubmit);
  cancelEditBtn.addEventListener('click', resetForm);
  refreshBtn.addEventListener('click', loadRecords);

  /* ------------------------------------------------------------------ */
  /* Auth headers helper                                                */
  /* ------------------------------------------------------------------ */
  function authHeaders(extra) {
    var headers = { 'Authorization': 'Bearer ' + token };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) {
          headers[key] = extra[key];
        }
      }
    }
    return headers;
  }

  function handleAuthError(response) {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = LOGIN_URL;
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Load sessions dropdown                                             */
  /* ------------------------------------------------------------------ */
  function loadSessions() {
    fetch(SESSIONS_URL, { headers: authHeaders() })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data === null) return;
        var rows = Array.isArray(data) ? data : (data.results || []);

        sessionSelect.innerHTML = '';

        if (rows.length === 0) {
          sessionSelect.innerHTML = '<option value="" selected disabled>No sessions available</option>';
          return;
        }

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.selected = true;
        placeholder.textContent = 'Select session';
        sessionSelect.appendChild(placeholder);

        rows.forEach(function (session) {
          var opt = document.createElement('option');
          opt.value = session.id;
          opt.textContent = session.name;
          sessionSelect.appendChild(opt);
        });
      })
      .catch(function () {
        sessionSelect.innerHTML = '<option value="" selected disabled>Failed to load sessions</option>';
        showPrepStatus('error', 'Could not load meal sessions from the server.');
      });
  }

  /* ------------------------------------------------------------------ */
  /* Load menu items dropdown                                           */
  /* ------------------------------------------------------------------ */
  function loadItems() {
    fetch(ITEMS_URL, { headers: authHeaders() })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data === null) return;
        var rows = Array.isArray(data) ? data : (data.results || []);

        itemSelect.innerHTML = '';

        if (rows.length === 0) {
          itemSelect.innerHTML = '<option value="" selected disabled>No menu items available</option>';
          return;
        }

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.selected = true;
        placeholder.textContent = 'Select menu item';
        itemSelect.appendChild(placeholder);

        rows.forEach(function (item) {
          var opt = document.createElement('option');
          opt.value = item.id;
          opt.textContent = item.name;
          itemSelect.appendChild(opt);
        });
      })
      .catch(function () {
        itemSelect.innerHTML = '<option value="" selected disabled>Failed to load menu items</option>';
        showPrepStatus('error', 'Could not load menu items from the server.');
      });
  }

  /* ------------------------------------------------------------------ */
  /* Live surplus preview as the operator types                        */
  /* ------------------------------------------------------------------ */
  function updateSurplusPreview() {
    var prepared = parseFloat(qtyPreparedInput.value);
    var consumed = parseFloat(qtyConsumedInput.value);

    if (isNaN(prepared) || isNaN(consumed)) {
      surplusPreview.style.display = 'none';
      return;
    }

    var surplus = prepared - consumed;
    surplusPreview.style.display = 'block';

    if (surplus < 0) {
      surplusPreview.classList.add('warning');
      surplusPreview.textContent = 'Warning: consumed quantity is greater than prepared quantity.';
    } else {
      surplusPreview.classList.remove('warning');
      surplusPreview.textContent = 'Surplus: ' + surplus.toFixed(1) + ' kg';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Form submit — create or update                                     */
  /* ------------------------------------------------------------------ */
  function handleSubmit(event) {
    event.preventDefault();
    hidePrepStatus();

    var dateValue = dateInput.value;
    var sessionValue = sessionSelect.value;
    var itemValue = itemSelect.value;
    var headcountValue = headcountInput.value;
    var preparedValue = qtyPreparedInput.value;
    var consumedValue = qtyConsumedInput.value;

    // --- Validation -----------------------------------------------------
    if (!dateValue) {
      showPrepStatus('error', 'Please select a date.');
      dateInput.focus();
      return;
    }

    if (!sessionValue) {
      showPrepStatus('error', 'Please select a meal session.');
      sessionSelect.focus();
      return;
    }

    if (!itemValue) {
      showPrepStatus('error', 'Please select a menu item.');
      itemSelect.focus();
      return;
    }

    if (preparedValue === '' || Number(preparedValue) < 0) {
      showPrepStatus('error', 'Quantity prepared must be zero or a positive number.');
      qtyPreparedInput.focus();
      return;
    }

    if (consumedValue === '' || Number(consumedValue) < 0) {
      showPrepStatus('error', 'Quantity consumed must be zero or a positive number.');
      qtyConsumedInput.focus();
      return;
    }

    if (headcountValue === '' || Number(headcountValue) <= 0) {
      showPrepStatus('error', 'Headcount must be a positive number.');
      headcountInput.focus();
      return;
    }

    var payload = {
      date: dateValue,
      session: Number(sessionValue),
      item: Number(itemValue),
      quantity_prepared_kg: Number(preparedValue),
      quantity_consumed_kg: Number(consumedValue),
      headcount: Number(headcountValue),
      is_holiday: isHolidayCheckbox.checked,
      is_exam_period: isExamPeriodCheckbox.checked,
      weather_note: weatherSelect.value
    };

    var isEditing = editingRecordId !== null;
    var url = isEditing ? (LOGS_URL + editingRecordId + '/') : LOGS_URL;
    var method = isEditing ? 'PATCH' : 'POST';

    setSubmitting(true, isEditing);

    fetch(url, {
      method: method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        if (handleAuthError(response)) return null;

        return response.json().then(function (data) {
          return { ok: response.ok, status: response.status, data: data };
        });
      })
      .then(function (result) {
        setSubmitting(false, isEditing);

        if (result === null) return;

        if (!result.ok) {
          showPrepStatus('error', formatApiError(result.status, result.data));
          return;
        }

        var surplus = result.data.surplus_kg;
        var surplusText = (surplus !== null && surplus !== undefined)
          ? (' Surplus: ' + Number(surplus).toFixed(1) + ' kg.')
          : '';

        showPrepStatus('success', (isEditing ? 'Record updated.' : 'Record saved.') + surplusText);

        resetForm();
        loadRecords();
      })
      .catch(function () {
        setSubmitting(false, isEditing);
        showPrepStatus('error', 'Network error. Please check your connection and try again.');
      });
  }

  function formatApiError(status, data) {
    if (status === 400 && data && typeof data === 'object') {
      var parts = [];
      for (var field in data) {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
          var value = data[field];
          var text = Array.isArray(value) ? value.join(' ') : String(value);
          parts.push(field + ': ' + text);
        }
      }
      if (parts.length > 0) {
        return parts.join(' | ');
      }
    }
    return 'Unable to save the record (status ' + status + ').';
  }

  function setSubmitting(isSubmitting, isEditing) {
    submitBtn.disabled = isSubmitting;
    if (isSubmitting) {
      submitBtnText.textContent = isEditing ? 'Updating...' : 'Saving...';
    } else {
      submitBtnText.textContent = isEditing ? 'Update Record' : 'Save Record';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Reset form back to "create new record" mode                        */
  /* ------------------------------------------------------------------ */
  function resetForm() {
    editingRecordId = null;
    form.reset();
    surplusPreview.style.display = 'none';
    formTitle.textContent = 'New Record';
    submitBtnText.textContent = 'Save Record';
    cancelEditBtn.style.display = 'none';
  }

  /* ------------------------------------------------------------------ */
  /* Load recent records                                                */
  /* ------------------------------------------------------------------ */
  function loadRecords() {
    recordsStatus.innerHTML = '<div class="nf-alert nf-alert-info">Loading recent records...</div>';
    recordsTableCard.style.display = 'none';

    fetch(LOGS_URL, { headers: authHeaders() })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data === null) return;
        var rows = Array.isArray(data) ? data : (data.results || []);

        if (rows.length === 0) {
          recordsStatus.innerHTML = '<div class="nf-alert nf-alert-warning">No preparation records found yet.</div>';
          return;
        }

        recordsStatus.innerHTML = '';
        renderRecordsTable(rows);
        recordsTableCard.style.display = 'block';
      })
      .catch(function () {
        recordsStatus.innerHTML = '<div class="nf-alert nf-alert-error">Could not load recent records.</div>';
      });
  }

  function renderRecordsTable(rows) {
    recordsTableBody.innerHTML = '';

    rows.forEach(function (row) {
      var tr = document.createElement('tr');

      tr.appendChild(makeCell(row.date));
      tr.appendChild(makeCell(row.session_name));
      tr.appendChild(makeCell(row.item_name));
      tr.appendChild(makeCell(formatNumber(row.quantity_prepared_kg)));
      tr.appendChild(makeCell(formatNumber(row.quantity_consumed_kg)));
      tr.appendChild(makeCell(formatNumber(row.surplus_kg)));
      tr.appendChild(makeCell(row.headcount));

      var actionsTd = document.createElement('td');
      actionsTd.className = 'nf-prep-row-actions';

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'nf-btn nf-btn-outline nf-btn-sm';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function () {
        beginEdit(row);
      });

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'nf-btn nf-btn-danger nf-btn-sm';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', function () {
        confirmDelete(row.id);
      });

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(deleteBtn);
      tr.appendChild(actionsTd);

      recordsTableBody.appendChild(tr);
    });
  }

  function makeCell(value) {
    var td = document.createElement('td');
    td.textContent = (value === null || value === undefined) ? '—' : value;
    return td;
  }

  function formatNumber(value) {
    var n = parseFloat(value);
    return isNaN(n) ? '—' : n.toFixed(1);
  }

  /* ------------------------------------------------------------------ */
  /* Edit                                                                */
  /* ------------------------------------------------------------------ */
  function beginEdit(row) {
    editingRecordId = row.id;

    dateInput.value = row.date;
    sessionSelect.value = String(row.session);
    itemSelect.value = String(row.item);
    headcountInput.value = row.headcount;
    qtyPreparedInput.value = row.quantity_prepared_kg;
    qtyConsumedInput.value = row.quantity_consumed_kg;
    weatherSelect.value = row.weather_note || '';
    isHolidayCheckbox.checked = !!row.is_holiday;
    isExamPeriodCheckbox.checked = !!row.is_exam_period;

    updateSurplusPreview();

    formTitle.textContent = 'Edit Record';
    submitBtnText.textContent = 'Update Record';
    cancelEditBtn.style.display = 'inline-flex';

    hidePrepStatus();
    document.getElementById('nfPrepForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ------------------------------------------------------------------ */
  /* Delete                                                             */
  /* ------------------------------------------------------------------ */
  function confirmDelete(recordId) {
    var confirmed = window.confirm('Delete this preparation record? This cannot be undone.');
    if (!confirmed) return;

    fetch(LOGS_URL + recordId + '/', {
      method: 'DELETE',
      headers: authHeaders()
    })
      .then(function (response) {
        if (handleAuthError(response)) return;

        if (!response.ok && response.status !== 204) {
          throw new Error('status ' + response.status);
        }

        if (editingRecordId === recordId) {
          resetForm();
        }

        loadRecords();
      })
      .catch(function () {
        recordsStatus.innerHTML = '<div class="nf-alert nf-alert-error">Could not delete the record. Please try again.</div>';
      });
  }

  /* ------------------------------------------------------------------ */
  /* Status helpers                                                     */
  /* ------------------------------------------------------------------ */
  function showPrepStatus(type, message) {
    var alertClass = 'nf-alert-info';
    if (type === 'error') alertClass = 'nf-alert-error';
    else if (type === 'success') alertClass = 'nf-alert-success';
    else if (type === 'warning') alertClass = 'nf-alert-warning';

    prepStatus.innerHTML = '<div class="nf-alert ' + alertClass + '">' + message + '</div>';
  }

  function hidePrepStatus() {
    prepStatus.innerHTML = '';
  }
});