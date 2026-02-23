// v1.0.2
let recipes = [];
let allRecipes = [];
let currentRecipe = null;
let grains = [], hops = [], yeasts = [];
let selectedStyle = null;
let editMode = false;
let recipeDirectory = null;
let currentFolder = '';
let editingTagsFilename = null;
let editingIngredient = null;
let expandedFolders = new Set();
let selectedTag = null;

document.addEventListener('DOMContentLoaded', () => {
    loadBJCPStyles();
    loadRecipes();
    document.getElementById('importFile').addEventListener('change', handleImport);
    setupResizeHandle();
});

function setupResizeHandle() {
    const handle = document.getElementById('resizeHandle');
    const leftCol = document.getElementById('leftColumn');
    let isResizing = false;
    
    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth > 200 && newWidth < 600) {
            leftCol.style.width = newWidth + 'px';
        }
    });
    
    document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = 'default';
    });
}



async function loadRecipes() {
    console.log('loadRecipes called');
    const res = await fetch('/api/recipes');
    console.log('API response status:', res.status);
    if (!res.ok) {
        console.error('Failed to load recipes:', res.status);
        recipes = [];
        allRecipes = [];
        renderRecipeList();
        return;
    }
    allRecipes = await res.json();
    console.log('Loaded recipes:', allRecipes);
    recipes = allRecipes;
    
    loadTagFilters();
    renderRecipeList();
}

function renderRecipeList() {
    const list = document.getElementById('recipeList');
    
    if (recipes.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No recipes found</div>';
        return;
    }
    
    list.innerHTML = recipes.map(r => createRecipeCard(r)).join('');
}

