// ============================================
// GLOBAL STATE
// ============================================
let phageData = [];
let eopData = [];
let BL21GeneData = [];
let KeioGeneData = [];
let dubseqPhages = [];
let networkData = { nodes: [], links: [] };
let selectedPhages = new Set();
let highlightedPhage = null;
let currentPhage = null;
let familyColors = {};
let taxonomyColorScales = {};
let tableFilters = []; // Array of {column, values} objects
let tableSort = { column: null, direction: 0 }; // 0=default, 1=asc, -1=desc
let tableSearchText = '';
let openFilterDropdownEl = null;

// colors and shapes
porin_colors = {
    'FadL': '#727fd9',
    'Tsx': '#66af6c',
    'OmpA': '#8551a7',
    'OmpC': '#a89d3f',
    'OmpF': '#b05742',
    'OmpW': '#e263a8'
}

LPS_shapes = {
    'Kdo': 'circle',
    'HepI': 'square',
    'HepII': 'diamond',
    'GluI': 'triangle_point_up',
    'GluII': 'triangle_point_down',
    'Resistant': 'x'
}

// SVG dimensions for network
const networkMargin = { top: 20, right: 20, bottom: 20, left: 20 };
let networkWidth, networkHeight;

// ============================================
// DATA LOADING AND PROCESSING
// ============================================
async function loadData() {
    try {
        // Load TSV metadata
        phageData = await d3.tsv('./data/Table_S1_Phages.tsv');
        
        // Load EOP data
        eopData = await d3.csv('./data/KEIO_EOP_reformatted.csv');

        BL21GeneData = await d3.tsv('./barseq_browser/data/BL21/genes_w_ecocyc.tab')
        KeioGeneData = await d3.tsv('./barseq_browser/data/Keio/genes_w_ecocyc.tab')

        const dubseq_metadata = await d3.csv('./barseq_browser/data/Dubseq_sets.csv')
        dubseqPhages = new Set(dubseq_metadata.map((row) => row['phage']));

        // Load network data
        const ntwResponse = await fetch('./data/c1_new.ntw');
        const ntwText = await ntwResponse.text();
        const rawNetworkData = parseNTW(ntwText);
        
        // Filter network data to only include phages in the TSV
        const phageNames = new Set(phageData.map(d => d.Phage));
        const filteredLinks = rawNetworkData.filter(link => 
            phageNames.has(link.source) && phageNames.has(link.target)
        );
        
        // Sort phage data by taxonomy
        phageData.sort((a, b) => {
            const classCompare = (b.Class || '').localeCompare(a.Class || '');
            if (classCompare !== 0) return classCompare;

            const familyCompare = (b.Family || '').localeCompare(a.Family || '');
            if (familyCompare !== 0) return familyCompare;

            const subfamilyCompare = (b.Subfamily || '').localeCompare(a.Subfamily || '');
            if (subfamilyCompare !== 0) return subfamilyCompare;

            return (b.Genus || '').localeCompare(a.Genus || '');
        });
        // Tag each row with its canonical taxonomy order for sort-reset
        phageData.forEach((d, i) => { d._origIndex = i; });
        
        // Create network structure
        networkData.nodes = phageData.map(d => ({
            id: d.Phage,
            data: d
        }));
        
        // old, trying to include everything, but then the simulation is super slow
        /*
        networkData.nodes = [...(new Set(rawNetworkData.map(link => link.source)))].map(function(d) {
            const datum = { id: d}
            const filt_metadata = phageData.filter(d2 => d2.Phage==d);
            if (filt_metadata.length==1) {
                datum.data = filt_metadata[0]
            } else {
                datum.data = null;
            }
            return datum
        })
        console.log(networkData.nodes)
        */
        
        networkData.links = filteredLinks.map(link => ({
            source: link.source,
            target: link.target,
            weight: link.weight
        }));
        
        // Generate family colors
        generateFamilyColors();
        generateTaxonomyColors();

        // Initialize visualizations
        initializeNetwork();
        initializeTable();

        // Open popup if phage is specified in URL
        const urlPhage = new URLSearchParams(window.location.search).get('phage');
        if (urlPhage) {
            const match = phageData.find(d => d.Phage === urlPhage);
            if (match) showPopup(match);
        }

    } catch (error) {
        console.error('Error loading data:', error);
        alert('Error loading data. Please check the console for details.');
    }
}

function parseNTW(text) {
    const lines = text.trim().split('\n');
    return lines.map(line => {
        const [source, target, weight] = line.split(/\s+/);
        return {
            source,
            target,
            weight: parseFloat(weight)
        };
    });
}

function generateFamilyColors() {
    const families = [...new Set(phageData.map(d => d.Family).filter(f => f))];
    const colorScale = d3.scaleOrdinal(d3.schemeSet3);
    
    families.forEach((family, i) => {
        familyColors[family] = colorScale(i);
    });
    familyColors[''] = '#666666'; // Null/empty values
}

function getFamilyColor(family) {
    return familyColors[family] || familyColors[''];
}

