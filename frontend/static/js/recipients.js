/* ==========================================================================
   NutriFlow — recipients.js
   Handles the Recipients page: loads/creates the logged-in user's own
   recipient profile, lists/filters the recipient directory, and runs
   surplus-to-recipient matching. Talks to the real Django REST API.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {

  /* ------------------------------------------------------------------ */
  /* Endpoint constants — change here only if backend routes change     */
  /* ------------------------------------------------------------------ */
  var ME_URL = 'http://127.0.0.1:8000/api/v1/accounts/me/';
  var RECIPIENTS_URL = 'http://127.0.0.1:8000/api/recipients/recipients/';
  var MATCH_URL = RECIPIENTS_URL + 'match/';
  var LOGIN_URL = '../accounts/login.html';

  /* ------------------------------------------------------------------ */
  /* Element references                                                 */
  /* ------------------------------------------------------------------ */
  var badgeVerified = document.getElementById('nfBadgeVerified');
  var badgeActive = document.getElementById('nfBadgeActive');
  var badgeAvailable = document.getElementById('nfBadgeAvailable');

  var profileStatus = document.getElementById('nfProfileStatus');
  var profileForm = document.getElementById('nfRecipientForm');

  var orgNameInput = document.getElementById('recOrgName');
  var phoneInput = document.getElementById('recPhone');
  var contactPersonInput = document.getElementById('recContactPerson');
  var addressInput = document.getElementById('recAddress');
  var capacityQuantityInput = document.getElementById('recCapacityQuantity');
  var capacityUnitSelect = document.getElementById('recCapacityUnit');
  var isActiveCheckbox = document.getElementById('recIsActive');

  var submitBtn = document.getElementById('nfRecipientSubmitBtn');
  var submitBtnText = document.getElementById('nfRecipientSubmitBtnText');

  var searchInput = document.getElementById('recSearch');
  var activeFilterSelect = document.getElementById('recActiveFilter');
  var capacityUnitFilterSelect = document.getElementById('recCapacityUnitFilter');
  var orderingSelect = document.getElementById('recOrdering');
  var availableOnlyCheckbox = document.getElementById('recAvailableOnly');
  var refreshBtn = document.getElementById('nfRefreshRecipientsBtn');

  var directoryStatus = document.getElementById('nfDirectoryStatus');
  var directoryGrid = document.getElementById('nfRecipientsGrid');

  var matchForm = document.getElementById('nfMatchForm');
  var matchSurplusFoodIdInput = document.getElementById('matchSurplusFoodId');
  var matchSubmitBtn = document.getElementById('nfMatchSubmitBtn');
  var matchSubmitBtnText = document.getElementById('nfMatchSubmitBtnText');
  var matchStatus = document.getElementById('nfMatchStatus');
  var matchResultsGrid = document.getElementById('nfMatchResultsGrid');

  /* ------------------------------------------------------------------ */
  /* Auth guard — same pattern as surplus.js / preparation.js           */
  /* ------------------------------------------------------------------ */
  var token = localStorage.getItem('access_token');
  if (!token) {
    window.location.href = LOGIN_URL;
    return;
  }

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */
  var currentUserId = null;
  var myRecipientId = null; // null = no profile yet, so we POST on save
  var searchDebounceTimer = null;

  /* ------------------------------------------------------------------ */
  /* Init                                                               */
  /* ------------------------------------------------------------------ */
  loadMyProfile();
  loadDirectory();

  profileForm.addEventListener('submit', handleProfileSubmit);
  matchForm.addEventListener('submit', handleMatchSubmit);

  refreshBtn.addEventListener('click', loadDirectory);
  activeFilterSelect.addEventListener('change', loadDirectory);
  capacityUnitFilterSelect.addEventListener('change', loadDirectory);
  orderingSelect.addEventListener('change', loadDirectory);
  availableOnlyCheckbox.addEventListener('change', loadDirectory);

  searchInput.addEventListener('input', function () {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(loadDirectory, 400);
  });

  /* ------------------------------------------------------------------ */
  /* Auth helpers                                                       */
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
  /* Load logged-in user, then find (or not find) their recipient       */
  /* profile among all recipients, per the confirmed backend contract:  */
  /* GET /api/v1/accounts/me/ -> me.id                                  */
  /* GET /api/recipients/recipients/ -> find recipient.user === me.id   */
  /* ------------------------------------------------------------------ */
  function loadMyProfile() {
    showProfileStatus('info', 'Loading your recipient profile...');

    fetch(ME_URL, { headers: authHeaders() })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (me) {
        if (me === null) return null;

        currentUserId = me.id;
        orgNameInput.value = me.organization_name || '';
        phoneInput.value = me.phone_number || '';

        return fetch(RECIPIENTS_URL, { headers: authHeaders() });
      })
      .then(function (response) {
        if (response === null) return null;
        if (handleAuthError(response)) return null;
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data === null) return;

        var rows = Array.isArray(data) ? data : (data.results || []);
        var mine = rows.find(function (r) {
          return r.user === currentUserId;
        });

        if (mine) {
          myRecipientId = mine.id;
          populateProfileForm(mine);
          submitBtnText.textContent = 'Save Recipient Profile';
        } else {
          myRecipientId = null;
          resetStatusBadges();
          submitBtnText.textContent = 'Save Recipient Profile';
        }

        hideProfileStatus();
      })
      .catch(function () {
        showProfileStatus('error', 'Could not load your recipient profile. Please try again.');
      });
  }

  function populateProfileForm(recipient) {
    contactPersonInput.value = recipient.contact_person || '';
    addressInput.value = recipient.address || '';
    capacityQuantityInput.value = recipient.capacity_quantity;
    capacityUnitSelect.value = recipient.capacity_unit;
    isActiveCheckbox.checked = !!recipient.is_active;

    setBadge(badgeVerified, recipient.is_verified, 'Verified', 'Not verified');
    setBadge(badgeActive, recipient.is_active, 'Active', 'Inactive');
    setBadge(badgeAvailable, recipient.is_available_for_matching, 'Available for matching', 'Not available for matching');
  }

  function resetStatusBadges() {
    badgeVerified.textContent = 'No profile yet';
    badgeVerified.className = 'nf-badge nf-badge-neutral';
    badgeActive.textContent = 'No profile yet';
    badgeActive.className = 'nf-badge nf-badge-neutral';
    badgeAvailable.textContent = 'No profile yet';
    badgeAvailable.className = 'nf-badge nf-badge-neutral';
  }

  function setBadge(el, isTrue, trueLabel, falseLabel) {
    el.textContent = isTrue ? trueLabel : falseLabel;
    el.className = 'nf-badge ' + (isTrue ? 'nf-badge-success' : 'nf-badge-warning');
  }

  /* ------------------------------------------------------------------ */
  /* Save profile — POST if none exists, PATCH if one does              */
  /* organization_name / phone_number / user / is_verified /            */
  /* is_available_for_matching are never sent (read-only backend fields) */
  /* ------------------------------------------------------------------ */
  function handleProfileSubmit(event) {
    event.preventDefault();
    hideProfileStatus();

    var contactPerson = contactPersonInput.value.trim();
    var address = addressInput.value.trim();
    var capacityQuantity = capacityQuantityInput.value;

    if (!contactPerson) {
      showProfileStatus('error', 'Please enter a contact person.');
      contactPersonInput.focus();
      return;
    }

    if (!address) {
      showProfileStatus('error', 'Please enter an address.');
      addressInput.focus();
      return;
    }

    if (capacityQuantity === '' || Number(capacityQuantity) < 0) {
      showProfileStatus('error', 'Capacity quantity must be zero or a positive number.');
      capacityQuantityInput.focus();
      return;
    }

    var payload = {
      contact_person: contactPerson,
      address: address,
      capacity_quantity: Number(capacityQuantity),
      capacity_unit: capacityUnitSelect.value,
      is_active: isActiveCheckbox.checked
    };

    var isEditing = myRecipientId !== null;
    var url = isEditing ? (RECIPIENTS_URL + myRecipientId + '/') : RECIPIENTS_URL;
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
          showProfileStatus('error', formatApiError(result.status, result.data));
          return;
        }

        myRecipientId = result.data.id;
        populateProfileForm(result.data);
        showProfileStatus('success', isEditing ? 'Profile updated.' : 'Profile created.');
        loadDirectory();
      })
      .catch(function () {
        setSubmitting(false, isEditing);
        showProfileStatus('error', 'Network error. Please check your connection and try again.');
      });
  }

  function setSubmitting(isSubmitting, isEditing) {
    submitBtn.disabled = isSubmitting;
    if (isSubmitting) {
      submitBtnText.textContent = isEditing ? 'Updating...' : 'Saving...';
    } else {
      submitBtnText.textContent = 'Save Recipient Profile';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Directory: load / filter / render                                  */
  /* Supported query params: search, is_active, capacity_unit,          */
  /* available_only=true, ordering                                      */
  /* ------------------------------------------------------------------ */
  function loadDirectory() {
    directoryStatus.innerHTML = '<div class="nf-alert nf-alert-info">Loading recipients...</div>';
    directoryGrid.innerHTML = '';

    var params = new URLSearchParams();

    if (searchInput.value.trim()) {
      params.set('search', searchInput.value.trim());
    }
    if (activeFilterSelect.value) {
      params.set('is_active', activeFilterSelect.value);
    }
    if (capacityUnitFilterSelect.value) {
      params.set('capacity_unit', capacityUnitFilterSelect.value);
    }
    if (orderingSelect.value) {
      params.set('ordering', orderingSelect.value);
    }
    if (availableOnlyCheckbox.checked) {
      params.set('available_only', 'true');
    }

    var url = RECIPIENTS_URL + (params.toString() ? '?' + params.toString() : '');

    fetch(url, { headers: authHeaders() })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data === null) return;
        var rows = Array.isArray(data) ? data : (data.results || []);

        if (rows.length === 0) {
          directoryStatus.innerHTML = '<div class="nf-alert nf-alert-warning">No recipients found.</div>';
          return;
        }

        directoryStatus.innerHTML = '';
        renderDirectory(rows);
      })
      .catch(function () {
        directoryStatus.innerHTML = '<div class="nf-alert nf-alert-error">Could not load recipients. Please try again.</div>';
      });
  }

  function renderDirectory(rows) {
    directoryGrid.innerHTML = '';

    rows.forEach(function (recipient) {
      var card = document.createElement('div');
      card.className = 'nf-card nf-recipient-card';

      var header = document.createElement('div');
      header.className = 'nf-recipient-card-header';

      var title = document.createElement('h4');
      title.className = 'nf-recipient-card-title';
      title.textContent = recipient.organization_name || 'Unnamed organization';

      var badges = document.createElement('div');
      badges.className = 'nf-recipient-badges';

      var verifiedBadge = document.createElement('span');
      verifiedBadge.className = 'nf-badge ' + (recipient.is_verified ? 'nf-badge-success' : 'nf-badge-warning');
      verifiedBadge.textContent = recipient.is_verified ? 'Verified' : 'Not verified';

      var activeBadge = document.createElement('span');
      activeBadge.className = 'nf-badge ' + (recipient.is_active ? 'nf-badge-success' : 'nf-badge-neutral');
      activeBadge.textContent = recipient.is_active ? 'Active' : 'Inactive';

      var availableBadge = document.createElement('span');
      availableBadge.className = 'nf-badge ' + (recipient.is_available_for_matching ? 'nf-badge-info' : 'nf-badge-neutral');
      availableBadge.textContent = recipient.is_available_for_matching ? 'Available for matching' : 'Not available for matching';

      badges.appendChild(verifiedBadge);
      badges.appendChild(activeBadge);
      badges.appendChild(availableBadge);

      header.appendChild(title);
      card.appendChild(header);
      card.appendChild(badges);

      var meta = document.createElement('div');
      meta.className = 'nf-recipient-meta';

      appendMetaLine(meta, 'Capacity', formatNumber(recipient.capacity_quantity) + ' ' + (recipient.capacity_unit || '').toLowerCase());
      appendMetaLine(meta, 'Contact person', recipient.contact_person || '—');
      appendMetaLine(meta, 'Phone', recipient.phone_number || '—');
      appendMetaLine(meta, 'Address', recipient.address || '—');

      card.appendChild(meta);

      if (myRecipientId === recipient.id) {
        var editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'nf-btn nf-btn-outline nf-btn-sm';
        editBtn.textContent = 'Edit my profile';
        editBtn.addEventListener('click', function () {
          document.getElementById('nfRecipientForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        card.appendChild(editBtn);
      }

      directoryGrid.appendChild(card);
    });
  }

  function appendMetaLine(container, label, value) {
    var line = document.createElement('div');

    var strong = document.createElement('strong');
    strong.textContent = label + ': ';

    line.appendChild(strong);
    line.appendChild(document.createTextNode(value));
    container.appendChild(line);
  }

  /* ------------------------------------------------------------------ */
  /* Matching — POST /api/recipients/recipients/match/                  */
  /* Body: { surplus_food }. Response: { surplus_food, matches: [...] } */
  /* Frontend only displays the backend's ranked results.                */
  /* ------------------------------------------------------------------ */
  function handleMatchSubmit(event) {
    event.preventDefault();
    hideMatchStatus();
    matchResultsGrid.innerHTML = '';

    var surplusFoodId = matchSurplusFoodIdInput.value.trim();

    if (!surplusFoodId) {
      showMatchStatus('error', 'Please enter a surplus food ID.');
      matchSurplusFoodIdInput.focus();
      return;
    }

    setMatchSubmitting(true);

    fetch(MATCH_URL, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ surplus_food: surplusFoodId })
    })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        return response.json().then(function (data) {
          return { ok: response.ok, status: response.status, data: data };
        });
      })
      .then(function (result) {
        setMatchSubmitting(false);
        if (result === null) return;

        if (!result.ok) {
          showMatchStatus('error', formatApiError(result.status, result.data));
          return;
        }

        var matches = result.data.matches || [];

        if (matches.length === 0) {
          showMatchStatus('warning', 'No eligible recipients were found for this surplus item.');
          return;
        }

        hideMatchStatus();
        renderMatches(matches);
      })
      .catch(function () {
        setMatchSubmitting(false);
        showMatchStatus('error', 'Network error. Please check your connection and try again.');
      });
  }

  function renderMatches(matches) {
    matchResultsGrid.innerHTML = '';

    matches.forEach(function (match) {
      var recipient = match.recipient || {};

      var card = document.createElement('div');
      card.className = 'nf-card nf-match-card';

      var title = document.createElement('h4');
      title.className = 'nf-recipient-card-title';
      title.textContent = recipient.organization_name || 'Unnamed organization';
      card.appendChild(title);

      var badges = document.createElement('div');
      badges.className = 'nf-recipient-badges';

      var activeBadge = document.createElement('span');
      activeBadge.className = 'nf-badge ' + (recipient.is_active ? 'nf-badge-success' : 'nf-badge-neutral');
      activeBadge.textContent = recipient.is_active ? 'Active' : 'Inactive';

      var verifiedBadge = document.createElement('span');
      verifiedBadge.className = 'nf-badge ' + (recipient.is_verified ? 'nf-badge-success' : 'nf-badge-warning');
      verifiedBadge.textContent = recipient.is_verified ? 'Verified' : 'Not verified';

      badges.appendChild(activeBadge);
      badges.appendChild(verifiedBadge);
      card.appendChild(badges);

      var meta = document.createElement('div');
      meta.className = 'nf-recipient-meta';
      appendMetaLine(meta, 'Capacity', formatNumber(recipient.capacity_quantity) + ' ' + (recipient.capacity_unit || '').toLowerCase());
      card.appendChild(meta);

      var score = document.createElement('div');
      score.className = 'nf-match-score';
      score.textContent = 'Score: ' + formatScore(match.score);
      card.appendChild(score);

      matchResultsGrid.appendChild(card);
    });
  }

  function setMatchSubmitting(isSubmitting) {
    matchSubmitBtn.disabled = isSubmitting;
    matchSubmitBtnText.textContent = isSubmitting ? 'Finding matches...' : 'Find Matches';
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */
  function formatNumber(value) {
    var n = parseFloat(value);
    return isNaN(n) ? '—' : n.toFixed(2);
  }

  function formatScore(value) {
    var n = parseFloat(value);
    return isNaN(n) ? '—' : n.toFixed(4);
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
      if (parts.length > 0) return parts.join(' | ');
    }
    if (status === 404) {
      return 'The requested record could not be found.';
    }
    return 'Request failed (status ' + status + ').';
  }

  function showProfileStatus(type, message) {
    var alertClass = 'nf-alert-info';
    if (type === 'error') alertClass = 'nf-alert-error';
    else if (type === 'success') alertClass = 'nf-alert-success';
    else if (type === 'warning') alertClass = 'nf-alert-warning';
    profileStatus.innerHTML = '<div class="nf-alert ' + alertClass + '">' + message + '</div>';
  }

  function hideProfileStatus() {
    profileStatus.innerHTML = '';
  }

  function showMatchStatus(type, message) {
    var alertClass = 'nf-alert-info';
    if (type === 'error') alertClass = 'nf-alert-error';
    else if (type === 'success') alertClass = 'nf-alert-success';
    else if (type === 'warning') alertClass = 'nf-alert-warning';
    matchStatus.innerHTML = '<div class="nf-alert ' + alertClass + '">' + message + '</div>';
  }

  function hideMatchStatus() {
    matchStatus.innerHTML = '';
  }
});