function createRecipeCard(r) {
    const isActive = currentRecipe && currentRecipe.filename === r.filename ? 'active' : '';
    const tagBadges = r.tags ? r.tags.split(',').map(t => `<span class="tag-badge">${t.trim()}</span>`).join('') : '';
    const escapedTags = (r.tags || '').replace(/'/g, "\\'");
    
    return `
        <div class="recipe-item ${isActive}" data-filename="${r.filename}" onclick="viewRecipe('${r.filename}')">
            <h3>${r.name}</h3>
            <p>${r.style || 'No style'} • OG: ${r.og} • IBU: ${r.ibu}</p>
            ${r.tags ? `<div>${tagBadges}</div>` : ''}
            <button class="btn btn-small" style="margin-top: 5px; font-size: 0.75em; padding: 3px 8px;" 
                onclick="event.stopPropagation(); openTagModal('${r.filename}', '${escapedTags}');">✏️ Tags</button>
        </div>
    `;
}

function loadTagFilters() {
    const allTags = new Set();
    allRecipes.forEach(r => {
        if (r.tags) {
            r.tags.split(',').forEach(t => allTags.add(t.trim()));
        }
    });
    
    const tagFilter = document.getElementById('tagFilter');
    tagFilter.innerHTML = '<option value="">All Recipes</option>' + 
        Array.from(allTags).sort().map(tag => 
            `<option value="${tag}" ${selectedTag === tag ? 'selected' : ''}>${tag}</option>`
        ).join('');
}

function filterByTag(tag) {
    selectedTag = tag;
    if (tag) {
        recipes = allRecipes.filter(r => r.tags && r.tags.includes(tag));
    } else {
        recipes = allRecipes;
    }
    document.getElementById('searchBox').value = '';
    renderRecipeList();
    loadTagFilters();
}



async function viewRecipe(filename) {
    const res = await fetch(`/api/recipe/${filename}`);
    currentRecipe = await res.json();
    editMode = false;
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab[onclick*="recipes"]').classList.add('active');
    document.getElementById('recipesTab').classList.add('active');
    
    renderRecipeDetail();
    renderRecipeList();
}

function createNewRecipe() {
    console.log('createNewRecipe called');
    try {
        currentRecipe = null;
        editMode = true;
        grains = [];
        hops = [];
        yeasts = [];
        selectedStyle = null;
        renderRecipeForm();
        console.log('Recipe form rendered');
    } catch (error) {
        console.error('Error in createNewRecipe:', error);
    }
}

function editRecipe() {
    editMode = true;
    grains = currentRecipe.grains || [];
    hops = currentRecipe.hops || [];
    yeasts = currentRecipe.yeasts || [];
    
    const styles = JSON.parse(sessionStorage.getItem('bjcpStyles') || '[]');
    const styleMatch = styles.find(s => currentRecipe.style && currentRecipe.style.includes(s.name));
    selectedStyle = styleMatch || null;
    
    renderRecipeForm();
}

function renderRecipeDetail() {
    const detail = document.getElementById('recipeDetail');
    
    // Get style info for ranges
    const styles = JSON.parse(sessionStorage.getItem('bjcpStyles') || '[]');
    const recipeStyle = styles.find(s => currentRecipe.style && currentRecipe.style.includes(s.name));
    
    detail.innerHTML = `
        <div class="recipe-header">
            <h1>${currentRecipe.name}</h1>
            <div>
                <button class="btn btn-small" onclick="editRecipe()">Edit</button>
                <a href="/api/recipe/${currentRecipe.filename}/export" class="btn btn-small" style="background: #059669;">Export</a>
                <button class="btn btn-small" style="background: #dc2626;" onclick="deleteRecipe()">Delete</button>
            </div>
        </div>
        
        <div class="form-section">
            <h2>Details</h2>
            <p><strong>Brewer:</strong> ${currentRecipe.brewer}</p>
            <p><strong>Style:</strong> ${currentRecipe.style || 'None'}</p>
            <p><strong>Batch Size:</strong> ${currentRecipe.batch_size} gallons</p>
            ${currentRecipe.tags ? `<p><strong>Tags:</strong> ${currentRecipe.tags}</p>` : ''}
        </div>
        
        <div class="stats-panel">
            <h2>Calculated Stats</h2>
            ${recipeStyle ? renderStatBars(currentRecipe, recipeStyle) : renderSimpleStats(currentRecipe)}
        </div>
        
        ${currentRecipe.grains && currentRecipe.grains.length > 0 ? `
        <div class="form-section">
            <h2>Grains</h2>
            ${currentRecipe.grains.map(g => `
                <p><strong>${g.name}:</strong> ${g.amount} lbs (${g.lovibond}°L, ${g.ppg} PPG)</p>
            `).join('')}
        </div>
        ` : ''}
        
        ${currentRecipe.hops && currentRecipe.hops.length > 0 ? `
        <div class="form-section">
            <h2>Hops</h2>
            ${currentRecipe.hops.map(h => `
                <p><strong>${h.name}:</strong> ${h.amount} oz (${h.alpha}% AA, ${h.time} min)</p>
            `).join('')}
        </div>
        ` : ''}
        
        ${currentRecipe.yeasts && currentRecipe.yeasts.length > 0 ? `
        <div class="form-section">
            <h2>Yeast</h2>
            ${currentRecipe.yeasts.map(y => `
                <p><strong>${y.name}</strong> (${y.type})</p>
            `).join('')}
        </div>
        ` : ''}
    `;
}

function renderStatBars(recipe, style) {
    const stats = [
        { label: 'IBU', value: recipe.ibu, range: style.ibu, max: 100 },
        { label: 'SRM', value: recipe.srm, range: style.srm, max: 40 },
        { label: 'OG', value: (recipe.og - 1) * 1000, range: [(style.og[0] - 1) * 1000, (style.og[1] - 1) * 1000], max: 120, displayValue: recipe.og.toFixed(3) }
    ];
    
    return stats.map(s => {
        const rangeStart = (s.range[0] / s.max) * 100;
        const rangeWidth = ((s.range[1] - s.range[0]) / s.max) * 100;
        const valuePercent = Math.min((s.value / s.max) * 100, 100);
        
        const inRange = s.value >= s.range[0] && s.value <= s.range[1];
        const belowRange = s.value < s.range[0];
        const colorClass = inRange ? 'in-range' : belowRange ? 'below-range' : 'above-range';
        
        return `
            <div class="stat-bar-container">
                <div class="stat-bar-label">
                    <span>${s.label}</span>
                    <span>${s.displayValue || s.value.toFixed(1)}</span>
                </div>
                <div class="stat-bar-track">
                    <div class="stat-bar-range" style="left: ${rangeStart}%; width: ${rangeWidth}%;"></div>
                    <div class="stat-bar-value ${colorClass}" style="width: ${valuePercent}%;"></div>
                    <div class="stat-bar-marker" style="left: ${valuePercent}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderSimpleStats(recipe) {
    return `
        <div class="stats">
            <div class="stat-box">
                <div class="stat-label">Original Gravity</div>
                <div class="stat-value">${recipe.og}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">IBU</div>
                <div class="stat-value">${recipe.ibu}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">SRM</div>
                <div class="stat-value">${recipe.srm}</div>
            </div>
        </div>
    `;
}

function renderRecipeForm() {
    const detail = document.getElementById('recipeDetail');
    detail.innerHTML = `
        <div class="recipe-header">
            <h1>${currentRecipe ? 'Edit Recipe' : 'New Recipe'}</h1>
        </div>
        
        <form id="recipeForm" onsubmit="saveRecipe(event)">
            <div class="form-section">
                <h2>Recipe Details</h2>
                <label>Recipe Name</label>
                <input type="text" id="name" value="${currentRecipe ? currentRecipe.name : ''}" required>
                
                <label>Brewer Name</label>
                <input type="text" id="brewer" value="${currentRecipe ? currentRecipe.brewer : ''}" required>
                
                <label>Batch Size (gallons)</label>
                <input type="number" id="batch_size" value="${currentRecipe ? currentRecipe.batch_size : 5}" step="0.1" required>
                
                <label>Tags (comma-separated)</label>
                <input type="text" id="tags" value="${currentRecipe ? currentRecipe.tags || '' : ''}" placeholder="IPA, hoppy, experimental">
                
                <label>BJCP Style</label>
                <select id="style" onchange="handleStyleChange()">
                    <option value="">Select a style...</option>
                </select>
            </div>

            <div class="form-section">
                <h2>Grains</h2>
                <label>Search Grains</label>
                <div class="ingredient-search">
                    <input type="text" id="grainSearch" placeholder="Type to search...">
                    <div id="grainResults" class="search-results"></div>
                </div>
                <div id="grainList" class="ingredient-list"></div>
            </div>

            <div class="form-section">
                <h2>Hops</h2>
                <label>Search Hops</label>
                <div class="ingredient-search">
                    <input type="text" id="hopSearch" placeholder="Type to search...">
                    <div id="hopResults" class="search-results"></div>
                </div>
                <div id="hopList" class="ingredient-list"></div>
            </div>

            <div class="form-section">
                <h2>Yeast</h2>
                <label>Search Yeast</label>
                <div class="ingredient-search">
                    <input type="text" id="yeastSearch" placeholder="Type to search...">
                    <div id="yeastResults" class="search-results"></div>
                </div>
                <div id="yeastList" class="ingredient-list"></div>
            </div>

            <div class="stats-panel">
                <h2>Calculated Stats</h2>
                <div class="stats">
                    <div class="stat-box">
                        <div class="stat-label">Original Gravity</div>
                        <div class="stat-value" id="calcOG">-</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">IBU</div>
                        <div class="stat-value" id="calcIBU">-</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">SRM</div>
                        <div class="stat-value" id="calcSRM">-</div>
                    </div>
                </div>
                <canvas id="styleChart" width="600" height="250"></canvas>
            </div>

            <div class="action-buttons">
                <button type="submit" class="btn">${currentRecipe ? 'Update Recipe' : 'Save Recipe'}</button>
                <button type="button" class="btn" style="background: #6b7280;" onclick="cancelEdit()">Cancel</button>
            </div>
        </form>
    `;
    
    populateStyleSelect();
    setupIngredientSearch('grain', 'grainSearch', 'grainResults', addGrain);
    setupIngredientSearch('hop', 'hopSearch', 'hopResults', addHop);
    setupIngredientSearch('yeast', 'yeastSearch', 'yeastResults', addYeast);
    
    renderGrains();
    renderHops();
    renderYeasts();
    calculate();
}

function cancelEdit() {
    if (currentRecipe) {
        editMode = false;
        renderRecipeDetail();
    } else {
        document.getElementById('recipeDetail').innerHTML = '<div class="empty-state"><h2>Select a recipe or create a new one</h2></div>';
    }
}

async function loadBJCPStyles() {
    const res = await fetch('/api/bjcp/styles');
    const styles = await res.json();
    sessionStorage.setItem('bjcpStyles', JSON.stringify(styles));
}

function populateStyleSelect() {
    const styles = JSON.parse(sessionStorage.getItem('bjcpStyles') || '[]');
    const select = document.getElementById('style');
    styles.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.id} - ${s.name}`;
        if (currentRecipe && currentRecipe.style && currentRecipe.style.includes(s.name)) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

function handleStyleChange() {
    const styles = JSON.parse(sessionStorage.getItem('bjcpStyles') || '[]');
    const select = document.getElementById('style');
    selectedStyle = styles.find(s => s.id === select.value);
    updateVisualization();
}

function setupIngredientSearch(type, inputId, resultsId, addCallback) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);
    
    let timeout;
    input.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            if (input.value.length < 2) {
                results.innerHTML = '';
                return;
            }
            
            const res = await fetch(`/api/ingredients/search?q=${input.value}&type=${type}`);
            const items = await res.json();
            
            results.innerHTML = items.map(i => 
                `<div class="search-result" data-item='${JSON.stringify(i)}'>${i.name}</div>`
            ).join('');
            
            results.querySelectorAll('.search-result').forEach(el => {
                el.addEventListener('click', () => {
                    addCallback(JSON.parse(el.dataset.item));
                    input.value = '';
                    results.innerHTML = '';
                });
            });
            
            if (items.length === 0) {
                results.innerHTML = `<div class="search-result"><button class="add-custom-btn" onclick="addCustom('${type}', '${input.value}')">Add "${input.value}" as new ${type}</button></div>`;
            }
        }, 300);
    });
}