// Mulberry32 seeded PRNG — same seed → same layout every load
function seededRandom(seed) {
    return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function generateTaxonomyColors() {
    const columns = ['Family', 'Subfamily', 'Genus'];
    columns.forEach(col => {
        const values = [...new Set(phageData.map(d => d[col]).filter(v => v))];
        if (col === 'Family') {
            taxonomyColorScales[col] = d3.scaleOrdinal().domain(values).range(values.map(v => getFamilyColor(v)));
        } else if (col === 'Subfamily') {
            taxonomyColorScales[col] = d3.scaleOrdinal(d3.schemePastel1).domain(values);
        } else if (col === 'Genus') {
            taxonomyColorScales[col] = d3.scaleOrdinal(d3.schemePastel2).domain(values);
        }
    });
}

// ============================================
// NETWORK VISUALIZATION
// ============================================
function initializeNetwork() {
    const container = d3.select('#network-container');
    container.selectAll('*').remove();
    
    // Fixed canonical dimensions — simulation always runs in this space so layout is identical
    // regardless of actual window size. SVG viewBox scales it to fill the container.
    const CANON_W = 1040;
    const CANON_H = 940;
    networkWidth = CANON_W - networkMargin.left - networkMargin.right;
    networkHeight = CANON_H - networkMargin.top - networkMargin.bottom;

    const svg = container.append('svg')
        .attr('viewBox', `0 0 ${CANON_W} ${CANON_H}`)
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .attr('role', 'img')
        .attr('aria-label', `Network graph of ${networkData.nodes.length} phages colored by family, showing sequence similarity connections`);
    
    const background_g = svg.append('g')
        .attr('transform', `translate(${networkMargin.left},${networkMargin.top})`);

    const g = svg.append('g')
        .attr('transform', `translate(${networkMargin.left},${networkMargin.top})`);
    
    // Create legend for families with 2+ phages
    const familyCounts = {};
    phageData.forEach(d => {
        if (d.Family) {
            familyCounts[d.Family] = (familyCounts[d.Family] || 0) + 1;
        }
    });
    
    const legendFamilies = Object.entries(familyCounts)
        .filter(([family, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .map(([family, count]) => family);
    
    const legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(5, 5)`);


    legend.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .style('font-size', '20px')
        .style('font-weight', 'bold')
        .style('fill', '#CCC')
        .text('Family');


    legendFamilies.forEach((family, i) => {
        const legendRow = legend.append('g')
            .attr('transform', `translate(0, ${22 + i * 22})`);

        legendRow.append('circle')
            .attr('cx', 6)
            .attr('cy', 0)
            .attr('r', 5)
            .style('fill', getFamilyColor(family))
            .style('stroke', '#1a1a1a')
            .style('stroke-width', 1);

        legendRow.append('text')
            .attr('x', 16)
            .attr('y', 4)
            .style('font-size', '16px')
            .style('fill', '#CCC')
            .text(`${family} (${familyCounts[family]})`);
    });
    
    // Create links group
    const linksGroup = g.append('g').attr('class', 'links');
    
    // Create nodes group
    const nodesGroup = g.append('g').attr('class', 'nodes');
    
    
    // Create brush
    const brush = d3.brush()
        .extent([[0, 0], [networkWidth, networkHeight]])
        .on('start brush', brushUpdate);
    
    const brushGroup = background_g.append('g')
        .attr('class', 'brush')
        .style('pointer-events', 'none')
        .call(brush);
    
    // Re-enable pointer events only on brush overlay
    brushGroup.select('.overlay')
        .style('pointer-events', 'all');
    

    // Seed initial node positions so simulation converges to the same layout every time
    const rng = seededRandom(1);
    networkData.nodes.forEach(d => {
        d.x = networkMargin.left + rng() * networkWidth;
        d.y = networkMargin.top + rng() * networkHeight;
        d.vx = 0;
        d.vy = 0;
    });

    // Create force simulation
    const simulation = d3.forceSimulation(networkData.nodes)
        .force('link', d3.forceLink(networkData.links)
            .id(d => d.id)
            .distance(d => 60 / Math.log(d.weight + 1))
            .strength(d => Math.min(d.weight / 200, 0.6))
        )
        .force('charge', d3.forceManyBody().strength(-45))
        .force('center', d3.forceCenter(networkWidth / 2, networkHeight / 2))
        .force('x', d3.forceX(networkWidth / 2).strength(0.04))
        .force('y', d3.forceY(networkHeight / 2).strength(0.04))
        .force('collision', d3.forceCollide().radius(8))
        .alpha(1)
        .alphaDecay(0.05)
        .velocityDecay(0.7);
    
    // Draw links
    const link = linksGroup.selectAll('line')
        .data(networkData.links)
        .join('line')
        .attr('class', 'link')
        .attr('stroke-width', d => Math.max(0.5, Math.min(d.weight / 20, 3)));
    
    // Draw nodes
    const node = nodesGroup.selectAll('circle')
        .data(networkData.nodes)
        .join('circle')
        .attr('class', 'node')
        .attr('r', 6)
        .attr('fill', d => d.data ? getFamilyColor(d.data.Family) : '#555')
        .on('mouseover', handleNodeMouseOver)
        .on('mouseout', handleNodeMouseOut)
        .on('click', handleNodeClick);
    
    // Update positions on simulation tick with boundary constraints
    simulation.on('tick', () => {
        // Constrain nodes to stay within bounds
        networkData.nodes.forEach(d => {
            d.x = Math.max(10, Math.min(networkWidth - 10, d.x));
            d.y = Math.max(10, Math.min(networkHeight - 10, d.y));
        });
        
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        node
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);
    });
    
    // Store references for later use
    window.networkElements = { node, link, simulation };
    
    function brushUpdate(event) {
        if (!event.selection) {
            selectedPhages.clear();
            console.log('huh')
            updateTableFilter();
            return;
        }
        
        const [[x0, y0], [x1, y1]] = event.selection;
        
        selectedPhages.clear();
        networkData.nodes.forEach(d => {
            if (d.x >= x0 && d.x <= x1 && d.y >= y0 && d.y <= y1) {
                selectedPhages.add(d.id);
            }
        });
        updateTableFilter();
        node.classed('selected', d => selectedPhages.has(d.id));
        
        // Clear brush selection
        //brushGroup.call(brush.move, null);
    }
}

function handleNodeMouseOver(event, d) {
    const tooltip = d3.select('#tooltip');
    
    const fullName = d.data['Full name'] || d.data.Phage;
    const nickname = d.data.Phage;
    const tooltipTitle = (fullName !== nickname) ? `${fullName} (${nickname})` : fullName;
    const tooltipContent = `
        <div class="tooltip-title">${tooltipTitle}</div>
        <div class="tooltip-row"><span class="tooltip-label">Lifestyle:</span> <span class="tooltip-value">${d.data.Lifestyle}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Morphotype:</span> <span class="tooltip-value">${d.data.Morphotype}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Family:</span> <span class="tooltip-value">${d.data.Family || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Subfamily:</span> <span class="tooltip-value">${d.data.Subfamily || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Genus:</span> <span class="tooltip-value">${d.data.Genus || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">BW25113 susceptibility:</span> <span class="tooltip-value">${d.data['BW25113 susceptibility']}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">BL21 susceptibility:</span> <span class="tooltip-value">${d.data['BL21 susceptibility']}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">BW25113 receptor:</span> <span class="tooltip-value">${d.data['BW25113 receptor'] || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">BW25113 LPS sugar:</span> <span class="tooltip-value">${d.data['BW25113 LPS sugar'] || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">BL21 receptor:</span> <span class="tooltip-value">${d.data['BL21 receptor'] || 'N/A'}</span></div>
    `;
    
    tooltip.html(tooltipContent)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .classed('visible', true);
}

function handleNodeMouseOut() {
    d3.select('#tooltip').classed('visible', false);
}

function handleNodeClick(event, d) {
    event.stopPropagation();
    showPopup(d.data);
    //console.log('yeehaw')
    //document.getElementById('pdbeMolstarComponent').setAttribute("molecule-id", "7tdw");
}

function highlightNodeByPhage(phageName) {
    if (!window.networkElements) return;
    
    window.networkElements.node
        .classed('highlighted', d => d.id === phageName);
}

function clearNodeHighlight() {
    if (!window.networkElements) return;
    
    window.networkElements.node
        .classed('highlighted', false);
}

// ============================================
// TABLE VISUALIZATION
// ============================================
function initializeTable() {
    const container = d3.select('#table-container');
    container.selectAll('*').remove();

    // Search box above table (create once, persists across re-init)
    if (d3.select('#table-search-container').empty()) {
        const searchContainer = d3.select('#table-section')
            .insert('div', '#table-container')
            .attr('id', 'table-search-container')
            .attr('class', 'table-search-container');

        searchContainer.append('label')
            .attr('for', 'table-search-input')
            .attr('class', 'sr-only')
            .text('Search phages by name');

        searchContainer.append('input')
            .attr('type', 'text')
            .attr('id', 'table-search-input')
            .attr('class', 'table-search-input')
            .attr('placeholder', 'Search phages by name\u2026')
            .property('value', tableSearchText)
            .on('input', function() {
                tableSearchText = this.value;
                updateTableFilter();
            });
    }

    // Define columns in specific order
    const displayColumns = [
        'Phage',
        'Family',
        'Subfamily',
        'Genus',
        'Lifestyle',
        'Morphotype',
        'BW25113 susceptibility',
        'BL21 susceptibility',
        'BW25113 receptor',
        'BL21 receptor',
        'BW25113 LPS sugar',
        'AF3 model'
    ];
    const taxonomyColumns = ['Class', 'Family', 'Subfamily', 'Genus'];
    
    
    const table = container.append('table')
        .attr('class', 'phage-table')
        .attr('aria-label', 'Phage data');
    
    const thead = table.append('thead');
    const tbody = table.append('tbody');
    
    // Create header rows (two rows)
    const headerRow1 = thead.append('tr');
    const headerRow2 = thead.append('tr');
    
    // Helper: append a sortable th to a row
    function sortableTh(row, label, col, extraAttrs = {}) {
        const th = row.append('th').style('cursor', 'pointer').style('user-select', 'none')
            .attr('aria-sort', 'none');
        Object.entries(extraAttrs).forEach(([k, v]) => th.attr(k, v));
        th.append('span').text(label);
        th.append('span').attr('class', 'sort-indicator').attr('data-sort-col', col);

        // Filter icon
        th.append('button')
            .attr('class', 'col-filter-btn')
            .attr('data-filter-col', col)
            .attr('aria-label', 'Filter ' + label)
            .attr('aria-expanded', 'false')
            .html('<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M1.5 1.5h13L9 8v4.5l-2 1.5V8z"/></svg>')
            .on('click', function(event) {
                event.stopPropagation();
                openColumnFilter(col, this);
            });

        // Clear filter button (hidden by default)
        th.append('button')
            .attr('class', 'col-filter-clear')
            .attr('data-filter-col', col)
            .attr('aria-label', 'Clear ' + label + ' filter')
            .style('display', 'none')
            .text('\u00d7')
            .on('click', function(event) {
                event.stopPropagation();
                clearColumnFilter(col);
            });

        th.on('click', () => handleColumnSort(col));
        return th;
    }

    // Filter placeholder cell (spans 2 rows) — no longer has magnifying glass
    headerRow1.append('th')
        .attr('class', 'sticky-col-1')
        .attr('rowspan', 2);

    // Nickname (spans 2 rows)
    sortableTh(headerRow1, 'Nickname', 'Phage', { class: 'sticky-col-2', rowspan: 2 });

    // Taxonomy (each spans 2 rows)
    sortableTh(headerRow1, 'Family',    'Family',    { rowspan: 2 });
    sortableTh(headerRow1, 'Subfamily', 'Subfamily', { rowspan: 2 });
    sortableTh(headerRow1, 'Genus',     'Genus',     { rowspan: 2 });
    sortableTh(headerRow1, 'Lifestyle', 'Lifestyle', { rowspan: 2 });
    sortableTh(headerRow1, 'Morphotype','Morphotype',{ rowspan: 2 });

    // Susceptibility group header (not sortable, spans 2 columns)
    headerRow1.append('th').attr('colspan', 2).style('text-align', 'center').text('Susceptibility');
    sortableTh(headerRow2, 'BW25113', 'BW25113 susceptibility');
    sortableTh(headerRow2, 'BL21',    'BL21 susceptibility');

    // Receptor group header (not sortable, spans 2 columns)
    headerRow1.append('th').attr('colspan', 2).style('text-align', 'center').text('Receptor');
    sortableTh(headerRow2, 'BW25113', 'BW25113 receptor');
    sortableTh(headerRow2, 'BL21',    'BL21 receptor');

    // Remaining single-column headers (span 2 rows)
    sortableTh(headerRow1, 'LPS',       'BW25113 LPS sugar', { rowspan: 2 });
    sortableTh(headerRow1, 'AF3 model', 'AF3 model',         { rowspan: 2 });
    
    // Create table rows
    const rows = tbody.selectAll('tr')
        .data(phageData)
        .join('tr')
        .attr('tabindex', '0')
        .on('mouseover', function(event, d) {
            highlightNodeByPhage(d.Phage);
            d3.select(this).classed('highlighted', true);
        })
        .on('mouseout', function() {
            clearNodeHighlight();
            d3.select(this).classed('highlighted', false);
        })
        .on('click', (event, d) => showPopup(d))
        .on('keydown', function(event, d) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showPopup(d);
            }
        });
    
    // Add taxonomy bars
    rows.each(function(d, i) {
        const row = d3.select(this);
        const barsDiv = row.append('td')
            .attr('class', 'sticky-col-1')
            .attr('aria-hidden', 'true')
            .style('width', '32px')
            .style('padding', '0');
        
        const bars = barsDiv.append('div')
            .attr('class', 'taxonomy-bars');
        
        taxonomyColumns.forEach((col, idx) => {
            if (col === 'Class') return; // Skip Class
            if (d[col]) {
                bars.append('div')
                    .attr('class', 'taxonomy-bar')
                    .attr('title', `${col}: ${d[col]}`)
                    .style('background-color', taxonomyColorScales[col](d[col]));
            } else {
                bars.append('div')
                    .attr('class', 'taxonomy-bar')
                    .attr('title', `${col}: undefined`)
                    .style('background-color', '#999');                
            }
        });
    });
    
    // Add data cells
    rows.each(function(d) {
        const row = d3.select(this);
        
        displayColumns.forEach(col => {
            const cell = row.append('td');
            if (col === 'Phage') cell.attr('class', 'sticky-col-2');

            if (col === 'Reference' && d[col]) {
                cell.append('a')
                    .attr('href', `https://doi.org/${d[col]}`)
                    .attr('target', '_blank')
                    .text('link');
            } else if (col === 'Family' || col === 'Subfamily' || col === 'Genus') {
                // Color taxonomy text to match phylogeny bars
                const value = d[col] || '';
                cell.text(value);
                if (value && taxonomyColorScales[col]) {
                    cell.style('color', taxonomyColorScales[col](value));
                }
            } else {
                cell.text(d[col] || '');
            }
        });
    });
    
    // Store for filtering
    window.tableRows = rows;

    // Restore filter indicator state after rebuild
    updateFilterIndicators();
    updateTableFilter();
}

function handleColumnSort(column) {
    if (tableSort.column === column) {
        if (tableSort.direction === 1)       { tableSort.direction = -1; }
        else if (tableSort.direction === -1) { tableSort.direction = 0; tableSort.column = null; }
        else                                 { tableSort.direction = 1; }
    } else {
        tableSort.column = column;
        tableSort.direction = 1;
    }
    applyTableSort();
}

function applyTableSort() {
    // Update sort indicator arrows and aria-sort
    d3.selectAll('.sort-indicator').text('');
    d3.selectAll('.phage-table th[aria-sort]').attr('aria-sort', 'none');
    if (tableSort.column) {
        d3.selectAll(`.sort-indicator[data-sort-col="${tableSort.column}"]`)
            .text(tableSort.direction === 1 ? ' ▲' : ' ▼');
        d3.selectAll(`.sort-indicator[data-sort-col="${tableSort.column}"]`).each(function() {
            d3.select(this.parentNode).attr('aria-sort',
                tableSort.direction === 1 ? 'ascending' : 'descending');
        });
    }

    // Re-order <tr> elements in place (D3 .sort reorders DOM nodes without re-rendering)
    d3.select('.phage-table tbody').selectAll('tr').sort((a, b) => {
        if (!tableSort.column || tableSort.direction === 0) {
            return a._origIndex - b._origIndex;
        }
        const va = a[tableSort.column] || '';
        const vb = b[tableSort.column] || '';
        // Always push blanks to the end
        if (!va && vb)  return 1;
        if (va  && !vb) return -1;
        if (!va && !vb) return 0;
        const cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' });
        return tableSort.direction === 1 ? cmp : -cmp;
    });
}

// ============================================
// COLUMN FILTER DROPDOWN
// ============================================
let filterTriggerEl = null; // element that opened the filter dropdown

function openColumnFilter(column, btnElement) {
    closeColumnFilter();
    filterTriggerEl = btnElement;

    const rect = btnElement.getBoundingClientRect();
    const uniqueValues = [...new Set(phageData.map(d => d[column]).filter(v => v))].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    const existingFilter = tableFilters.find(f => f.column === column);
    const checkedValues = existingFilter ? new Set(existingFilter.values) : new Set(uniqueValues);

    // Mark the trigger button as expanded
    d3.select(btnElement).attr('aria-expanded', 'true');

    const dropdown = d3.select('body').append('div')
        .attr('class', 'col-filter-dropdown')
        .attr('role', 'dialog')
        .attr('aria-label', 'Filter ' + column);

    // Position: keep on screen
    const left = Math.min(rect.left, window.innerWidth - 270);
    const top = rect.bottom + 4;
    dropdown.style('left', left + 'px').style('top', top + 'px');

    openFilterDropdownEl = dropdown.node();

    // Search input
    const searchInput = dropdown.append('input')
        .attr('type', 'text')
        .attr('class', 'filter-search')
        .attr('placeholder', 'Search\u2026');

    // Focus the search input
    setTimeout(() => searchInput.node().focus(), 0);

    // Select all / none toggles
    const toggleRow = dropdown.append('div').attr('class', 'filter-toggles');
    toggleRow.append('button').text('All').on('click', function() {
        uniqueValues.forEach(v => checkedValues.add(v));
        renderValues(searchInput.property('value'));
    });
    toggleRow.append('button').text('None').on('click', function() {
        checkedValues.clear();
        renderValues(searchInput.property('value'));
    });

    // Values container
    const valuesDiv = dropdown.append('div').attr('class', 'filter-values');

    function renderValues(filterText) {
        valuesDiv.selectAll('*').remove();
        const filtered = filterText
            ? uniqueValues.filter(v => v.toLowerCase().includes(filterText.toLowerCase()))
            : uniqueValues;

        filtered.forEach(value => {
            const label = valuesDiv.append('label');
            label.append('input')
                .attr('type', 'checkbox')
                .property('checked', checkedValues.has(value))
                .on('change', function() {
                    if (this.checked) checkedValues.add(value);
                    else checkedValues.delete(value);
                });
            label.append('span').text(value);
        });
    }

    renderValues('');
    searchInput.on('input', function() { renderValues(this.value); });

    // Action buttons
    const actions = dropdown.append('div').attr('class', 'filter-actions');

    if (existingFilter) {
        actions.append('button')
            .attr('class', 'filter-btn-clear')
            .text('Clear')
            .on('click', () => { clearColumnFilter(column); closeColumnFilter(); });
    }

    actions.append('button')
        .attr('class', 'filter-btn-apply')
        .text('Apply')
        .on('click', () => {
            if (checkedValues.size === 0 || checkedValues.size === uniqueValues.length) {
                // All or none selected = remove filter
                clearColumnFilter(column);
            } else {
                setColumnFilter(column, checkedValues);
            }
            closeColumnFilter();
        });

    // Close on outside click (added on next tick so this click doesn't trigger it)
    setTimeout(() => {
        document.addEventListener('click', handleFilterOutsideClick);
    }, 0);
}

function handleFilterOutsideClick(event) {
    if (openFilterDropdownEl && !openFilterDropdownEl.contains(event.target) && !event.target.closest('.col-filter-btn')) {
        closeColumnFilter();
    }
}

function closeColumnFilter() {
    if (openFilterDropdownEl) {
        openFilterDropdownEl.remove();
        openFilterDropdownEl = null;
    }
    // Reset aria-expanded and restore focus to trigger
    if (filterTriggerEl) {
        d3.select(filterTriggerEl).attr('aria-expanded', 'false');
        filterTriggerEl.focus();
        filterTriggerEl = null;
    }
    document.removeEventListener('click', handleFilterOutsideClick);
}

function setColumnFilter(column, values) {
    const idx = tableFilters.findIndex(f => f.column === column);
    if (idx >= 0) {
        tableFilters[idx].values = new Set(values);
    } else {
        tableFilters.push({ column, values: new Set(values) });
    }
    updateFilterIndicators();
    updateTableFilter();
}

function clearColumnFilter(column) {
    tableFilters = tableFilters.filter(f => f.column !== column);
    updateFilterIndicators();
    updateTableFilter();
}

function updateFilterIndicators() {
    const activeCols = new Set(tableFilters.map(f => f.column));

    d3.selectAll('.col-filter-btn').each(function() {
        const col = d3.select(this).attr('data-filter-col');
        d3.select(this).classed('active', activeCols.has(col));
    });

    d3.selectAll('.col-filter-clear').each(function() {
        const col = d3.select(this).attr('data-filter-col');
        d3.select(this).style('display', activeCols.has(col) ? 'inline-flex' : 'none');
    });
}

function updateTableFilter() {
    if (!window.tableRows) return;

    const searchLower = tableSearchText.toLowerCase();

    window.tableRows.classed('filtered_out_row', d => {
        // Check search text
        if (searchLower && !d.Phage.toLowerCase().includes(searchLower)) {
            return true;
        }

        // Check network filter
        if (selectedPhages.size > 0 && !selectedPhages.has(d.Phage)) {
            return true;
        }

        // Check table filters
        for (const filter of tableFilters) {
            const value = d[filter.column];
            if (!filter.values.has(value)) {
                return true;
            }
        }

        return false;
    });

    // Update barseq link button text based on selection state
    const hasSubset = selectedPhages.size > 0 || tableFilters.length > 0 || tableSearchText;
    const barseqBtn = document.getElementById('barseq-link-btn');
    if (barseqBtn) barseqBtn.textContent = hasSubset
        ? 'See RB-TnSeq data for selected phages'
        : 'See RB-TnSeq data for a subset of these phages';

    // Announce filter results to screen readers
    const statusEl = document.getElementById('a11y-status');
    if (statusEl && hasSubset) {
        const visibleCount = d3.selectAll('.phage-table tbody tr')
            .filter(function() { return !d3.select(this).classed('filtered_out_row'); }).size();
        statusEl.textContent = `Showing ${visibleCount} of ${phageData.length} phages`;
    } else if (statusEl) {
        statusEl.textContent = '';
    }

    // Dim network nodes that are filtered out by table filters
    if (window.networkElements) {
        window.networkElements.node.attr('opacity', d => {
            if (tableFilters.length === 0) return 1;
            for (const filter of tableFilters) {
                const value = d.data ? d.data[filter.column] : null;
                if (!filter.values.has(value)) return 0.15;
            }
            return 1;
        });
    }
}

function showFilterPopup() {
    const overlay = d3.select('body').append('div')
        .attr('class', 'filter-popup-overlay')
        .style('position', 'fixed')
        .style('top', '0')
        .style('left', '0')
        .style('width', '100%')
        .style('height', '100%')
        .style('background', 'rgba(0, 0, 0, 0.7)')
        .style('z-index', '2000')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('justify-content', 'center')
        .on('click', function(event) {
            if (event.target === this) {
                overlay.remove();
            }
        });
    
    const popup = overlay.append('div')
        .attr('class', 'filter-popup')
        .style('background', '#2a2a2a')
        .style('border', '2px solid #404040')
        .style('border-radius', '8px')
        .style('padding', '20px')
        .style('max-width', '600px')
        .style('width', '90%')
        .style('max-height', '80vh')
        .style('overflow-y', 'auto')
        .style('color', '#e0e0e0');
    
    popup.append('h2')
        .style('margin-top', '0')
        .style('color', '#CCC')
        .text('Filter Table');
    
    // Current filters section
    const currentFiltersDiv = popup.append('div')
        .attr('class', 'current-filters')
        .style('margin-bottom', '20px');
    
    const updateCurrentFilters = () => {
        currentFiltersDiv.selectAll('*').remove();
        
        if (tableFilters.length === 0) {
            currentFiltersDiv.append('p')
                .style('color', '#808080')
                .text('No filters applied');
        } else {
            currentFiltersDiv.append('h3')
                .style('font-size', '14px')
                .style('margin-bottom', '8px')
                .text('Active Filters:');
            
            tableFilters.forEach((filter, idx) => {
                const filterDiv = currentFiltersDiv.append('div')
                    .style('background', '#3a3a3a')
                    .style('padding', '8px')
                    .style('margin-bottom', '8px')
                    .style('border-radius', '4px')
                    .style('display', 'flex')
                    .style('justify-content', 'space-between')
                    .style('align-items', 'center');
                
                const text = filterDiv.append('div');
                text.append('strong').text(filter.column + ': ');
                text.append('span').text(Array.from(filter.values).join(', '));
                
                filterDiv.append('button')
                    .style('background', '#ff6b6b')
                    .style('color', 'white')
                    .style('border', 'none')
                    .style('padding', '4px 8px')
                    .style('border-radius', '4px')
                    .style('cursor', 'pointer')
                    .text('Remove')
                    .on('click', () => {
                        tableFilters.splice(idx, 1);
                        updateCurrentFilters();
                        updateTableFilter();
                    });
            });
            
            currentFiltersDiv.append('button')
                .style('background', '#ff6b6b')
                .style('color', 'white')
                .style('border', 'none')
                .style('padding', '6px 12px')
                .style('border-radius', '4px')
                .style('cursor', 'pointer')
                .style('margin-top', '8px')
                .text('Clear All Filters')
                .on('click', () => {
                    tableFilters = [];
                    updateCurrentFilters();
                    updateTableFilter();
                });
        }
    };
    
    updateCurrentFilters();
    
    // Add new filter section
    popup.append('h3')
        .style('margin-top', '20px')
        .style('margin-bottom', '10px')
        .text('Add New Filter');
    
    // Column selector
    const filterableColumns = [
        'Phage', 'Family', 'Subfamily', 'Genus', 'Lifestyle', 'Morphotype',
        'BW25113 susceptibility', 'BL21 susceptibility',
        'BW25113 receptor', 'BL21 receptor', 'BW25113 LPS sugar',
        'AF3 model'
    ];
    
    popup.append('label')
        .style('display', 'block')
        .style('margin-bottom', '5px')
        .text('Select column:');
    
    const columnSelect = popup.append('select')
        .style('width', '100%')
        .style('padding', '8px')
        .style('background', '#3a3a3a')
        .style('color', '#e0e0e0')
        .style('border', '1px solid #404040')
        .style('border-radius', '4px')
        .style('margin-bottom', '15px');
    
    columnSelect.selectAll('option')
        .data(filterableColumns)
        .enter()
        .append('option')
        .attr('value', d => d)
        .text(d => d);
    
    // Value selector section
    const valueSection = popup.append('div')
        .attr('class', 'value-section');
    
    const updateValueSection = () => {
        valueSection.selectAll('*').remove();
        
        const selectedColumn = columnSelect.property('value');
        const uniqueValues = [...new Set(phageData.map(d => d[selectedColumn]).filter(v => v))].sort();
        
        valueSection.append('label')
            .style('display', 'block')
            .style('margin-bottom', '5px')
            .text('Search and select values:');
        
        // Search box
        const searchBox = valueSection.append('input')
            .attr('type', 'text')
            .attr('placeholder', 'Search...')
            .style('width', '100%')
            .style('padding', '8px')
            .style('background', '#3a3a3a')
            .style('color', '#e0e0e0')
            .style('border', '1px solid #404040')
            .style('border-radius', '4px')
            .style('margin-bottom', '10px');
        
        // Checkboxes container
        const checkboxContainer = valueSection.append('div')
            .style('max-height', '200px')
            .style('overflow-y', 'auto')
            .style('border', '1px solid #404040')
            .style('border-radius', '4px')
            .style('padding', '10px')
            .style('background', '#1a1a1a');
        
        const selectedValues = new Set();
        
        const renderCheckboxes = (filterText = '') => {
            checkboxContainer.selectAll('*').remove();
            
            const filtered = uniqueValues.filter(v => 
                v.toLowerCase().includes(filterText.toLowerCase())
            );
            
            filtered.forEach(value => {
                const label = checkboxContainer.append('label')
                    .style('display', 'block')
                    .style('margin-bottom', '5px')
                    .style('cursor', 'pointer');
                
                const checkbox = label.append('input')
                    .attr('type', 'checkbox')
                    .property('checked', selectedValues.has(value))
                    .on('change', function() {
                        if (this.checked) {
                            selectedValues.add(value);
                        } else {
                            selectedValues.delete(value);
                        }
                    });
                
                label.append('span')
                    .style('margin-left', '5px')
                    .text(value);
            });
        };
        
        renderCheckboxes();
        
        searchBox.on('input', function() {
            renderCheckboxes(this.value);
        });
        
        // Add filter button
        valueSection.append('button')
            .style('background', '#4a9eff')
            .style('color', 'white')
            .style('border', 'none')
            .style('padding', '8px 16px')
            .style('border-radius', '4px')
            .style('cursor', 'pointer')
            .style('margin-top', '10px')
            .text('Add Filter')
            .on('click', () => {
                if (selectedValues.size > 0) {
                    tableFilters.push({
                        column: selectedColumn,
                        values: new Set(selectedValues)
                    });
                    updateCurrentFilters();
                    updateTableFilter();
                    selectedValues.clear();
                    updateValueSection();
                }
            });
    };
    
    updateValueSection();
    
    columnSelect.on('change', updateValueSection);
    
    // Close button
    popup.append('button')
        .style('background', '#3a3a3a')
        .style('color', '#e0e0e0')
        .style('border', '1px solid #404040')
        .style('padding', '8px 16px')
        .style('border-radius', '4px')
        .style('cursor', 'pointer')
        .style('margin-top', '20px')
        .text('Close')
        .on('click', () => overlay.remove());
}

// ============================================
// POPUP MODAL
// ============================================
let popupTriggerEl = null; // element that opened the popup

function showPopup(phageData) {
    // Store the trigger for focus restoration (only on first open, not navigation)
    if (!currentPhage) {
        popupTriggerEl = document.activeElement;
    }

    currentPhage = phageData;

    const url = new URL(window.location);
    url.searchParams.set('phage', phageData.Phage);
    history.pushState({}, '', url);

    const overlay = document.getElementById('popup-overlay');
    overlay.classList.add('active');
    overlay.setAttribute('aria-label', 'Phage details: ' + phageData.Phage);

    // Clear dynamic content so loaders re-run for the new phage
    d3.select('#genome-viewer').selectAll('*').remove();
    const popupContent = document.getElementById('popup-content');
    popupContent.scrollTop = 0;

    populateCustomInfo(phageData);
    // populateInfo(phageData);  // kept for future use
    loadGenome(phageData);
    loadStructure(phageData);

    // Move focus into popup
    popupContent.focus();
}

function hidePopup() {
    const overlay = document.getElementById('popup-overlay');
    overlay.classList.remove('active');
    d3.select('#popup-content').style('height', null);
    currentPhage = null;

    const url = new URL(window.location);
    url.searchParams.delete('phage');
    history.pushState({}, '', url);

    // Restore focus to the element that triggered the popup
    if (popupTriggerEl) {
        popupTriggerEl.focus();
        popupTriggerEl = null;
    }
}

// Focus trap for the popup dialog
function handlePopupFocusTrap(event) {
    const overlay = document.getElementById('popup-overlay');
    if (!overlay.classList.contains('active') || event.key !== 'Tab') return;

    const focusable = overlay.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
        if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
        }
    } else {
        if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
}

function populateInfo(data) {
    const info_div = d3.select('#info-div');
    info_div.selectAll('*').remove();
    const infoElement = info_div.append('div').attr('id', 'popup-phage-info');

    const infoFields = [
        { key: 'Phage', label: 'Nickname' },
        { key: 'Production host strain', label: 'Production host strain' },
        { key: 'Lifestyle', label: 'Lifestyle' },
        { key: 'Morphotype', label: 'Morphotype' },
        { key: 'Predictive models set', label: 'Predictive models set' },
        { key: 'Reference (doi)', label: 'Reference (doi)' },
        { key: 'Notes', label: 'Notes', onlyIfNonEmpty: true },
    ];

    let infoHTML = '';
    infoFields.forEach(({ key, label, onlyIfNonEmpty }) => {
        const value = data[key];
        if (onlyIfNonEmpty && !value) return;

        let displayValue = value || 'N/A';
        if (key === 'Reference (doi)' && value) {
            displayValue = `<a href="https://doi.org/${value}" target="_blank">${value}</a>`;
        }

        infoHTML += `
            <div class="info-item">
                <div class="info-label">${label}</div>
                <div class="info-value">${displayValue}</div>
            </div>
        `;
    });

    infoElement.html(infoHTML);
}

function getSusceptibilityColor(value) {
    if (!value || value === 'N/A') return 'var(--text-primary)';
    const lower = value.toLowerCase();
    if (lower === 'yes') return 'var(--accent-success)';
    if (lower === 'no') return 'var(--accent-secondary)';
    return 'var(--text-primary)';
}

function populateCustomInfo(data) {
    const div = d3.select('#custom-info-div');
    div.selectAll('*').remove();

    const fullName = data['Full name'] || data.Phage;
    const nickname = data.Phage;
    const titleText = (fullName !== nickname) ? `${fullName} (${nickname})` : fullName;

    const nameRow = div.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px');

    nameRow.append('h2')
        .attr('id', 'popup-phage-name')
        .text(titleText);

    const linkBtn = nameRow.append('button')
        .attr('title', 'Copy link to this phage')
        .attr('aria-label', 'Copy link to this phage')
        .style('background', 'none')
        .style('border', 'none')
        .style('cursor', 'pointer')
        .style('color', 'var(--text-muted)')
        .style('padding', '0px')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('border-radius', '4px')
        .style('margin-bottom', '5px')
        .style('transition', 'color 0.2s')
        .html(`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>`);

    linkBtn.on('click', function() {
        navigator.clipboard.writeText(window.location.href);
        d3.select(this).style('color', 'var(--accent-success)');
        setTimeout(() => d3.select(this).style('color', 'var(--text-muted)'), 1500);
    });

    const twoColDiv = div.append('div')
        .attr('class', 'custom-info-columns');

    // === LEFT: Taxonomy + inline info ===
    const leftDiv = twoColDiv.append('div')
        .attr('class', 'custom-info-left');

    const taxDiv = leftDiv.append('div')
        .attr('class', 'custom-info-taxonomy');

    ['Family', 'Subfamily', 'Genus'].forEach(col => {
        const val = data[col] || 'N/A';
        const row = taxDiv.append('div').attr('class', 'taxonomy-line');
        row.append('span').attr('class', 'taxonomy-line-label').text(col + ': ');
        const color = (val !== 'N/A' && taxonomyColorScales[col])
            ? taxonomyColorScales[col](val)
            : 'var(--text-primary)';
        row.append('span')
            .style('color', color)
            .style('font-weight', 'bold')
            .text(val);
    });

    taxDiv.append('div').style('margin-top', '10px');

    const inlineInfoFields = [
        { key: 'Production host strain', label: 'Production host' },
        { key: 'Lifestyle', label: 'Lifestyle' },
        { key: 'Morphotype', label: 'Morphotype' },
        { key: 'Predictive models set', label: 'Predictive models set' },
    ];
    inlineInfoFields.forEach(({ key, label }) => {
        const val = data[key] || 'N/A';
        const row = taxDiv.append('div').attr('class', 'taxonomy-line');
        row.append('span').attr('class', 'taxonomy-line-label').text(label + ': ');
        row.append('span').text(val);
    });

    // Reference as a link
    if (data['Reference (doi)']) {
        const refRow = taxDiv.append('div').attr('class', 'taxonomy-line');
        refRow.append('span').attr('class', 'taxonomy-line-label').text('Reference: ');
        refRow.append('a')
            .attr('href', `https://doi.org/${data['Reference (doi)']}`)
            .attr('target', '_blank')
            .style('color', 'var(--accent-primary)')
            .text(data['Reference (doi)']);
    }

    // Notes only if non-empty
    if (data['Notes']) {
        const notesRow = taxDiv.append('div').attr('class', 'taxonomy-line');
        notesRow.append('span').attr('class', 'taxonomy-line-label').text('Notes: ');
        notesRow.append('span').text(data['Notes']);
    }

    // === MIDDLE: Susceptibility/Receptor table ===
    const middleDiv = twoColDiv.append('div')
        .attr('class', 'custom-info-middle');

    middleDiv.append('h3')
        .attr('class', 'custom-info-section-title')
        .text('Susceptibility / Receptors');

    const susTable = middleDiv.append('table').attr('class', 'custom-info-table').style('width', 'auto').style('font-size', '0.87rem');
    susTable.append('thead').append('tr').selectAll('th')
        .data(['', 'BW25113', 'BL21'])
        .enter().append('th').text(d => d);
    const susBody = susTable.append('tbody');

    const bwSus = data['BW25113 susceptibility'] || 'N/A';
    const bl21Sus = data['BL21 susceptibility'] || 'N/A';
    const susRow = susBody.append('tr');
    susRow.append('td').attr('class', 'custom-info-row-label').text('Susceptible?');
    susRow.append('td').text(bwSus)
        .style('color', getSusceptibilityColor(bwSus))
        .style('font-weight', 'bold');
    susRow.append('td').text(bl21Sus)
        .style('color', getSusceptibilityColor(bl21Sus))
        .style('font-weight', 'bold');

    const recRow = susBody.append('tr');
    recRow.append('td').attr('class', 'custom-info-row-label').text('Receptor');
    recRow.append('td').text(data['BW25113 receptor'] || 'N/A');
    recRow.append('td').text(data['BL21 receptor'] || 'N/A');

    const lpsRow = susBody.append('tr');
    lpsRow.append('td').attr('class', 'custom-info-row-label').text('LPS sugar');
    lpsRow.append('td').text(data['BW25113 LPS sugar'] || 'N/A');
    lpsRow.append('td').text('N/A');

    // --- Browser link buttons ---
    const btnStyle = {
        background: '#3a3a3a', color: 'var(--text-primary)',
        border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer'
    };
    const disabledStyle = {
        background: '#2a2a2a', color: 'var(--text-muted)',
        border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'default',
        opacity: '0.5'
    };

    function makeBarseqUrl(base, phage, receptor, geneData) {
        const url = new URL(base, window.location.href);
        url.searchParams.set('phages', phage);
        if (receptor && receptor !== 'LPS' && receptor !== 'N/A' && receptor !== 'NGR'
            && receptor !== 'Resistant' && receptor !== 'Unknown' && receptor !== 'Not assayed') {
            const gene = receptor.split(';')[0].toLowerCase();
            const match = geneData.find(g => g.name.toLowerCase() === gene);
            if (match) {
                const begin = +match.begin, end = +match.end;
                const len = end - begin;
                url.searchParams.set('contig', match.scaffoldId);
                url.searchParams.set('start', Math.max(0, begin - len));
                url.searchParams.set('end', end + len);
            }
        }
        return url.toString();
    }

    // BW25113 RB-TnSeq (full-width)
    middleDiv.append('button')
        .style('margin-top', '10px')
        .style('width', '100%')
        .style('background', btnStyle.background)
        .style('color', btnStyle.color)
        .style('border', btnStyle.border)
        .style('padding', '6px 14px')
        .style('border-radius', btnStyle.borderRadius)
        .style('cursor', btnStyle.cursor)
        .style('font-size', '13px')
        .text('Browse BW25113 RB-TnSeq data')
        .on('click', () => {
            window.open(makeBarseqUrl('barseq_browser/BW25113/index.html', data.Phage,
                data['BW25113 receptor'], KeioGeneData), '_blank');
        });

    // Second row: DubSeq + BL21 RB-TnSeq (half-width each)
    const btnRow = middleDiv.append('div')
        .style('display', 'flex')
        .style('gap', '6px')
        .style('margin-top', '6px');

    const hasDubseq = dubseqPhages.has(data.Phage);
    const bl21Receptor = data['BL21 receptor'] || '';
    const hasBL21 = bl21Receptor && bl21Receptor !== 'Not assayed';

    const dubBtn = btnRow.append('button')
        .style('flex', '1')
        .style('padding', '5px 6px')
        .style('font-size', '11px')
        .style('border-radius', '4px');
    if (hasDubseq) {
        dubBtn.style('background', btnStyle.background)
            .style('color', btnStyle.color)
            .style('border', btnStyle.border)
            .style('cursor', btnStyle.cursor)
            .text('BW25113 DubSeq')
            .on('click', () => {
                const url = new URL('barseq_browser/BW25113/dubseq.html', window.location.href);
                url.searchParams.set('phages', data.Phage);
                window.open(url.toString(), '_blank');
            });
    } else {
        dubBtn.style('background', disabledStyle.background)
            .style('color', disabledStyle.color)
            .style('border', disabledStyle.border)
            .style('cursor', disabledStyle.cursor)
            .style('opacity', disabledStyle.opacity)
            .text('No DubSeq data');
    }

    const bl21Btn = btnRow.append('button')
        .style('flex', '1')
        .style('padding', '5px 6px')
        .style('font-size', '11px')
        .style('border-radius', '4px');
    if (hasBL21) {
        bl21Btn.style('background', btnStyle.background)
            .style('color', btnStyle.color)
            .style('border', btnStyle.border)
            .style('cursor', btnStyle.cursor)
            .text('BL21 RB-TnSeq')
            .on('click', () => {
                window.open(makeBarseqUrl('barseq_browser/BL21/index.html', data.Phage,
                    bl21Receptor, BL21GeneData), '_blank');
            });
    } else {
        bl21Btn.style('background', disabledStyle.background)
            .style('color', disabledStyle.color)
            .style('border', disabledStyle.border)
            .style('cursor', disabledStyle.cursor)
            .style('opacity', disabledStyle.opacity)
            .text('No BL21 RB-TnSeq');
    }

    // === RIGHT: EOP data ===
    const rightDiv = twoColDiv.append('div')
        .attr('class', 'custom-info-right');

    const phageEopData = eopData.filter(d => d.phage === data.Phage);

    if (phageEopData.length === 0) {
        rightDiv.append('p')
            .style('color', 'var(--text-muted)')
            .text('No EOP data available');
    } else {
        rightDiv.append('h3')
            .attr('class', 'custom-info-section-title')
            .text('Efficiency of plating on selected knockouts');
        const eopColorScale = d3.scaleLinear()
            .domain([-10, 0])
            .range(['#aa0000', '#111'])
            .clamp(true);

        const eopTable = rightDiv.append('table').attr('class', 'custom-info-table').style('width', 'auto');
        eopTable.append('thead').append('tr').selectAll('th')
            .data(['Genotype', 'EOP', 'Complemented'])
            .enter().append('th').text(d => d);
        const eopBody = eopTable.append('tbody');

        phageEopData.forEach(row => {
            const tr = eopBody.append('tr');
            tr.append('td').text(row.Genotype || '');

            const eopVal = parseFloat(row.EOP);
            const eopCell = tr.append('td');
            if (!isNaN(eopVal)) {
                eopCell.text(eopVal.toFixed(2))
                    .style('background-color', eopColorScale(Math.max(-10, Math.min(0, eopVal))));
            } else {
                eopCell.text(row.EOP || 'N/A');
            }

            const eopcVal = parseFloat(row['EOP (complemented)']);
            const eopcCell = tr.append('td');
            if (!isNaN(eopcVal)) {
                eopcCell.text(eopcVal.toFixed(2))
                    .style('background-color', eopColorScale(Math.max(-10, Math.min(0, eopcVal))));
            } else {
                eopcCell.text(row['EOP (complemented)'] || 'N/A');
            }
        });
    }
}

async function loadStructure(p) {

  d3.select('#structure-div').selectAll('*').remove();

  const afModel = p['AF3 model'];

  if (afModel === 'failed' || afModel === 'impossible') {
    const message = afModel === 'failed'
      ? 'AlphaFold3 model failed'
      : 'AlphaFold3 model impossible (no receptor-RBD pair to work with)';
    d3.select('#structure_title_text').style('display', 'none');
    d3.select('#popup-content').style('height', 'auto');
    d3.select('#structure-div')
      .style('height', 'auto')
      .style('min-height', null)
      .style('padding', '12px')
      .append('p')
        .text(message)
        .style('color', 'var(--text-secondary)')
        .style('font-style', 'italic')
        .style('margin', '0');
    return;
  }

  d3.select('#popup-content').style('height', null);
  d3.select('#structure_title_text').style('display', null);
  d3.select('#structure-div').style('height', null).style('padding', null);

  // 2 cases with two receptors, but only the first ones
  // have good structures
  const receptor = p['BW25113 receptor'].split(';')[0]
  const rbp = p['Receptor-binding protein'].split(';')[0]

  const url = `./data/AlphaFold_models/fold_${receptor.toLowerCase()}_${p.Phage.toLowerCase()}_model_0.cif`;
  const json_url = `./data/AlphaFold_models/fold_${receptor.toLowerCase()}_${p.Phage.toLowerCase()}_summary_confidences_0.json`;

  if (afModel.split(';')[0] == 'sound') {
    d3.select('#structure_title_text')
        .text(`Predicted Structure of ${p.Phage} RBP (${rbp}) binding to ${receptor}`)
  } else if (afModel.split(';')[0] == 'incoherent') {
    d3.select('#structure_title_text')
        .html(`Predicted Structure of ${p.Phage} RBP (${rbp}) binding to ${receptor} <span class="incoherent_model_warning">(WARNING: model is incoherent)</span>`)
  } else {
    d3.select('#structure_title_text')
        .text(`Predicted Structure of ${p.Phage} RBP (${rbp}) binding to ${receptor} (model soundness not specified)`)
  }
  
  const color_key = d3.select('#structure-div').append('div');
  color_key.append('h3')
    .text('AlphaFold Confidence')
    .style('margin-bottom', '8px')
    .style('color', 'var(--text-primary)');

  const alphafold_colors = [
    { label: 'Very high (plDDT > 90)', color: '#116eff'},
    { label: 'Confident (90 > plDDT > 70)', color: '#13cff1'},
    { label: 'Low (70 > plDDT > 50)', color: '#f6ed11'},
    { label: 'Very low (plDDT < 50)', color: '#ef821f'},
  ]

  color_key.selectAll('div')
    .data(alphafold_colors)
    .enter()
    .append('div')
    .style('display', 'flex')
    .style('align-items', 'center')
    .style('margin-right', '15px')
    .html(d => `
        <div style="width: 20px; height: 20px; background-color: ${d.color}; border: 1px solid #000; margin-right: 8px;"></div>
        <div style="font-size: 14px; color: var(--text-secondary);">${d.label}</div>
    `);

  
  const confidenceData = await fetch(json_url).then(r => r.json());
  const ipTM = confidenceData.iptm;
  const pTM = confidenceData.ptm;

  const confidenceMetrics = color_key.append('div')
    .style('margin-top', '16px')
    .style('display', 'flex')
    .style('gap', '16px');

  [
    { label: 'ipTM', value: ipTM },
    { label: 'pTM', value: pTM }
  ].forEach(metric => {
    const metricDiv = confidenceMetrics.append('div')
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('gap', '8px');
    
    metricDiv.append('span')
      .style('font-size', '14px')
      .style('color', 'var(--text-secondary)')
      .text(`${metric.label}:`);
    
    let metricColor = '#ef821f';
    if (metric.value > 0.9) metricColor = '#116eff';
    else if (metric.value > 0.7) metricColor = '#13cff1';
    else if (metric.value > 0.5) metricColor = '#f6ed11';
    
    metricDiv.append('div')
      .style('background-color', metricColor)
      .style('color', metric.value > 0.5 ? '#000' : '#fff')
      .style('padding', '4px 8px')
      .style('border-radius', '4px')
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .text(metric.value.toFixed(2));
  });


  color_key.append('a')
    .attr('href', 'https://alphafoldserver.com/faq#how-can-i-interpret-confidence-metrics-to-check-the-accuracy-of-structures')
    .attr('target', '_blank')
    .text('Learn more about confidence metrics')
    .style('font-size', '14px')
    .style('color', 'var(--link-color)')
    .style('margin-top', '8px')
    .style('display', 'inline-block');

  const color = '#333'

  const container = d3.select('#structure-div').append('div')
    .attr('id', 'molstar-container')
    .style('width', '70%')
    .style('height', '80%')
    // center it
    .style('position', 'relative')
    .style('margin', 'auto')

  // Create plugin instance
  const viewerInstance = new PDBeMolstarPlugin();

  // Set options (All the available options are listed below in the documentation)
  const options = {
      customData: { url: url, format: 'cif'},
      hideControls: true,
      alphafoldView: true,
      landscape: true,
  };
  
  // Call render method to display the 3D view
  viewerInstance.render(container.node(), options);
  
}

// https://gist.github.com/tophtucker/62f93a4658387bb61e4510c37e2e97cf
function measure_text(string, fontSize = 10) {
  if (!string) return '';
  const widths = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.2796875,0.2765625,0.3546875,0.5546875,0.5546875,0.8890625,0.665625,0.190625,0.3328125,0.3328125,0.3890625,0.5828125,0.2765625,0.3328125,0.2765625,0.3015625,0.5546875,0.5546875,0.5546875,0.5546875,0.5546875,0.5546875,0.5546875,0.5546875,0.5546875,0.5546875,0.2765625,0.2765625,0.584375,0.5828125,0.584375,0.5546875,1.0140625,0.665625,0.665625,0.721875,0.721875,0.665625,0.609375,0.7765625,0.721875,0.2765625,0.5,0.665625,0.5546875,0.8328125,0.721875,0.7765625,0.665625,0.7765625,0.721875,0.665625,0.609375,0.721875,0.665625,0.94375,0.665625,0.665625,0.609375,0.2765625,0.3546875,0.2765625,0.4765625,0.5546875,0.3328125,0.5546875,0.5546875,0.5,0.5546875,0.5546875,0.2765625,0.5546875,0.5546875,0.221875,0.240625,0.5,0.221875,0.8328125,0.5546875,0.5546875,0.5546875,0.5546875,0.3328125,0.5,0.2765625,0.5546875,0.5,0.721875,0.5,0.5,0.5,0.3546875,0.259375,0.353125,0.5890625]
  const avg = 0.5279276315789471
  return string
    .split('')
    .map(c => c.charCodeAt(0) < widths.length ? widths[c.charCodeAt(0)] : avg)
    .reduce((cur, acc) => acc + cur) * fontSize
}

async function loadGenome(p) {
    console.log('loading genome for ', p);

    const container = document.getElementById('genome-viewer');
    
    // Check if already loaded
    if (container.querySelector('canvas')) return;

    
    try {
        const gbkPath = `./data/phage_genomes/${p.Phage}.gbk`;
        const response = await fetch(gbkPath);
        
        if (!response.ok) {
            throw new Error(`Could not load genome file: ${gbkPath}`);
        }
        
        const gbkText = await response.text();

        const seqFile = new CGParse.SequenceFile(gbkText);
        const cgvJSON = seqFile.toCGViewJSON({
          // Config defined above
          //config: config,
          // Common settings for parsing bacterial genomes
          excludeFeatures: ['source'],
          //excludeQualifiers: ['translation'],
        });

        console.log('CGView JSON:', cgvJSON);

        const feats = cgvJSON.cgview.features;
        const genomeLen = cgvJSON.cgview.sequence.contigs[0].length;

        console.log('Features:', feats);

        // D3 genome visualization
        const viewerDiv = document.querySelector('#genome-viewer');
        const svgWidth = viewerDiv.clientWidth * 0.9;
        const svgHeight = 120;
        const margin = { top: 20, right: 20, bottom: 40, left: 20 };
        const plotWidth = svgWidth * 0.9;
        const plotHeight = svgHeight - margin.top - margin.bottom;

        // Clear any existing D3 svg
        d3.select('#genome-viewer').selectAll('*').remove();

        // Create SVG
        const svg = d3.select('#genome-viewer')
          .append('svg')
          .attr('class', 'd3-genome')
          .attr('width', svgWidth)
          .attr('height', svgHeight);

        const g = svg.append('g')
          .attr('transform', `translate(${margin.left}, ${margin.top})`);

        let legendValues = ['tail', 'head and packaging', 'lysis', 'connector', 'DNA, RNA and nucleotide metabolism', 'transcription regulation'];
        for (let f of feats) {
          f['legend'] = (legendValues.includes(f.qualifiers.function)) ? f.qualifiers.function : 'other';
          f['name'] = ['', 'hypothetical protein', 'unknown function'].indexOf(f.qualifiers.product) > -1 ? '' : f.qualifiers.product;
        }
        legendValues.push('other');

        // Create scale for x-axis
        const xScale = d3.scaleLinear()
          .domain([0, genomeLen])
          .range([0, plotWidth]);

        // Create and add x-axis (domain line hidden via CSS)
        const xAxis = d3.axisBottom(xScale);
        g.append('g')
          .attr('class', 'x-axis')
          .attr('transform', `translate(0, ${plotHeight})`)
          .call(xAxis)
          .call(axis => axis.select('.domain').remove());

        // Center line between the two strand rows
        g.append('line')
          .attr('x1', 0)
          .attr('x2', plotWidth)
          .attr('y1', plotHeight - 22)
          .attr('y2', plotHeight - 22)
          .attr('stroke', 'white')
          .attr('stroke-width', 1);

        // Create color scale based on legend values
        
        console.log('Legend values:', legendValues);
        const colorScale = d3.scaleOrdinal()
          .domain(legendValues)
          .range(d3.schemeCategory10);

        // Create tooltip
        const tooltip = d3.select('#genome-viewer')
          .append('div')
          .attr('class', 'd3-tooltip')
          .style('position', 'absolute')
          .style('visibility', 'hidden')
          .style('background-color', 'rgba(0, 0, 0, 0.8)')
          .style('color', 'white')
          .style('padding', '8px')
          .style('border-radius', '4px')
          .style('font-size', '24px')
          .style('pointer-events', 'none')
          .style('z-index', '1000');

        // Draw features as rectangles
        g.selectAll('.feature-rect')
          .data(feats)
          .enter()
          .append('rect')
          .attr('class', 'feature-rect')
          .attr('x', d => xScale(d.start))
          .attr('y', d => d.strand === 1 ? plotHeight - 42 : plotHeight -17)
          .attr('width', d => Math.max(1, xScale(d.stop) - xScale(d.start)))
          .attr('height', 15)
          .attr('fill', d => colorScale(d.legend))
          .attr('stroke', '#333')
          .attr('stroke-width', 0.5)
          .style('cursor', 'pointer')
          .on('click', function(event, d) {
            showSidebar(d);
          })
          .on('mouseover', function(event, d) {
            tooltip.style('visibility', 'visible')
              .text(d.name || 'Unknown');
            d3.select(this).attr('opacity', 0.7);
          })
          .on('mousemove', function(event) {
            const [x, y] = d3.pointer(event, d3.select('#genome-viewer').node());
            tooltip.style('top', (y-30) + 'px')
              .style('left', (x+10) + 'px');
          })
          .on('mouseout', function() {
            tooltip.style('visibility', 'hidden');
            d3.select(this).attr('opacity', 1);
          });

        // Draw upward-pointing arrow below x-axis for the receptor-binding protein gene
        // In 2 cases there are multiple RBPs, we will always take just
        // the first, which is what is shown in the structure
        const rbpID = p['Receptor-binding protein'].split(';')[0];
        const rbpFeat = feats.find(f => f.qualifiers.ID === rbpID);
        if (rbpFeat) {
            const midX = xScale((rbpFeat.start + rbpFeat.stop) / 2);
            const tipY = plotHeight + 25;
            const baseY = tipY + 10;
            const halfW = 6;
            g.append('polygon')
              .attr('points', `${midX},${tipY} ${midX - halfW},${baseY} ${midX + halfW},${baseY}`)
              .attr('fill', 'white')
              .attr('stroke', 'none');
        }

        let character_running_sum = 0;
        let legend_offsets = [];
        for (let l of legendValues) {
        legend_offsets.push(character_running_sum);
        character_running_sum += measure_text(l, 12) + 50; // 4 for spacing
        }

        // Create legend for feature types
        const legendContainer = g.append('g')
        .attr('class', 'feature-legend')
        .attr('transform', `translate(0, ${-margin.top + 5})`);

        const legendItems = legendContainer.selectAll('.legend-item')
        .data(legendValues)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => `translate(${legend_offsets[i]}, 0)`);

        legendItems.append('rect')
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', d => colorScale(d))
        .attr('stroke', '#333')
        .attr('stroke-width', 0.5);

        legendItems.append('text')
        .attr('x', 20)
        .attr('y', 12)
        .style('font-size', '12px')
        .style('fill', 'var(--text-secondary)')
        .text(d => d);


        // Setup sidebar if it doesn't exist
        let sidebar = d3.select('#genome-viewer-sidebar');
        let sidebarContent, sidebarDiv, sidebarButton;
        let sidebarExpanded = false;
        const sidebarWidth = 300;
        
        if (sidebar.empty()) {              
            sidebar = d3.select('#genome-viewer').append('div')
                .attr('id', 'genome-viewer-sidebar')
                .style('background-color', '#2a2a2a')
                .style('border-left', '1px solid #404040')
                .style('width', '0')
                .style('position', 'absolute')
                .style('top', '0')
                .style('right', '0')
                .style('min-height', '100%')
                .style('z-index', '12')
                .style('text-align', 'left')
                .style('transition', 'width 0.3s')
                .on('mousedown', function(event) {
                    event.stopPropagation();
                });
            
            sidebarContent = sidebar.append('div')
                .attr('class', 'sidebar-content-div')
                .style('margin', '10px')
                .style('display', 'none')
                .style('overflow-y', 'auto')
                .style('max-height', '600px')
                .style('padding-bottom', '20px');
            
            sidebarDiv = sidebarContent.append('div')
                .attr('class', 'sidebar-content-inner-div')
                .style('color', '#e0e0e0')
                .html('<h2 style="color: #CCC;">Click on a gene to see info here</h2>');
            
            sidebarButton = sidebar.append('button')
                .attr('aria-label', 'Toggle gene details sidebar')
                .attr('aria-expanded', 'false')
                .style('font-size', '16px')
                .style('background-color', '#3a3a3a')
                .style('color', '#e0e0e0')
                .style('border', '1px solid #404040')
                .style('border-radius', '4px')
                .style('padding', '4px 8px')
                .html('<')
                .style('position', 'absolute')
                .style('top', '5px')
                .style('right', '5px')
                .style('cursor', 'pointer')
                .on('click', () => {
                    if (sidebarExpanded) {
                        sidebar.style('width', '0');
                        sidebarButton.html('<').attr('aria-expanded', 'false');
                        sidebarContent.style('display', 'none');
                        sidebarExpanded = false;
                    } else {
                        sidebar.style('width', sidebarWidth + 'px');
                        sidebarButton.html('>').attr('aria-expanded', 'true');
                        sidebarContent.style('display', 'block');
                        sidebarExpanded = true;
                    }
                })
                .on('mouseover', function() {
                    d3.select(this).style('background-color', '#404040');
                })
                .on('mouseout', function() {
                    d3.select(this).style('background-color', '#3a3a3a');
                });
        } else {
            sidebarContent = sidebar.select('.sidebar-content-div');
            sidebarDiv = sidebar.select('.sidebar-content-inner-div');
            sidebarButton = sidebar.select('button');
        }
        
        const showSidebar = (gene) => {
            console.log('showing sidebar for gene:', gene);
            sidebarDiv.selectAll('*').remove();
            
            if (gene) {
                const sidebarInfoRows = [
                    ['Name:', gene.name || 'Unknown'],
                    ['Start:', gene.start],
                    ['End:', gene.stop],
                    ['Strand:', gene.strand === 1 ? '+' : '-'],
                    ['Length:', gene.stop - gene.start + ' bp'],
                    ['ID:', gene.qualifiers.ID || 'N/A'],
                    ['Function:', gene.qualifiers.function || 'N/A'],
                    ['Product:', gene.qualifiers.product || 'N/A'],
                    ['Phrog:', gene.qualifiers.phrog || 'N/A'],
                ];
                
                sidebarDiv.selectAll('.sidebar-info-row')
                    .data(sidebarInfoRows)
                    .enter()
                    .append('p')
                    .attr('class', 'sidebar-info-row')
                    .style('color', '#e0e0e0')
                    .style('margin-bottom', '8px')
                    .html(d => `<strong style="color: #b0b0b0;">${d[0]}</strong> ${d[1]}`);

            sidebarDiv.append('p').append('button')
                .html('Copy AA Sequence')
                .style('background-color', '#3a3a3a')
                .style('color', '#e0e0e0')
                .style('border', '1px solid #404040')
                .style('border-radius', '4px')
                .style('padding', '6px 12px')
                .style('cursor', 'pointer')
                .style('font-size', '14px')
                .style('margin-top', '8px')
                .style('margin-bottom', '15px')
                .on('mouseover', function() {
                    d3.select(this).style('background-color', '#404040');
                })
                .on('mouseout', function() {
                    d3.select(this).style('background-color', '#3a3a3a');
                })
                .on('click', function() {
                    navigator.clipboard.writeText(gene.qualifiers.translation || '');
                    d3.select(this).text('Copied!');
                    setTimeout(() => {
                    d3.select(this).text('Copy AA Sequence');
                    }, 1000);
                })
            sidebarDiv.append('p').append('a')
                .attr('href', `https://fast.genomics.lbl.gov/cgi/findHomologs.cgi?seqDesc=${gene.qualifiers.id}&seq=${gene.qualifiers.translation || ''}`)
                .attr('target', '_blank')
                .style('color', '#4a9eff')
                .style('text-decoration', 'none')
                .style('font-size', '14px')
                .on('mouseover', function() {
                    d3.select(this).style('text-decoration', 'underline');
                })
                .on('mouseout', function() {
                    d3.select(this).style('text-decoration', 'none');
                })
                .html('Find homologs with fast.genomics')
            }
            
            sidebar.style('width', sidebarWidth + 'px');
            sidebarButton.html('>').attr('aria-expanded', 'true');
            sidebarContent.style('display', 'block');
            sidebarContent.node().scrollTop = 0;
            sidebarExpanded = true;
        };
        
        
    } catch (error) {
        console.error('Error loading genome:', error);
        container.innerHTML = `<p style="color: var(--accent-secondary);">Error loading genome: ${error.message}</p>`;
    }
}


