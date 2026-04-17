// ============================================
function toggleNetwork() {
    const container = d3.select('.network-body-wrapper');
    const btn = d3.select('#toggle-network-btn');

    // Return early if the selection is empty
    if (container.empty()) return;

    // Check current display style
    const isHidden = container.style('display') === 'none';
    if (isHidden) {
        container.style('display', 'flex');
        btn.text('Hide Network');
    } else {
        container.style('display', 'none');
        btn.text('Show Network');
    }
}

// ============================================
// GLOBAL STATE
// ============================================
let phageData = [];
let eopData = [];
let BL21GeneData = [];
let KeioGeneData = [];
let dubseqPhages = [];
let networkData = { nodes: [], links: []};
let selectedPhages = new Set();
let highlightedPhage = null;
let currentPhage = null;
let familyColors = {};
let taxonomyColorScales = {};
let tableFilters = []; // Array of {column, values} objects
let tableSort = { column: null, direction: 0 }; // 0=default, 1=asc, -1=desc
let tableSearchText = '';
let openFilterDropdownEl = null;

// SVG dimensions for network
const networkMargin = { top: 20, right: 20, bottom: 20, left: 20 };
let networkWidth, networkHeight;

let currentNetworkColorColumn = "BW25113 receptor";

const manual_network_annotations = [
    {Text: "Dhillonvirus", x: -1220, y: 600, align_side: 'end'},
    {Text: "Ackermannviridae", x: 630, y: 140, align_side: 'middle'},
    {Text: "Vequintavirus", x: -1250, y: -450, align_side: 'end'},
    {Text: "Justusliebigvirus", x: -820, y: -650, align_side: 'start'},
    {Text: "Krischvirus", x: -370, y:-540, align_side: 'middle'},
    {Text: "Tequatrovirus", x: -690, y: 220, align_side: 'middle'},
    {Text: "Gordonclarckvirinae", x: -200, y: -150, align_side: 'middle'},
    {Text: "Skatevirus", x: 270, y: 500, align_side: 'middle'},
    {Text: "Lindbergviridae", x: 900, y: -150, align_side: 'middle'},
    {Text: "Hendrixvirinae", x: -1320, y: 150, align_side: 'start'},
    {Text: "Autotranscriptaviridae", x: 230, y: -270, align_side: 'middle'},
    {Text: "Demerecviridae", x: 850, y: -780, align_side: 'middle'},
    {Text: "Kagunavirus", x: -1730, y: 490, align_side: 'end'},
    {Text: "Enquatrovirinae", x: 350, y: -150, align_side: 'middle'},
    {Text: "Mosigvirus", x: -780, y: -360, align_side: 'middle'},
    {Text: "Felixounavirus", x: 550, y: -520, align_side: 'middle'},
    {Text: "Queuovirinae", x: 70, y: 140, align_side: 'middle'},
    {Text: "Drexlerviridae", x: -500, y: 540, align_side: 'end'}
]

const seaborn_cb_palette = [
    '#0173b2',
    '#de8f05',
    '#029e73',
    '#d55e00',
    '#cc78bc',
    '#ca9161',
    '#fbafe4',
    '#ece133',
    '#56b4e9'
]
/*
Old color scheme
const receptorColors = {
  Tsx: "#fdd49e",
  OmpF: "#025a32",
  OmpA: "#42ab5d",
  OmpC: "#9ad8ca",
  FhuA: "#df66b0",
  BtuB: "#215fa8",
  LptD: "#8c97c6",
  LamB: "#fb6b4b",
  NGR: "#ffc450"
};

const lpsColors = {
    Kdo: "#f98f30",
    HepI: "#de0077",
    HepII: "#4392c7",
    GluI: "#42ab5d"
}

const lifestyleColors = {
    'lytic': '#fb6a4a',
    'temperate/lytic': '#a1d99b',
    'temperate': '#31a354'
};

const morphotypeColors = {
    'Myovirus': '#9e9ac8',
    'Siphovirus': '#fdae6b',
    'Podovirus': '#9ecae1'
};
*/

