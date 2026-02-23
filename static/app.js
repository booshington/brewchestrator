let recipes = [];
let currentRecipe = null;
let grains = [], hops = [], yeasts = [];
let selectedStyle = null;
let editMode = false;
let recipeDirectory = null;

document.addEventListener('DOMContentLoaded', () => {
    loadBJCPStyles();
    checkDirectory();
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

async function checkDirectory() {
    const res = await fetch('/api/directory');
    const data = await res.json();
    
    if (data.directory) {
        recipeDirectory = data.directory;
        document.getElementById('directoryInput').value = data.directory;
        showRecipeInterface();
        loadRecipes();
    }
}

function showRecipeInterface() {
    document.getElementById('directorySection').style.display = 'none';
    document.getElementById('recipeActions').style.display = 'block';
}

async function setDirectory() {
    const directory = document.getElementById('directoryInput').value;
    
    const res = await fetch('/api/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory })
    });
    
    if (res.ok) {
        const data = await res.json();
        recipeDirectory = data.directory;
        showRecipeInterface();
        loadRecipes();
    } else {
        alert('Invalid directory path. Please enter a valid directory.');
    }
}

async function loadRecipes() {
    const res = await fetch('/api/recipes');
    if (!res.ok) {
        recipes = [];
        renderRecipeList();
        return;
    }
    recipes = await res.json();
    renderRecipeList();
}

function renderRecipeList() {
    const list = document.getElementById('recipeList');
    if (recipes.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No recipes yet</div>';
        return;
    }
    
    list.innerHTML = recipes.map(r => `
        <div class="recipe-item ${currentRecipe && currentRecipe.filename === r.filename ? 'active' : ''}" onclick="viewRecipe('${r.filename}')">
            <h3>${r.name}</h3>
            <p>${r.style || 'No style'} • OG: ${r.og} • IBU: ${r.ibu}</p>
        </div>
    `).join('');
}

async function viewRecipe(filename) {
    const res = await fetch(`/api/recipe/${filename}`);
    currentRecipe = await res.json();
    editMode = false;
    renderRecipeDetail();
    renderRecipeList();
}

function createNewRecipe() {
    currentRecipe = null;
    editMode = true;
    grains = [];
    hops = [];
    yeasts = [];
    selectedStyle = null;
    renderRecipeForm();
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
            <div class="stats">
                <div class="stat-box">
                    <div class="stat-label">Original Gravity</div>
                    <div class="stat-value">${currentRecipe.og}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">IBU</div>
                    <div class="stat-value">${currentRecipe.ibu}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">SRM</div>
                    <div class="stat-value">${currentRecipe.srm}</div>
                </div>
            </div>
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
