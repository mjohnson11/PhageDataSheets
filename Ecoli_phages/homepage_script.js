// homepage_script.js

let phageData = [];
let networkData = { nodes: [], links: [] };
let familyColors = {};

const networkMargin = { top: 20, right: 20, bottom: 20, left: 20 };
let networkWidth, networkHeight;

async function loadData() {
    try {
        phageData = await d3.tsv('./data/Table_S1_Phages.tsv');
        
        const ntwResponse = await fetch('./data/c1_new.ntw');
        const ntwText = await ntwResponse.text();
        const rawNetworkData = parseNTW(ntwText);
        
        const phageNames = new Set(phageData.map(d => d.Phage));
        const filteredLinks = rawNetworkData.filter(link => 
            phageNames.has(link.source) && phageNames.has(link.target)
        );

        networkData.nodes = phageData.map(d => ({
            id: d.Phage,
            data: d
        }));

        networkData.links = filteredLinks.map(link => ({
            source: link.source,
            target: link.target,
            weight: link.weight
        }));

        generateFamilyColors();
        initializeNetwork();
    } catch (error) {
        console.error('Error loading data:', error);
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

// Handlers for interaction
function handleNodeMouseOver(event, d) {
    d3.select(this)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    const tooltip = d3.select('#tooltip');
    
    const fullName = d.data['Full name'] || d.data.Phage;
    const nickname = d.data.Phage;
    const tooltipTitle = (fullName !== nickname && fullName) ? `${fullName} (${nickname})` : (fullName || nickname);
    const tooltipContent = `
        <div class="tooltip-title">${tooltipTitle}</div>
        <div class="tooltip-row"><span class="tooltip-label">Lifestyle:</span> <span class="tooltip-value">${d.data.Lifestyle || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Morphotype:</span> <span class="tooltip-value">${d.data.Morphotype || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Family:</span> <span class="tooltip-value">${d.data.Family || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Subfamily:</span> <span class="tooltip-value">${d.data.Subfamily || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Genus:</span> <span class="tooltip-value">${d.data.Genus || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">BW25113 susceptibility:</span> <span class="tooltip-value">${d.data['BW25113 susceptibility'] || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">BL21 susceptibility:</span> <span class="tooltip-value">${d.data['BL21 susceptibility'] || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">BW25113 receptor:</span> <span class="tooltip-value">${d.data['BW25113 receptor'] || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">BW25113 LPS sugar:</span> <span class="tooltip-value">${d.data['BW25113 LPS sugar'] || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">BL21 receptor:</span> <span class="tooltip-value">${d.data['BL21 receptor'] || 'N/A'}</span></div>
    `;
    
    tooltip.html(tooltipContent)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .classed('visible', true);
}

function handleNodeMouseOut(event, d) {
    d3.select(this)
      .attr('stroke', '#1a1a1a')
      .attr('stroke-width', 1);

    d3.select('#tooltip').classed('visible', false);
}

function handleNodeClick(event, d) {
    // Navigate to the datasheet for this phage
    window.location.href = `datasheet.html?phage=${encodeURIComponent(d.id)}`;
}

function initializeNetwork() {
    const container = d3.select('#network-container');
    container.selectAll('*').remove();
    
    // Fixed canonical dimensions — simulation always runs in this space so layout is identical
    // regardless of actual window size. SVG viewBox scales it to fill the container.
    const CANON_W = 1200;
    const CANON_H = 800;
    networkWidth = CANON_W - networkMargin.left - networkMargin.right;
    networkHeight = CANON_H - networkMargin.top - networkMargin.bottom;

    const svg = container.append('svg')
        .attr('viewBox', `0 0 ${CANON_W} ${CANON_H}`)
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('preserveAspectRatio', 'xMidYMid meet');
    
    const background_g = svg.append('g')
        .attr('transform', `translate(${networkMargin.left},${networkMargin.top})`);

    const g = svg.append('g')
        .attr('transform', `translate(${networkMargin.left},${networkMargin.top})`);
    
    // Create links group
    const linksGroup = g.append('g').attr('class', 'links');
    
    // Create nodes group
    const nodesGroup = g.append('g').attr('class', 'nodes');

    // unseeded initial node positions so simulation has different layout each time
    const rng = Math.random;
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
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.6)
        .attr('stroke-width', d => Math.max(0.5, Math.min(d.weight / 20, 3)));
    
    // Draw nodes
    const node = nodesGroup.selectAll('circle')
        .data(networkData.nodes)
        .join('circle')
        .attr('class', 'node')
        .attr('r', 6)
        .attr('fill', d => d.data ? getFamilyColor(d.data.Family) : '#555')
        .attr('stroke', '#1a1a1a')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
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
}

// Start execution
window.addEventListener('DOMContentLoaded', loadData);