/*const receptorColors = {
  Tsx: seaborn_cb_palette[0],
  OmpF: seaborn_cb_palette[1],
  OmpA: seaborn_cb_palette[2],
  OmpC: seaborn_cb_palette[3],
  FhuA: seaborn_cb_palette[4],
  BtuB: seaborn_cb_palette[5],
  LptD: seaborn_cb_palette[6],
  LamB: seaborn_cb_palette[7],
  NGR: seaborn_cb_palette[8],
  Resistant: '#555'
};

const lpsColors = {
    Kdo: seaborn_cb_palette[0],
    HepI: seaborn_cb_palette[1],
    HepII: seaborn_cb_palette[2],
    GluI: seaborn_cb_palette[3],
    Resistant: '#555'
}
*/

const receptorColors = {
  Tsx: '#FDD49E',
  OmpF: '#005A32',
  OmpA: '#41AB5D',
  OmpC: '#99D8C9',
  FhuA: '#DF65B0',
  BtuB: '#225EA8',
  LptD: '#8C96C6',
  LamB: '#FB6A4A',
  NGR: '#FEC44F',
  Resistant: '#555'
}

const lpsColors = {
    Kdo: '#FE9929',
    HepI: '#E7298A',
    HepII: '#4292C6',
    GluI: '#41AB5D',
    Resistant: '#555'
}


const lifestyleColors = {
    'virulent': seaborn_cb_palette[0],
    'temperate': seaborn_cb_palette[1]
};

const morphotypeColors = {
    'Myovirus': seaborn_cb_palette[3],
    'Siphovirus': seaborn_cb_palette[4],
    'Podovirus': seaborn_cb_palette[7]
};

const networkColorMaps = {
    "BW25113 receptor": receptorColors,
    "BW25113 LPS sugar": lpsColors,
    "Lifestyle": lifestyleColors,
    "Morphotype": morphotypeColors
};

// NETWORK LEGEND FUNCTIONS 

d3.select('#legend-select').on('change', function() {
    currentNetworkColorColumn = d3.select(this).property('value');
    updateNetworkColors();
    renderInteractiveLegend();
});

function updateNetworkColors() {
    const colorMap = networkColorMaps[currentNetworkColorColumn];
    d3.selectAll('.network_node')
        .transition()
        .duration(200)
        .attr('fill', d => {
            if (!d.data) return '#CCC';
            const val = d.data[currentNetworkColorColumn];
            return (val && colorMap[val]) ? colorMap[val] : '#CCC';
        });
}

function renderInteractiveLegend() {
    const container = d3.select('#legend-items');
    container.selectAll('*').remove();
    
    const colorMap = networkColorMaps[currentNetworkColorColumn];
    if (!colorMap) return;

    Object.entries(colorMap).forEach(([val, color]) => {
        const row = container.append('div')
            .attr('class', 'legend-item-row')
            .attr('title', `Filter table by ${val}`)
            .attr('data-legend-val', val)
            .on('click', () => {
                const existingFilter = tableFilters.find(f => f.column === currentNetworkColorColumn);
                if (existingFilter && existingFilter.values.has(val) && existingFilter.values.size === 1) {
                    clearColumnFilter(currentNetworkColorColumn);
                    d3.selectAll('.legend-item-row').classed('.active-legend-filter', false)
                } else {
                    setColumnFilter(currentNetworkColorColumn, [val]);
                    d3.selectAll('.legend-item-row').classed('.active-legend-filter', false)
                    d3.select(this).classed('active-legend-filter', true);
                }
            });
            
        row.append('div')
            .attr('class', 'legend-color-box')
            .style('background', color);
            
        row.append('span')
            .text(val);
    });

    if (typeof updateLegendSelection === 'function') updateLegendSelection();
}

