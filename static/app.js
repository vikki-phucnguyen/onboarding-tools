// State
let state = {
    environment: 'non-prod-uat',
    tables: {},
    selectedTable: '',
    selectedIndex: '',
    currentResults: [],
    viewMode: 'formatted',
    deleteTarget: null // { index, item, primaryKey, primaryValue }
};

// DOM Elements
const tableSelect = document.getElementById('table-select');
const indexSelect = document.getElementById('index-select');
const queryFields = document.getElementById('query-fields');
const executeBtn = document.getElementById('execute-btn');
const resultsContainer = document.getElementById('results-container');
const resultCount = document.getElementById('result-count');
const loadingOverlay = document.getElementById('loading-overlay');
const envButtons = document.querySelectorAll('.env-btn');
const resultsToolbar = document.getElementById('results-toolbar');
const copyAllBtn = document.getElementById('copy-all-btn');
const expandAllBtn = document.getElementById('expand-all-btn');
const collapseAllBtn = document.getElementById('collapse-all-btn');
const viewModeSelect = document.getElementById('view-mode');
const toast = document.getElementById('toast');

// Delete modal elements
const deleteModal = document.getElementById('delete-modal');
const deleteItemInfo = document.getElementById('delete-item-info');
const deleteEnvWarning = document.getElementById('delete-env-warning');
const deleteConfirmInput = document.getElementById('delete-confirm-input');
const deleteAcknowledgeCheckbox = document.getElementById('delete-acknowledge-checkbox');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadTables();
    setupEventListeners();
    setupDeleteModalListeners();
});

async function loadTables() {
    try {
        const response = await fetch('/api/tables');
        const data = await response.json();
        state.tables = data.tables;
        populateTableSelect();
    } catch (error) {
        showError('Failed to load tables: ' + error.message);
    }
}

function setupEventListeners() {
    // Environment buttons
    envButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            envButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.environment = btn.dataset.env;
            state.selectedTable = '';
            state.selectedIndex = '';
            populateTableSelect();
            resetIndexSelect();
            clearQueryFields();
            updateExecuteButton();
        });
    });

    // Table select
    tableSelect.addEventListener('change', () => {
        state.selectedTable = tableSelect.value;
        state.selectedIndex = '';
        if (state.selectedTable) {
            populateIndexSelect();
        } else {
            resetIndexSelect();
        }
        clearQueryFields();
        updateExecuteButton();
    });

    // Index select
    indexSelect.addEventListener('change', () => {
        state.selectedIndex = indexSelect.value;
        if (state.selectedIndex !== '' || indexSelect.selectedIndex > 0) {
            populateQueryFields();
        } else {
            clearQueryFields();
        }
        updateExecuteButton();
    });

    // Execute button
    executeBtn.addEventListener('click', executeQuery);

    // Toolbar buttons
    copyAllBtn.addEventListener('click', copyAllResults);
    expandAllBtn.addEventListener('click', expandAll);
    collapseAllBtn.addEventListener('click', collapseAll);
    viewModeSelect.addEventListener('change', () => {
        state.viewMode = viewModeSelect.value;
        if (state.currentResults.length > 0) {
            renderResults();
        }
    });
}

function setupDeleteModalListeners() {
    // Validate delete confirmation input
    deleteConfirmInput.addEventListener('input', validateDeleteForm);
    deleteAcknowledgeCheckbox.addEventListener('change', validateDeleteForm);
}

function validateDeleteForm() {
    const inputValid = deleteConfirmInput.value.toUpperCase() === 'DELETE';
    const checkboxValid = deleteAcknowledgeCheckbox.checked;

    // Visual feedback for input
    if (inputValid) {
        deleteConfirmInput.classList.add('valid');
    } else {
        deleteConfirmInput.classList.remove('valid');
    }

    // Enable/disable delete button
    confirmDeleteBtn.disabled = !(inputValid && checkboxValid);
}

