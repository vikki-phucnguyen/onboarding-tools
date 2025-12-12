// State
let state = {
    environment: 'non-prod-uat',
    tables: {},
    selectedTable: '',
    selectedIndex: '',
    currentResults: [],
    viewMode: 'formatted',
    editTarget: null, // { index, item }
    editorWrap: true,
    viewerWrap: true,
    searchQuery: ''
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

// Edit modal elements
const editModal = document.getElementById('edit-modal');
const editEnvWarning = document.getElementById('edit-env-warning');
const editJsonTextarea = document.getElementById('edit-json');
const editJsonError = document.getElementById('edit-json-error');
const saveEditBtn = document.getElementById('save-edit-btn');
const editorToggleWrapBtn = document.getElementById('toggle-wrap-btn');

// Viewer toolbar elements
const viewerWrapToggleBtn = document.getElementById('wrap-toggle-btn');
const searchKeyInput = document.getElementById('search-key-input');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadTables();
    setupEventListeners();
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

    // Viewer wrap toggle
    viewerWrapToggleBtn.addEventListener('click', toggleViewerWrap);

    // Search by key (debounced)
    let searchTimeout;
    searchKeyInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.searchQuery = searchKeyInput.value.trim().toLowerCase();
            if (state.currentResults.length > 0) {
                renderResults();
            }
        }, 300);
    });
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
        const parsedItem = parseNestedJsonStrings(item);
        const jsonContent = formatJSON(parsedItem);
        return `
            <div class="result-item expanded" data-index="${index}">
                <div class="result-item-header" onclick="toggleItem(this.parentElement)">
                    <span class="result-item-title">${title}</span>
                    <div class="result-item-actions">
                        <button class="copy-item-btn" onclick="event.stopPropagation(); copyItem(${index}, this)">📋 Copy</button>
                        <button class="edit-item-btn" onclick="event.stopPropagation(); openEditModal(${index})">✏️ Edit</button>
                        <span class="result-item-toggle">▼</span>
                    </div>
                </div>
                <div class="result-item-body">
                    <div class="json-viewer${state.viewerWrap ? ' wrap' : ''}">${jsonContent}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderCompactView(items) {
    resultsContainer.innerHTML = items.map((item, index) => {
        const title = getItemTitle(item);
        const parsedItem = parseNestedJsonStrings(item);
        const jsonContent = JSON.stringify(parsedItem);
        return `
            <div class="result-item expanded" data-index="${index}">
                <div class="result-item-header" onclick="toggleItem(this.parentElement)">
                    <span class="result-item-title">${title}</span>
                    <div class="result-item-actions">
                        <button class="copy-item-btn" onclick="event.stopPropagation(); copyItem(${index}, this)">📋 Copy</button>
                        <button class="edit-item-btn" onclick="event.stopPropagation(); openEditModal(${index})">✏️ Edit</button>
                        <span class="result-item-toggle">▼</span>
                    </div>
                </div>
                <div class="result-item-body">
                    <div class="json-viewer${state.viewerWrap ? ' wrap' : ''}">${escapeHtml(jsonContent)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderRawView(items) {
    const parsedItems = items.map(item => parseNestedJsonStrings(item));
    const jsonStr = JSON.stringify(parsedItems, null, 2);
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

function toggleViewerWrap() {
    state.viewerWrap = !state.viewerWrap;
    document.querySelectorAll('.json-viewer').forEach(viewer => {
        viewer.classList.toggle('wrap', state.viewerWrap);
    });
    // Update button text
    viewerWrapToggleBtn.innerHTML = state.viewerWrap
        ? '<span>↔️</span> Unwrap'
        : '<span>↔️</span> Wrap';
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

// Edit Modal Functions
function openEditModal(index) {
    const item = state.currentResults[index];

    state.editTarget = { index, item };

    // Show environment-specific warning
    if (state.environment === 'prod') {
        editEnvWarning.className = 'edit-env-warning prod-warning';
        editEnvWarning.innerHTML = `
            🚨 <strong>PRODUCTION ENVIRONMENT</strong> 🚨<br>
            You are editing data in the PRODUCTION database!
        `;
    } else {
        editEnvWarning.className = 'edit-env-warning uat-warning';
        editEnvWarning.innerHTML = `
            ⚠️ Editing in ${state.environment.toUpperCase()} environment.
        `;
    }

    // Populate editor with formatted JSON (parse nested JSON strings)
    const parsedItem = parseNestedJsonStrings(item);
    editJsonTextarea.value = JSON.stringify(parsedItem, null, 2);
    editJsonError.classList.add('hidden');

    // Apply wrap state
    if (state.editorWrap) {
        editJsonTextarea.classList.add('wrap');
    } else {
        editJsonTextarea.classList.remove('wrap');
    }

    // Show modal
    editModal.classList.remove('hidden');
    editJsonTextarea.focus();
}

function closeEditModal() {
    editModal.classList.add('hidden');
    state.editTarget = null;
}

function toggleWrap() {
    state.editorWrap = !state.editorWrap;
    if (state.editorWrap) {
        editJsonTextarea.classList.add('wrap');
    } else {
        editJsonTextarea.classList.remove('wrap');
    }
}

function formatEditorJson() {
    try {
        const parsed = JSON.parse(editJsonTextarea.value);
        editJsonTextarea.value = JSON.stringify(parsed, null, 2);
        editJsonError.classList.add('hidden');
    } catch (e) {
        editJsonError.textContent = 'Invalid JSON: ' + e.message;
        editJsonError.classList.remove('hidden');
    }
}

async function saveEdit() {
    if (!state.editTarget) return;

    // Validate JSON
    let parsedItem;
    try {
        parsedItem = JSON.parse(editJsonTextarea.value);
    } catch (e) {
        editJsonError.textContent = 'Invalid JSON: ' + e.message;
        editJsonError.classList.remove('hidden');
        return;
    }

    const request = {
        environment: state.environment,
        table: state.selectedTable,
        item: parsedItem
    };

    closeEditModal();
    showLoading(true);

    try {
        const response = await fetch('/api/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        const data = await response.json();

        if (data.success) {
            showToast('Item updated successfully!');
            // Update local results
            state.currentResults[state.editTarget.index] = parsedItem;
            renderResults();
        } else {
            showToast('Update failed: ' + data.error);
        }
    } catch (error) {
        showToast('Update failed: ' + error.message);
    } finally {
        showLoading(false);
        state.editTarget = null;
    }
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

// Recursively parse JSON strings within an object
function parseNestedJsonStrings(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj === 'string') {
        // Try to parse as JSON if it looks like JSON
        const trimmed = obj.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                const parsed = JSON.parse(trimmed);
                return parseNestedJsonStrings(parsed);
            } catch (e) {
                // Not valid JSON, return as is
                return obj;
            }
        }
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => parseNestedJsonStrings(item));
    }

    if (typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = parseNestedJsonStrings(value);
        }
        return result;
    }

    return obj;
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
            const keyLower = key.toLowerCase();
            const highlight = state.searchQuery && keyLower.includes(state.searchQuery) ? ' highlight' : '';
            return `${spaces}  <span class="json-key${highlight}">"${escapeHtml(key)}"</span>: ${formatJSON(value, indent + 1)}`;
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