function updateLegendSelection() {
    const activeFilterBox = tableFilters.find(f => f.column === currentNetworkColorColumn);
    let activeValues = new Set();
    if (activeFilterBox) activeValues = activeFilterBox.values;

    d3.selectAll('.legend-item-row').classed('active-legend-filter', function() {
        return activeValues.has(d3.select(this).attr('data-legend-val'));
    });
}


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

        
        // We'll attach the new raw items to networkData so initializeNetwork can access them
        networkData.rawNodes = await d3.csv('./data/network_nodes.csv');
        networkData.rawEdges = await d3.csv('./data/network_edges.csv');

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
    // Uses the network data to draw a network in gray on canvas
    // Then draws the phages from the metadata file in svg on top

    const container = d3.select('#network-container');
    container.selectAll('*').remove();
    
    // Fixed canonical dimensions
    const CANON_W = 1040;
    
    const xExtent = d3.extent(networkData.rawNodes, d => +d.x);
    const yExtent = d3.extent(networkData.rawNodes, d => +d.y);
    const dataAspectRatio = (yExtent[1] - yExtent[0]) / (xExtent[1] - xExtent[0]);
    
    networkWidth = CANON_W - networkMargin.left - networkMargin.right;
    networkHeight = networkWidth * dataAspectRatio;
    const CANON_H = networkHeight + networkMargin.top + networkMargin.bottom;

    const wrapper = container.append('div')
        .style('position', 'relative')
        .style('width', '100%')
        .style('aspect-ratio', `${CANON_W} / ${CANON_H}`);

    const canvas = wrapper.append('canvas')
        .attr('width', CANON_W)
        .attr('height', CANON_H)
        .style('position', 'absolute')
        .style('top', '0')
        .style('left', '0')
        .style('width', '100%')
        .style('height', '100%');

    const ctx = canvas.node().getContext('2d');

    const svg = wrapper.append('svg')
        .attr('viewBox', `0 0 ${CANON_W} ${CANON_H}`)
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .attr('role', 'img')
        .attr('aria-label', `Network graph of ${networkData.nodes.length} phages colored by family, showing sequence similarity connections`)
        .style('position', 'absolute')
        .style('top', '0')
        .style('left', '0');

    const brush = d3.brush()
        .extent([[0, 0], [CANON_W, CANON_H]])
        .on('start brush', brushUpdate);
    
    svg.append('g')
        .attr('class', 'brush')
        .call(brush);
    
    const nodesGroup = svg.append('g').attr('class', 'nodes');

    // Set up scales using rawNodes
    const xScale = d3.scaleLinear()
        .domain(xExtent)
        .range([networkMargin.left, CANON_W - networkMargin.right]); 

    const yScale = d3.scaleLinear()
        .domain(yExtent)
        .range([networkMargin.top, CANON_H - networkMargin.bottom]);

    // coordsMap helps with quickly plotting edges on the canvas
    const coordsMap = {};
    networkData.rawNodes.forEach(d => {
        coordsMap[d.ID] = {
            x: xScale(+d.x),
            y: yScale(+d.y)
        };
    });
    
    const nameToCoords = {};
    networkData.rawNodes.forEach(d => {
        nameToCoords[d.Phage] = coordsMap[d.ID];
    });

    networkData.nodes.forEach(n => {
        if(nameToCoords[n.id]) {
            n.x = nameToCoords[n.id].x;
            n.y = nameToCoords[n.id].y;
        } else { 
            // this applies to a few engineered phage that are in the table but not the network
            n.x = -100;
            n.y = -100;
        }
    });

    // Draw on Canvas
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    // drawing edges
    networkData.rawEdges.forEach(edge => {
        const source = coordsMap[edge.source];
        const target = coordsMap[edge.target];
        if(source && target) {
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);
        }
    });
    ctx.stroke();

    // drawing nodes
    ctx.fillStyle = '#777777';
    ctx.globalAlpha = 1.0;
    networkData.rawNodes.forEach(n => {
        const p = coordsMap[n.ID];
        if(p) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
    });
    
    // Draw SVG nodes for data in phageData
    const nodeData = networkData.nodes.filter(d => nameToCoords[d.id]);
    nodesGroup.selectAll('.network_node')
        .data(nodeData)
        .join('circle')
        .attr('class', 'network_node')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r', 6)
        .attr('fill', d => {
            const colorMap = networkColorMaps[currentNetworkColorColumn];
            const val = d.data ? d.data[currentNetworkColorColumn] : null;
            return (val && colorMap[val]) ? colorMap[val] : '#CCC';
        })
        .on('mouseover', handleNodeMouseOver)
        .on('mouseout', handleNodeMouseOut)
        .on('click', handleNodeClick);

    // draw annotations on svg
    const annotationGroup = svg.append('g').attr('class', 'annotations');
    annotationGroup.selectAll('.network_annotation')
        .data(manual_network_annotations)
        .join('text')
        .attr('class', 'network_annotation')
        .attr('x', d => xScale(d.x))
        .attr('y', d => yScale(d.y))
        .text(d => d.Text)
        .attr('fill', '#CCC')
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .attr('font-style', 'italic')
        .attr('text-anchor', d => d.align_side);
    
    
    function brushUpdate(event) {
        if (!event.selection) {
            selectedPhages.clear();
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
        nodesGroup.selectAll('.network_node').classed('selected', d => selectedPhages.has(d.id));
    }

    renderInteractiveLegend();
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
    d3.selectAll('.network_node')
        .classed('highlighted', function(d) {
            if (d.id === phageName) {
                d3.select(this).raise();
                return true;
            } else { 
                return false
            }
        });
}