function addGrain(grain) {
    grains.push({
        name: grain.name,
        amount: 1,
        ppg: grain.ppg || 37,
        lovibond: grain.lovibond || 2,
        efficiency: 75
    });
    renderGrains();
    calculate();
}

function addHop(hop) {
    hops.push({
        name: hop.name,
        amount: 1,
        alpha: hop.alpha || 5,
        time: 60
    });
    renderHops();
    calculate();
}

function addYeast(yeast) {
    yeasts.push({ name: yeast.name, type: yeast.yeast_type || 'Ale' });
    renderYeasts();
}

function renderGrains() {
    document.getElementById('grainList').innerHTML = grains.map((g, i) => `
        <div class="ingredient-item">
            <div class="ingredient-header">
                <span class="ingredient-name">${g.name}</span>
                <button type="button" class="remove-btn" onclick="grains.splice(${i}, 1); renderGrains(); calculate();">Remove</button>
            </div>
            <div class="ingredient-inputs">
                <div class="input-group">
                    <label>Amount (lbs)</label>
                    <input type="number" value="${g.amount}" step="0.1" onchange="grains[${i}].amount=+this.value; calculate();">
                </div>
                <div class="input-group">
                    <label>PPG</label>
                    <input type="number" value="${g.ppg}" onchange="grains[${i}].ppg=+this.value; calculate();">
                </div>
                <div class="input-group">
                    <label>Lovibond (°L)</label>
                    <input type="number" value="${g.lovibond}" onchange="grains[${i}].lovibond=+this.value; calculate();">
                </div>
                <div class="input-group">
                    <label>Efficiency (%)</label>
                    <input type="number" value="${g.efficiency}" onchange="grains[${i}].efficiency=+this.value; calculate();">
                </div>
            </div>
        </div>
    `).join('');
}