// ============================================
// BARSEQ BROWSER LINK
// ============================================
function getVisiblePhages() {
    // Phages passing both the brush selection and table filters
    return phageData
        .filter(d => {
            if (selectedPhages.size > 0 && !selectedPhages.has(d.Phage)) return false;
            for (const filter of tableFilters) {
                if (!filter.values.has(d[filter.column])) return false;
            }
            return true;
        })
        .map(d => d.Phage);
}

function openBarseqBrowser(phages) {
    const url = new URL('barseq_browser/BW25113/index.html', window.location.href);
    if (phages) url.searchParams.set('phages', phages.join(','));
    window.open(url.toString(), '_blank');
}

function handleBarseqLinkClick() {
    const phages = getVisiblePhages();

    const hasSubset = selectedPhages.size > 0 || tableFilters.length > 0 || tableSearchText;

    if (phages.length < 21) {
        openBarseqBrowser(phages);
        return;
    } else if (~hasSubset) {
        openBarseqBrowser(null);
        return
    }

    // Show warning popup
    const overlay = d3.select('body').append('div')
        .attr('class', 'filter-popup-overlay')
        .style('position', 'fixed')
        .style('top', '0')
        .style('left', '0')
        .style('width', '100%')
        .style('height', '100%')
        .style('background', 'rgba(0, 0, 0, 0.7)')
        .style('z-index', '2000')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('justify-content', 'center');

    const popup = overlay.append('div')
        .style('background', '#2a2a2a')
        .style('border', '2px solid #404040')
        .style('border-radius', '8px')
        .style('padding', '28px')
        .style('max-width', '420px')
        .style('width', '90%')
        .style('color', '#e0e0e0')
        .style('text-align', 'center');

    popup.append('p')
        .style('font-size', '16px')
        .style('margin-top', '0')
        .style('margin-bottom', '24px')
        .text(`The browser will be slow if more than 20 phages are selected (${phages.length} currently selected).`);

    const btnRow = popup.append('div')
        .style('display', 'flex')
        .style('gap', '12px')
        .style('justify-content', 'center');

    btnRow.append('button')
        .style('background', '#3a3a3a')
        .style('color', '#e0e0e0')
        .style('border', '1px solid #404040')
        .style('padding', '8px 16px')
        .style('border-radius', '4px')
        .style('cursor', 'pointer')
        .style('font-size', '14px')
        .text('Load anyway')
        .on('click', () => {
            overlay.remove();
            openBarseqBrowser(phages);
        });

    btnRow.append('button')
        .style('background', '#4a9eff')
        .style('color', 'white')
        .style('border', 'none')
        .style('padding', '8px 16px')
        .style('border-radius', '4px')
        .style('cursor', 'pointer')
        .style('font-size', '14px')
        .text('Load with a subsample (20)')
        .on('click', () => {
            overlay.remove();
            // Fisher-Yates shuffle then take first 20
            const shuffled = [...phages];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            openBarseqBrowser(shuffled.slice(0, 20));
        });

    btnRow.append('button')
        .style('background', 'none')
        .style('color', '#808080')
        .style('border', '1px solid #404040')
        .style('padding', '8px 16px')
        .style('border-radius', '4px')
        .style('cursor', 'pointer')
        .style('font-size', '14px')
        .text('Cancel')
        .on('click', () => overlay.remove());
}