function clearNodeHighlight() {
    d3.selectAll('.network_node')
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
            .html('<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M1.5 1.5h13L9 8v4.5l-2 1.5V8z"/></svg>')
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
    // Handles sort direction toggle-through
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
    const left = Math.min(rect.left, window.innerWidth - 270) + window.scrollX;
    const top = rect.bottom + 4 + window.scrollY;
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
    if (idx >= 0) { // change existing column filter
        tableFilters[idx].values = new Set(values);
    } else { // set new column filter
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

function clearAllFilters() {
    tableFilters = [];
    selectedPhages.clear();
    tableSearchText = '';
    
    // Reset search input UI
    const searchInput = d3.select('#table-search-input');
    if (!searchInput.empty()) searchInput.property('value', '');
    
    // Clear network brush UI
    const brushGroup = d3.select('.brush');
    if (!brushGroup.empty()) {
        const brush = d3.brush();
        brushGroup.call(brush.move, null);
    }
    
    // Clear network node selected styling
    d3.selectAll('.network_node').classed('selected', false);

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

    if (typeof updateLegendSelection === 'function') updateLegendSelection();
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
    const barseqBtn = d3.select('#barseq-link-btn');
    if (!barseqBtn.empty()) {
        barseqBtn.text(hasSubset
            ? 'See RB-TnSeq data for selected phages'
            : 'See RB-TnSeq data for a subset of these phages'
        );
    }

    const clearFiltersBtn = d3.select('#clear-filters-btn');
    if (!clearFiltersBtn.empty()) {
        clearFiltersBtn.style('display', hasSubset ? 'block' : 'none');
    }

    // Announce filter results to screen readers
    const statusEl = d3.select('#a11y-status');
    if (!statusEl.empty()) {
        if (hasSubset) {
            // Use D3 filter to count rows that do NOT have the 'filtered_out_row' class
            const visibleCount = d3.selectAll('.phage-table tbody tr')
                .filter(function() { 
                    return !d3.select(this).classed('filtered_out_row'); 
                })
                .size();

            statusEl.text(`Showing ${visibleCount} of ${phageData.length} phages`);
        } else {
            statusEl.text('');
        }
    }

    // Hide network nodes that are filtered out by table filters
    d3.selectAll('.network_node')
        .attr('visibility', d => {
            if (tableFilters.length === 0) return 'visible';
            for (const filter of tableFilters) {
                const value = d.data ? d.data[filter.column] : null;
                if (!filter.values.has(value)) return 'hidden';
            }
            return 'visible';
        });
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
    // Store trigger for focus restoration
    if (!currentPhage) {
        popupTriggerEl = document.activeElement;
    }

    currentPhage = phageData;

    const url = new URL(window.location);
    url.searchParams.set('phage', phageData.Phage);
    history.pushState({}, '', url);

    // Update overlay state and accessibility
    d3.select('#popup-overlay')
        .classed('active', true)
        .attr('aria-label', `Phage details: ${phageData.Phage}`);

    // Clear dynamic content
    d3.select('#genome-viewer').selectAll('*').remove();
    
    const popupContent = d3.select('#popup-content');
    popupContent.node().scrollTop = 0; // Access underlying DOM node for property update
    
    populateCustomInfo(phageData);
    loadGenome(phageData);
    loadStructure(phageData);

    // Move focus into popup
    popupContent.node().focus();
}

function hidePopup() {
    d3.select('#popup-overlay').classed('active', false);
    d3.select('#popup-content').style('height', null);
    
    currentPhage = null;

    const url = new URL(window.location);
    url.searchParams.delete('phage');
    history.pushState({}, '', url);

    // Restore focus
    if (popupTriggerEl) {
        popupTriggerEl.focus();
        popupTriggerEl = null;
    }
}

// Focus trap for the popup dialog
function handlePopupFocusTrap(event) {
    const overlay = d3.select('#popup-overlay');
    if (!overlay.classed('active') || event.key !== 'Tab') return;

    // Use d3.selectAll to find focusable elements
    const focusable = overlay.selectAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusable.empty()) return;

    const nodes = focusable.nodes();
    const first = nodes[0];
    const last = nodes[nodes.length - 1];

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

    const container = d3.select('#genome-viewer');
    
    // Check if already loaded
    if (container.node().querySelector('canvas')) return;

    
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

        const feats = cgvJSON.cgview.features;
        const genomeLen = cgvJSON.cgview.sequence.contigs[0].length;

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
        container.html(`<p style="color: var(--accent-secondary);">Error loading genome: ${error.message}</p>`);
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
    } else if (!hasSubset) {
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
document.addEventListener('DOMContentLoaded', () => {    loadData();

    // Close popup
    d3.select('#popup-close').on('click', hidePopup);
    
    d3.select('#popup-overlay').on('click', function(event) {
        // d3.select(this) refers to the element the listener is attached to
        if (event.target.id === 'popup-overlay') {
            hidePopup();
        }
    });

    // Popup navigation buttons
    d3.select('#popup-nav-left').on('click', (event) => {
        event.stopPropagation();
        navigatePopup(-1);
    });

    d3.select('#popup-nav-right').on('click', (event) => {
        event.stopPropagation();
        navigatePopup(1);
    });

    // Keyboard shortcuts and focus trap for popup
    d3.select(document).on('keydown', (event) => {
        const overlay = d3.select('#popup-overlay');
        if (!overlay.classed('active')) return;

        // Focus trap (Tab / Shift+Tab)
        handlePopupFocusTrap(event);

        const targetTag = event.target.tagName;
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

        if (event.key === 'Escape') {
            hidePopup();
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            navigatePopup(-1);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            navigatePopup(1);
        }
    });

    // Handle window resize with a basic debounce
    let resizeTimeout;
    d3.select(window).on('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            // Assuming phageData is a global variable
            if (typeof phageData !== 'undefined' && phageData.length > 0) {
                initializeTable();
            }
        }, 250);
    });
});