function renderHops() {
    document.getElementById('hopList').innerHTML = hops.map((h, i) => `
        <div class="ingredient-item">
            <div class="ingredient-header">
                <span class="ingredient-name">${h.name}</span>
                <button type="button" class="remove-btn" onclick="hops.splice(${i}, 1); renderHops(); calculate();">Remove</button>
            </div>
            <div class="ingredient-inputs">
                <div class="input-group">
                    <label>Amount (oz)</label>
                    <input type="number" value="${h.amount}" step="0.1" onchange="hops[${i}].amount=+this.value; calculate();">
                </div>
                <div class="input-group">
                    <label>Alpha Acid (%)</label>
                    <input type="number" value="${h.alpha}" step="0.1" onchange="hops[${i}].alpha=+this.value; calculate();">
                </div>
                <div class="input-group">
                    <label>Boil Time (min)</label>
                    <input type="number" value="${h.time}" onchange="hops[${i}].time=+this.value; calculate();">
                </div>
            </div>
        </div>
    `).join('');
}

function renderYeasts() {
    document.getElementById('yeastList').innerHTML = yeasts.map((y, i) => `
        <div class="ingredient-item">
            <div class="ingredient-header">
                <span class="ingredient-name">${y.name} (${y.type})</span>
                <button type="button" class="remove-btn" onclick="yeasts.splice(${i}, 1); renderYeasts();">Remove</button>
            </div>
        </div>
    `).join('');
}