// ============================================
// POPUP NAVIGATION
// ============================================
function getOrderedVisiblePhages() {
    const rows = d3.select('.phage-table tbody').selectAll('tr')
        .filter(function() { return !d3.select(this).classed('filtered_out_row'); });
    return rows.data();
}

function navigatePopup(direction) {
    if (!currentPhage) return;
    const phages = getOrderedVisiblePhages();
    if (phages.length === 0) return;
    const idx = phages.findIndex(d => d.Phage === currentPhage.Phage);
    const newIdx = idx < 0 ? 0 : (idx + direction + phages.length) % phages.length;
    showPopup(phages[newIdx]);
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadData();

    // Close popup
    document.getElementById('popup-close').addEventListener('click', hidePopup);
    document.getElementById('popup-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'popup-overlay') {
            hidePopup();
        }
    });

    // Popup navigation buttons
    document.getElementById('popup-nav-left').addEventListener('click', (e) => {
        e.stopPropagation();
        navigatePopup(-1);
    });
    document.getElementById('popup-nav-right').addEventListener('click', (e) => {
        e.stopPropagation();
        navigatePopup(1);
    });

    // Keyboard shortcuts and focus trap for popup
    document.addEventListener('keydown', (e) => {
        const overlay = document.getElementById('popup-overlay');
        if (!overlay.classList.contains('active')) return;

        // Focus trap (Tab / Shift+Tab)
        handlePopupFocusTrap(e);

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Escape') {
            hidePopup();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigatePopup(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigatePopup(1);
        }
    });

    // Handle window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (phageData.length > 0) {
                initializeTable();
            }
        }, 250);
    });
});