function populateTableSelect() {
    const tables = state.tables[state.environment] || {};
    tableSelect.innerHTML = '<option value="">Select a table...</option>';

    Object.entries(tables).forEach(([key, table]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = table.displayName;
        tableSelect.appendChild(option);
    });

    tableSelect.value = state.selectedTable;
}

function resetIndexSelect() {
    indexSelect.innerHTML = '<option value="">Select table first...</option>';
    indexSelect.disabled = true;
}

function populateIndexSelect() {
    const tables = state.tables[state.environment] || {};
    const table = tables[state.selectedTable];

    if (!table) {
        resetIndexSelect();
        return;
    }

    indexSelect.innerHTML = '<option value="">Select query type...</option>';

    table.indexes.forEach(index => {
        const option = document.createElement('option');
        option.value = index.name;
        option.textContent = index.displayName;
        indexSelect.appendChild(option);
    });

    indexSelect.disabled = false;
}

function clearQueryFields() {
    queryFields.innerHTML = '';
}

function populateQueryFields() {
    const tables = state.tables[state.environment] || {};
    const table = tables[state.selectedTable];

    if (!table) return;

    const index = table.indexes.find(i => i.name === state.selectedIndex);
    if (!index) return;

    queryFields.innerHTML = '';

    // Hash key field
    const hashField = createInputField(index.hashKey, true);
    queryFields.appendChild(hashField);

    // Range key field (optional)
    if (index.rangeKey) {
        const rangeField = createInputField(index.rangeKey, false);
        queryFields.appendChild(rangeField);
    }
}

function createInputField(fieldName, required) {
    const div = document.createElement('div');
    div.className = 'field-input';

    const label = document.createElement('label');
    label.textContent = formatFieldName(fieldName) + (required ? ' *' : '');
    label.htmlFor = `field-${fieldName}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `field-${fieldName}`;
    input.name = fieldName;
    input.placeholder = `Enter ${formatFieldName(fieldName)}...`;
    input.required = required;

    input.addEventListener('input', updateExecuteButton);

    div.appendChild(label);
    div.appendChild(input);

    return div;
}

function formatFieldName(name) {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function updateExecuteButton() {
    const inputs = queryFields.querySelectorAll('input[required]');
    const allFilled = Array.from(inputs).every(input => input.value.trim() !== '');
    const hasIndex = indexSelect.selectedIndex > 0;
    executeBtn.disabled = !allFilled || !hasIndex;
}

async function executeQuery() {
    const inputs = queryFields.querySelectorAll('input');
    const values = {};

    inputs.forEach(input => {
        if (input.value.trim()) {
            values[input.name] = input.value.trim();
        }
    });

    const request = {
        environment: state.environment,
        table: state.selectedTable,
        indexName: state.selectedIndex,
        values: values
    };

    showLoading(true);

    try {
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        const data = await response.json();

        if (data.success) {
            state.currentResults = data.items;
            renderResults();
        } else {
            showError(data.error);
            hideToolbar();
        }
    } catch (error) {
        showError('Request failed: ' + error.message);
        hideToolbar();
    } finally {
        showLoading(false);
    }
}

function renderResults() {
    const items = state.currentResults;

    if (!items || items.length === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🔍</span>
                <p>No results found</p>
            </div>
        `;
        resultCount.textContent = '0 items';
        hideToolbar();
        return;
    }

    resultCount.textContent = `${items.length} item${items.length > 1 ? 's' : ''}`;
    showToolbar();

    if (state.viewMode === 'raw') {
        renderRawView(items);
    } else if (state.viewMode === 'compact') {
        renderCompactView(items);
    } else {
        renderFormattedView(items);
    }
}