async function calculate() {
    const batch_size = +document.getElementById('batch_size').value || 5;
    
    const res = await fetch('/api/recipe/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grains, hops, batch_size })
    });
    
    const stats = await res.json();
    document.getElementById('calcOG').textContent = stats.og.toFixed(3);
    document.getElementById('calcIBU').textContent = stats.ibu.toFixed(1);
    document.getElementById('calcSRM').textContent = stats.srm.toFixed(1);
    
    updateVisualization(stats);
}

function updateVisualization(stats) {
    if (!selectedStyle || !stats) return;
    
    const canvas = document.getElementById('styleChart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const metrics = [
        { label: 'IBU', value: stats.ibu, range: selectedStyle.ibu, max: 100 },
        { label: 'SRM', value: stats.srm, range: selectedStyle.srm, max: 40 },
        { label: 'OG', value: (stats.og - 1) * 1000, range: [(selectedStyle.og[0] - 1) * 1000, (selectedStyle.og[1] - 1) * 1000], max: 120 }
    ];
    
    const barHeight = 60;
    const startY = 20;
    const barWidth = 450;
    const startX = 100;
    
    metrics.forEach((m, i) => {
        const y = startY + i * 80;
        
        // Background bar
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(startX, y, barWidth, barHeight);
        
        // Style range (yellow)
        const rangeStart = (m.range[0] / m.max) * barWidth;
        const rangeWidth = ((m.range[1] - m.range[0]) / m.max) * barWidth;
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(startX + rangeStart, y, rangeWidth, barHeight);
        
        // Value indicator with color coding
        const valuePos = Math.min((m.value / m.max) * barWidth, barWidth);
        const inRange = m.value >= m.range[0] && m.value <= m.range[1];
        const tooLow = m.value < m.range[0];
        
        // Color bar from start to value position
        if (inRange) {
            ctx.fillStyle = '#10b981'; // Green if in range
        } else if (tooLow) {
            ctx.fillStyle = '#3b82f6'; // Blue if too low
        } else {
            ctx.fillStyle = '#ef4444'; // Red if too high
        }
        ctx.fillRect(startX, y, valuePos, barHeight);
        
        // Value line
        ctx.fillStyle = '#000';
        ctx.fillRect(startX + valuePos - 2, y - 5, 4, barHeight + 10);
        
        // Labels
        ctx.fillStyle = '#000';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(m.label, 10, y + 38);
        ctx.fillText(m.value.toFixed(1), startX + barWidth + 15, y + 38);
    });
}

async function addCustom(type, name) {
    const defaults = {
        grain: { ppg: 37, lovibond: 2 },
        hop: { alpha: 5 },
        yeast: { yeast_type: 'Ale' }
    };
    
    const ingredient = { name, type, ...defaults[type] };
    
    await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ingredient)
    });
    
    if (type === 'grain') addGrain(ingredient);
    else if (type === 'hop') addHop(ingredient);
    else if (type === 'yeast') addYeast(ingredient);
}

async function saveRecipe(e) {
    e.preventDefault();
    
    const batch_size = +document.getElementById('batch_size').value;
    const res = await fetch('/api/recipe/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grains, hops, batch_size })
    });
    const stats = await res.json();
    
    const recipe = {
        name: document.getElementById('name').value,
        brewer: document.getElementById('brewer').value,
        style: document.getElementById('style').selectedOptions[0].text,
        batch_size,
        tags: document.getElementById('tags').value,
        grains,
        hops,
        yeasts,
        ...stats
    };
    
    const url = currentRecipe ? `/api/recipe/${currentRecipe.filename}` : '/api/recipe';
    const method = currentRecipe ? 'PUT' : 'POST';
    
    const saveRes = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe)
    });
    
    const saved = await saveRes.json();
    await loadRecipes();
    await viewRecipe(saved.filename);
}

async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const text = await file.text();
    const res = await fetch('/api/recipe/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: text
    });
    
    if (res.ok) {
        const recipe = await res.json();
        await loadRecipes();
        await viewRecipe(recipe.filename);
    } else {
        alert('Failed to import recipe');
    }
    
    e.target.value = '';
}

async function handleSearch() {
    const query = document.getElementById('searchBox').value;
    
    if (!query) {
        recipes = allRecipes;
        renderRecipeList();
        return;
    }
    
    const res = await fetch(`/api/recipes/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
        recipes = await res.json();
        renderRecipeList();
    }
}



function openTagModal(filename, tags) {
    editingTagsFilename = filename;
    document.getElementById('modalTags').value = tags;
    document.getElementById('tagModal').classList.add('show');
}

function closeTagModal() {
    document.getElementById('tagModal').classList.remove('show');
    editingTagsFilename = null;
}

async function saveTagsFromModal() {
    const tags = document.getElementById('modalTags').value;
    
    const res = await fetch(`/api/recipe/${editingTagsFilename}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags })
    });
    
    if (res.ok) {
        await loadRecipes();
        if (currentRecipe && currentRecipe.filename === editingTagsFilename) {
            currentRecipe.tags = tags;
            renderRecipeDetail();
        }
        closeTagModal();
    } else {
        alert('Failed to update tags');
    }
}



async function deleteRecipe() {
    if (!confirm(`Delete recipe "${currentRecipe.name}"? This cannot be undone.`)) {
        return;
    }
    
    const res = await fetch(`/api/recipe/${currentRecipe.filename}`, {
        method: 'DELETE'
    });
    
    if (res.ok) {
        currentRecipe = null;
        await loadRecipes();
        document.getElementById('recipeDetail').innerHTML = '<div class="empty-state"><h2>Select a recipe or create a new one</h2></div>';
    } else {
        alert('Failed to delete recipe');
    }
}



function switchTab(e, tabName) {
    console.log('switchTab called:', tabName, 'event:', e);
    try {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        
        e.target.classList.add('active');
        document.getElementById(tabName + 'Tab').classList.add('active');
        
        console.log('Tab switched to:', tabName);
        
        if (tabName === 'grains') loadIngredientTable('grain');
        else if (tabName === 'hops') loadIngredientTable('hop');
        else if (tabName === 'yeasts') loadIngredientTable('yeast');
        else if (tabName === 'styles') loadStylesTable();
    } catch (error) {
        console.error('Error in switchTab:', error);
    }
}