function renderFormattedView(items) {
    resultsContainer.innerHTML = items.map((item, index) => {
        const title = getItemTitle(item);
        const jsonContent = formatJSON(item);
        return `
            <div class="result-item expanded" data-index="${index}">
                <div class="result-item-header" onclick="toggleItem(this.parentElement)">
                    <span class="result-item-title">${title}</span>
                    <div class="result-item-actions">
                        <button class="copy-item-btn" onclick="event.stopPropagation(); copyItem(${index}, this)">📋 Copy</button>
                        <button class="delete-item-btn" onclick="event.stopPropagation(); openDeleteModal(${index})">🗑️ Delete</button>
                        <span class="result-item-toggle">▼</span>
                    </div>
                </div>
                <div class="result-item-body">
                    <div class="json-viewer">${jsonContent}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderCompactView(items) {
    resultsContainer.innerHTML = items.map((item, index) => {
        const title = getItemTitle(item);
        const jsonContent = JSON.stringify(item);
        return `
            <div class="result-item expanded" data-index="${index}">
                <div class="result-item-header" onclick="toggleItem(this.parentElement)">
                    <span class="result-item-title">${title}</span>
                    <div class="result-item-actions">
                        <button class="copy-item-btn" onclick="event.stopPropagation(); copyItem(${index}, this)">📋 Copy</button>
                        <button class="delete-item-btn" onclick="event.stopPropagation(); openDeleteModal(${index})">🗑️ Delete</button>
                        <span class="result-item-toggle">▼</span>
                    </div>
                </div>
                <div class="result-item-body">
                    <div class="json-viewer">${escapeHtml(jsonContent)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderRawView(items) {
    const jsonStr = JSON.stringify(items, null, 2);
    resultsContainer.innerHTML = `
        <div class="raw-json-view">
            <pre>${escapeHtml(jsonStr)}</pre>
        </div>
    `;
}

function getItemTitle(item) {
    // Try to find a meaningful identifier
    const keys = ['onboard_id', 'phone_number', 'prospect_id', 'id'];
    for (const key of keys) {
        if (item[key]) {
            return `${formatFieldName(key)}: ${item[key]}`;
        }
    }
    return `Item`;
}

function getPrimaryKeyForItem(item) {
    const tables = state.tables[state.environment] || {};
    const table = tables[state.selectedTable];
    if (!table || !table.primaryKey) return null;

    const primaryKey = table.primaryKey;
    const primaryValue = item[primaryKey];

    if (!primaryValue) return null;

    return { primaryKey, primaryValue: String(primaryValue) };
}

function toggleItem(element) {
    element.classList.toggle('expanded');
}

function expandAll() {
    document.querySelectorAll('.result-item').forEach(item => {
        item.classList.add('expanded');
    });
}

function collapseAll() {
    document.querySelectorAll('.result-item').forEach(item => {
        item.classList.remove('expanded');
    });
}

function copyAllResults() {
    const jsonStr = JSON.stringify(state.currentResults, null, 2);
    copyToClipboard(jsonStr);
    showToast('All results copied to clipboard!');

    // Visual feedback
    copyAllBtn.classList.add('success');
    setTimeout(() => copyAllBtn.classList.remove('success'), 2000);
}

function copyItem(index, button) {
    const item = state.currentResults[index];
    const jsonStr = JSON.stringify(item, null, 2);
    copyToClipboard(jsonStr);
    showToast('Item copied to clipboard!');

    // Visual feedback
    button.classList.add('copied');
    button.textContent = '✓ Copied';
    setTimeout(() => {
        button.classList.remove('copied');
        button.textContent = '📋 Copy';
    }, 2000);
}

// Delete Modal Functions
function openDeleteModal(index) {
    const item = state.currentResults[index];
    const keyInfo = getPrimaryKeyForItem(item);

    if (!keyInfo) {
        showToast('Cannot delete: Primary key not found');
        return;
    }

    state.deleteTarget = {
        index,
        item,
        primaryKey: keyInfo.primaryKey,
        primaryValue: keyInfo.primaryValue
    };

    // Populate item info
    deleteItemInfo.innerHTML = `
        <div class="info-row">
            <span class="info-label">Environment:</span>
            <span class="info-value">${state.environment}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Table:</span>
            <span class="info-value">${state.selectedTable}</span>
        </div>
        <div class="info-row">
            <span class="info-label">${formatFieldName(keyInfo.primaryKey)}:</span>
            <span class="info-value">${keyInfo.primaryValue}</span>
        </div>
    `;

    // Show environment-specific warning
    if (state.environment === 'prod') {
        deleteEnvWarning.className = 'delete-env-warning prod-warning';
        deleteEnvWarning.innerHTML = `
            🚨 <strong>PRODUCTION ENVIRONMENT</strong> 🚨<br>
            This will permanently delete data from the PRODUCTION database!
        `;
    } else {
        deleteEnvWarning.className = 'delete-env-warning uat-warning';
        deleteEnvWarning.innerHTML = `
            ⚠️ You are deleting from the ${state.environment.toUpperCase()} environment.
        `;
    }

    // Reset form
    deleteConfirmInput.value = '';
    deleteConfirmInput.classList.remove('valid');
    deleteAcknowledgeCheckbox.checked = false;
    confirmDeleteBtn.disabled = true;

    // Show modal
    deleteModal.classList.remove('hidden');
    deleteConfirmInput.focus();
}

function closeDeleteModal() {
    deleteModal.classList.add('hidden');
    state.deleteTarget = null;
}

async function executeDelete() {
    if (!state.deleteTarget) return;

    const { primaryKey, primaryValue } = state.deleteTarget;

    // Generate confirmation token (SHA256 hash)
    const tokenData = `DELETE:${state.environment}:${state.selectedTable}:${primaryValue}`;
    const confirmationToken = await sha256(tokenData);

    const request = {
        environment: state.environment,
        table: state.selectedTable,
        primaryKey: primaryKey,
        primaryValue: primaryValue,
        confirmationToken: confirmationToken
    };

    closeDeleteModal();
    showLoading(true);

    try {
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        const data = await response.json();

        if (data.success) {
            showToast('Item deleted successfully!');
            // Remove from current results
            state.currentResults.splice(state.deleteTarget.index, 1);
            renderResults();
        } else {
            showToast('Delete failed: ' + data.error);
        }
    } catch (error) {
        showToast('Delete failed: ' + error.message);
    } finally {
        showLoading(false);
        state.deleteTarget = null;
    }
}

// SHA256 hash function
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
    } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => {
        toast.classList.remove('visible');
    }, 2000);
}

function showToolbar() {
    resultsToolbar.classList.add('visible');
}

function hideToolbar() {
    resultsToolbar.classList.remove('visible');
}

function formatJSON(obj, indent = 0) {
    const spaces = '  '.repeat(indent);

    if (obj === null) {
        return `<span class="json-null">null</span>`;
    }

    if (typeof obj === 'string') {
        return `<span class="json-string">"${escapeHtml(obj)}"</span>`;
    }

    if (typeof obj === 'number') {
        return `<span class="json-number">${obj}</span>`;
    }

    if (typeof obj === 'boolean') {
        return `<span class="json-boolean">${obj}</span>`;
    }

    if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        const items = obj.map(item => `${spaces}  ${formatJSON(item, indent + 1)}`);
        return `[\n${items.join(',\n')}\n${spaces}]`;
    }

    if (typeof obj === 'object') {
        const entries = Object.entries(obj);
        if (entries.length === 0) return '{}';

        const items = entries.map(([key, value]) => {
            return `${spaces}  <span class="json-key">"${escapeHtml(key)}"</span>: ${formatJSON(value, indent + 1)}`;
        });
        return `{\n${items.join(',\n')}\n${spaces}}`;
    }

    return String(obj);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showError(message) {
    resultsContainer.innerHTML = `
        <div class="error-message">
            <h3>⚠️ Error</h3>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
    resultCount.textContent = '';
}

function showLoading(show) {
    loadingOverlay.classList.toggle('hidden', !show);
}