async function loadIngredientTable(type) {
    console.log('loadIngredientTable called for type:', type);
    const res = await fetch('/api/ingredients');
    if (!res.ok) {
        console.error('Failed to fetch ingredients:', res.status);
        return;
    }
    
    const ingredients = await res.json();
    const filtered = ingredients.filter(i => i.type === type);
    
    const tableId = type === 'grain' ? 'grainsTable' : type === 'hop' ? 'hopsTable' : 'yeastsTable';
    const table = document.getElementById(tableId);
    
    let headers = [];
    if (type === 'grain') headers = ['Name', 'PPG', 'Lovibond', 'Actions'];
    else if (type === 'hop') headers = ['Name', 'Alpha Acid %', 'Actions'];
    else if (type === 'yeast') headers = ['Name', 'Type', 'Actions'];
    
    table.innerHTML = `
        <table>
            <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>
                ${filtered.map(i => {
                    let cells = [];
                    if (type === 'grain') cells = [i.name, i.ppg, i.lovibond];
                    else if (type === 'hop') cells = [i.name, i.alpha];
                    else if (type === 'yeast') cells = [i.name, i.yeast_type || i.type];
                    
                    return `<tr>
                        ${cells.map(c => `<td>${c}</td>`).join('')}
                        <td>
                            <button class="btn btn-small edit-btn" onclick="editIngredient(${i.id}, '${type}')">Edit</button>
                            <button class="btn btn-small" style="background: #dc2626;" onclick="deleteIngredient(${i.id})">Delete</button>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    `;
}

async function loadStylesTable() {
    const styles = JSON.parse(sessionStorage.getItem('bjcpStyles') || '[]');
    const table = document.getElementById('stylesTable');
    
    table.innerHTML = `
        <table>
            <thead><tr><th>ID</th><th>Name</th><th>IBU Range</th><th>SRM Range</th><th>OG Range</th><th>Actions</th></tr></thead>
            <tbody>
                ${styles.map(s => `
                    <tr>
                        <td>${s.id}</td>
                        <td>${s.name}</td>
                        <td>${s.ibu[0]} - ${s.ibu[1]}</td>
                        <td>${s.srm[0]} - ${s.srm[1]}</td>
                        <td>${s.og[0].toFixed(3)} - ${s.og[1].toFixed(3)}</td>
                        <td><button class="btn btn-small" onclick='showStyleDetail(${JSON.stringify(s)})'>Details</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function addNewIngredient(type) {
    let ingredient = { type };
    
    if (type === 'grain') {
        ingredient.name = document.getElementById('newGrainName').value;
        ingredient.ppg = +document.getElementById('newGrainPPG').value;
        ingredient.lovibond = +document.getElementById('newGrainLovibond').value;
    } else if (type === 'hop') {
        ingredient.name = document.getElementById('newHopName').value;
        ingredient.alpha = +document.getElementById('newHopAlpha').value;
    } else if (type === 'yeast') {
        ingredient.name = document.getElementById('newYeastName').value;
        ingredient.yeast_type = document.getElementById('newYeastType').value;
    }
    
    if (!ingredient.name) {
        alert('Please enter a name');
        return;
    }
    
    const res = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ingredient)
    });
    
    if (res.ok) {
        if (type === 'grain') {
            document.getElementById('newGrainName').value = '';
            document.getElementById('newGrainPPG').value = '37';
            document.getElementById('newGrainLovibond').value = '2';
        } else if (type === 'hop') {
            document.getElementById('newHopName').value = '';
            document.getElementById('newHopAlpha').value = '5';
        } else if (type === 'yeast') {
            document.getElementById('newYeastName').value = '';
        }
        loadIngredientTable(type);
    } else {
        alert('Failed to add ingredient');
    }
}

async function deleteIngredient(id) {
    if (!confirm('Delete this ingredient?')) return;
    
    const res = await fetch('/api/ingredients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    
    if (res.ok) {
        const activeTab = document.querySelector('.tab.active').textContent.toLowerCase();
        if (activeTab === 'grains') loadIngredientTable('grain');
        else if (activeTab === 'hops') loadIngredientTable('hop');
        else if (activeTab === 'yeasts') loadIngredientTable('yeast');
    } else {
        alert('Failed to delete ingredient');
    }
}

async function editIngredient(id, type) {
    const res = await fetch('/api/ingredients');
    if (!res.ok) return;
    
    const ingredients = await res.json();
    const ingredient = ingredients.find(i => i.id === id);
    if (!ingredient) return;
    
    editingIngredient = ingredient;
    
    document.getElementById('ingredientModalTitle').textContent = `Edit ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    
    let content = '';
    if (type === 'grain') {
        content = `
            <label>Name</label>
            <input type="text" id="editIngredientName" value="${ingredient.name}" style="width: 100%; margin-bottom: 10px;">
            <label>PPG</label>
            <input type="number" id="editIngredientPPG" value="${ingredient.ppg}" style="width: 100%; margin-bottom: 10px;">
            <label>Lovibond</label>
            <input type="number" id="editIngredientLovibond" value="${ingredient.lovibond}" style="width: 100%; margin-bottom: 10px;">
        `;
    } else if (type === 'hop') {
        content = `
            <label>Name</label>
            <input type="text" id="editIngredientName" value="${ingredient.name}" style="width: 100%; margin-bottom: 10px;">
            <label>Alpha Acid %</label>
            <input type="number" id="editIngredientAlpha" value="${ingredient.alpha}" step="0.1" style="width: 100%; margin-bottom: 10px;">
        `;
    } else if (type === 'yeast') {
        content = `
            <label>Name</label>
            <input type="text" id="editIngredientName" value="${ingredient.name}" style="width: 100%; margin-bottom: 10px;">
            <label>Type</label>
            <select id="editIngredientType" style="width: 100%; margin-bottom: 10px;">
                <option ${ingredient.yeast_type === 'Ale' || ingredient.type === 'Ale' ? 'selected' : ''}>Ale</option>
                <option ${ingredient.yeast_type === 'Lager' || ingredient.type === 'Lager' ? 'selected' : ''}>Lager</option>
                <option ${ingredient.yeast_type === 'Wheat' || ingredient.type === 'Wheat' ? 'selected' : ''}>Wheat</option>
                <option ${ingredient.yeast_type === 'Wild' || ingredient.type === 'Wild' ? 'selected' : ''}>Wild</option>
            </select>
        `;
    }
    
    document.getElementById('ingredientModalContent').innerHTML = content;
    document.getElementById('ingredientModal').classList.add('show');
}

function closeIngredientModal() {
    document.getElementById('ingredientModal').classList.remove('show');
    editingIngredient = null;
}

async function saveIngredientFromModal() {
    if (!editingIngredient) return;
    
    const updated = { ...editingIngredient };
    updated.name = document.getElementById('editIngredientName').value;
    
    if (updated.type === 'grain') {
        updated.ppg = +document.getElementById('editIngredientPPG').value;
        updated.lovibond = +document.getElementById('editIngredientLovibond').value;
    } else if (updated.type === 'hop') {
        updated.alpha = +document.getElementById('editIngredientAlpha').value;
    } else if (updated.type === 'yeast') {
        updated.yeast_type = document.getElementById('editIngredientType').value;
    }
    
    const res = await fetch('/api/ingredients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
    });
    
    if (res.ok) {
        closeIngredientModal();
        loadIngredientTable(updated.type);
    } else {
        alert('Failed to update ingredient');
    }
}

function showStyleDetail(style) {
    document.getElementById('styleModalTitle').textContent = `${style.id} - ${style.name}`;
    
    const content = `
        <div class="style-detail-grid">
            <div class="style-detail-item">
                <strong>IBU Range</strong>
                <p>${style.ibu[0]} - ${style.ibu[1]}</p>
            </div>
            <div class="style-detail-item">
                <strong>SRM Range</strong>
                <p>${style.srm[0]} - ${style.srm[1]}</p>
            </div>
            <div class="style-detail-item">
                <strong>Original Gravity</strong>
                <p>${style.og[0].toFixed(3)} - ${style.og[1].toFixed(3)}</p>
            </div>
            <div class="style-detail-item">
                <strong>Final Gravity</strong>
                <p>${style.fg[0].toFixed(3)} - ${style.fg[1].toFixed(3)}</p>
            </div>
        </div>
        <h3>Characteristics</h3>
        <p><strong>Bitterness:</strong> ${style.ibu[0]}-${style.ibu[1]} IBU</p>
        <p><strong>Color:</strong> ${style.srm[0]}-${style.srm[1]} SRM</p>
        <p><strong>Alcohol:</strong> ${((style.og[0] - style.fg[0]) * 131.25).toFixed(1)}%-${((style.og[1] - style.fg[1]) * 131.25).toFixed(1)}% ABV (estimated)</p>
    `;
    
    document.getElementById('styleModalContent').innerHTML = content;
    document.getElementById('styleModal').classList.add('show');
}

function closeStyleModal() {
    document.getElementById('styleModal').classList.remove('show');
}
