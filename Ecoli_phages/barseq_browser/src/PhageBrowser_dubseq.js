import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as aq from 'https://cdn.jsdelivr.net/npm/arquero@7.2.0/dist/arquero.min.js/+esm';
import { sidebar_morgan_info } from "./local_copy_sgb/helper_functions.js";

/*
import { SimpleGenomeBrowser } from "https://cdn.jsdelivr.net/npm/simple-genome-browser@1.0.2/src/SimpleGenomeBrowser.js";
import { geneTableTrack, gffTrack, heatmapTrack } from "https://cdn.jsdelivr.net/npm/simple-genome-browser@1.0.2/src/data_tracks.js";
import { quantitativeFeatureTrack, quantitativeLineTrack, quantitativePointTrack } from "https://cdn.jsdelivr.net/npm/simple-genome-browser@1.0.2/src/SGB_tracks.js";
import { reverse_complement, copy_sequence } from "https://cdn.jsdelivr.net/npm/simple-genome-browser@1.0.2/src/util.js";
*/

import { SimpleGenomeBrowser, serverPointData, serverFeatureData } from "./local_copy_sgb/SimpleGenomeBrowser.js";
import { geneTableTrack, heatmapTrack } from "./local_copy_sgb/data_tracks.js";
import { quantitativePointTrack, quantitativeLineTrack } from "./local_copy_sgb/SGB_tracks.js";

const development_mode = 'localdev'; //'production'; // 'localdev'; //'development';

const ECOCYC_ids = {'Keio': 'ECOLI', 'BL21': 'GCF_000022665'};

const fetch_paths = {
  'production': 'https://iseq.lbl.gov/milophageserver/', 
  'localdev': 'http://127.0.0.1:5000/',
  'development': 'https://kilo.lbl.gov:5555/'
}

const fetch_path = fetch_paths[development_mode];

const c_scale = d3.scaleDiverging()
  .domain([-4, 0, 12])
  .range(["#2d03fc", "#CCCCCC", "#d1b500"])
  .unknown('#AAA');

function coloring_points(d, column) {
  if (d[column] == null) {
    return '#AAA';
  } else {
    return c_scale(d[column]);
  }
}

function coloring_by_strand(d, column) {
  if (d['strand'] == '+') {
    return '#029e73';
  } else if (d['strand'] == '-') {
    return '#d55e00';
  } else {
    return '#AAA'
  }
}

class serverTnSeqPointTrack extends quantitativePointTrack {
  constructor(sgb, name, column, config, contig_column, pos_column, data_name) {
    super(sgb, name, column, config, contig_column, pos_column);
    this.data_name = data_name;
    this.data = this.sgb.data[data_name];
    this.sgb.add_track(this);
  }

  color_func = coloring_by_strand
}

class serverDubSeqLineTrack extends quantitativeLineTrack {
  constructor(sgb, name, column, config, contig_column, start_column, end_column, data_name) {
    super(sgb, name, column, config, contig_column, start_column, end_column);
    this.data_name = data_name;
    this.data = this.sgb.data[data_name];
    this.sgb.add_track(this);
  }

  color_func = () => '#333333'; // no strand data for dubseq
}

function sidebar_effect_section(sgb, gene_object, col) {

  let columns = col.agg_columns || [col];
  
  const table = sgb.sidebar_div.append('table')
        .style('width', '200px') 
        .style('border-collapse', 'collapse')
        .style('border', '1px solid #ddd')
        .style('table-layout', 'fixed'); 
    
  const thead = table.append('thead');
  const headerRow = thead.append('tr')
    .style('background-color', '#f5f5f5')
    .style('border-bottom', '2px solid #ddd');
    
  headerRow.selectAll('th')
    .data(['Set', 'Score'])
    .enter()
    .append('th')
    .style('padding', '4px')
    .style('border-right', (d, i) => i < 2 ? '1px solid #ddd' : null)
    .style('font-size', '12px')
    .style('width', (d, i) => { // Set column widths
      if (d === 'Set') return '50%';
      return '25%';
    })
    .text(d => d);
    
  const tbody = table.append('tbody');

  const rows = tbody.selectAll('.set-row-data')
    .data(columns)
    .enter()
    .append('tr')
    .attr('class', '.set-row-data')
    .style('border-bottom', '1px solid #ddd');


  rows.append('td')
    .style('padding', '4px')
    .style('border-right', '1px solid #ddd')
    .style('font-size', '12px')
    .style('width', '50%') // Match column width
    .html(d => d.name ? (d.name + ', ' + d.column) : d.column);

  rows.append('td')
    .style('padding', '4px')
    .style('border-right', '1px solid #ddd')
    .style('font-size', '12px')
    .style('width', '25%') // Match column width
    .style('background-color', d => d3.scaleDiverging()
      .domain([-4, 0, 4])
      .range(["#2d03fc", "#CCCCCC", "#fcdb03"])(gene_object[d.column]))
    .text(d => gene_object[d.column] ? gene_object[d.column].toFixed(2) : '');

  rows.append('td')
    .style('padding', '4px')
    .style('font-size', '12px')
    .style('width', '25%') // Match column width
    .style('background-color', d => d3.scaleLinear()
      .domain([0, 6])
      .range(["#CCCCCC", "#FF0000"])(Math.abs(gene_object[d.column+'_T'])))
    .text(d => (gene_object[d.column+'_T']) ? gene_object[d.column+'_T'].toFixed(2) : '');
}

class customGeneTableTrack extends geneTableTrack {
  // just changes the sidebar function to include more links

  click_function(gene_object) {
    this.sgb.sidebar_div.selectAll('*').remove();
    sidebar_morgan_info(this.sgb, gene_object);
    this.sgb.sidebar_div.append('p').append('a')
      .attr('href', `https://ecocyc.org/gene?orgid=${ECOCYC_ids[this.sgb.orgId]}&id=${gene_object.ecocyc_id}`)
      .attr('target', '_blank')
      .html('EcoCyc page')
    this.sgb.sidebar_content.node().scrollTop = 0;
    this.sgb.show_sidebar();
  }
}

class customHeatmapTrack extends heatmapTrack {
  click_function(event, col, gene_object) {
    this.sgb.sidebar_div.selectAll('*').remove();
    sidebar_effect_section(this.sgb, gene_object, col)
    sidebar_morgan_info(this.sgb, gene_object);
    this.sgb.sidebar_div.append('p').append('a')
      .attr('href', `https://ecocyc.org/gene?orgid=${ECOCYC_ids[this.sgb.orgId]}&id=${gene_object.ecocyc_id}`)
      .attr('target', '_blank')
      .html('EcoCyc page')
    this.sgb.sidebar_content.node().scrollTop = 0;
    this.sgb.show_sidebar();
  }

  hover_function(e, column, gene_object) {
    // default hover function, assumes columns for locusId, name, desc
    // may want to overwrite in extending classes
    const self = this;
    if (gene_object) {
      const { locusId, name, desc } = gene_object;
      let html = `
          <div class="gene_tooltip">
            <p><strong>Locus ID:</strong> ${locusId}</p>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Description:</strong> ${desc}</p>
            <p><strong>${column.name}:</strong> ${gene_object[column.column].toFixed(3)}</p>
          </div>
        `
      
      self.sgb.tooltip.selectAll('*').remove();
      self.sgb.tooltip.html(html);
      self.sgb.show_tooltip(e.x, e.y)
    }
  }

  make_summary_sidebar(col) {
    // default sidebar function, assumes data has a 'name' column for features
    const self = this;

    function show_panel(panel_name) {
      const p = sidebar_panels[panel_name];
      self.active_sidebar_panel = panel_name;
      d3.select(p.button.node().parentNode).selectAll('button').classed('active', false);
      d3.select(p.button.node()).classed('active', true);
      self.sgb.sidebar_div.selectAll('.panel_content').style('display', 'none');
      self.sgb.sidebar_div.selectAll(`.${p.class}`).style('display', 'block');
    }

    let sorted = self.data.data
      .params({c: col.column})
      .orderby(aq.desc((d, $) => d[$.c]));

    if (self.filter_by_strain_count) {
      sorted = sorted.params({c: col.column+'_num_filtered_insertions'}).filter((d, $) => d[$.c] >= 3);
    }

    const ngenes = sorted.numRows();
    const topGenes = sorted.slice(0,10).objects().map(row => ({ gene: row, score: row[col.column], T: row[col.column+'_T'] }));
    const bottomGenes = sorted.slice(Math.max(ngenes-10, topGenes.length)).objects().map(row => ({ gene: row, score: row[col.column]}));

    self.sgb.sidebar_div.selectAll('*').remove();

    // Add tabs
    const tabs = self.sgb.sidebar_div.append('div').attr('class', 'tabs');
    const sidebar_panels = {gene_hits: {class: 'gene_pm_content', title: 'Top Gene Hits'}, gene_compare: {class: 'gene_compare_content', title: 'Scatterplots'}};
    for (let sp of Object.keys(sidebar_panels)) {
      sidebar_panels[sp].button = tabs.append('button')
        .text(sidebar_panels[sp].title)
        .on('click', function() {
          show_panel(sp, this);
        });
    }

    // Making plus/minus gene display
    const pm_contentDiv = self.sgb.sidebar_div.append('div')
      .attr('class', 'panel_content gene_pm_content');

    pm_contentDiv.append('div')
      .attr('class', 'gene-table')
      .html(`<h3 style="font-size: 14px; margin: 8px 0;">${col.name}</h3>`)
    
    const table = pm_contentDiv.select('.gene-table').append('table')
      .style('width', '350px') 
      .style('border-collapse', 'collapse')
      .style('border', '1px solid #ddd')
      .style('table-layout', 'fixed'); 
  
    const thead = table.append('thead');
    const headerRow = thead.append('tr')
      .style('background-color', '#f5f5f5')
      .style('border-bottom', '2px solid #ddd');
  
    headerRow.selectAll('th')
      .data(['Name', 'Description', 'L2FC'])
      .enter()
      .append('th')
      .style('padding', '4px')
      .style('border-right', (d, i) => i < 2 ? '1px solid #ddd' : null)
      .style('font-size', '12px')
      .style('width', (d, i) => { // Set column widths
        if (d === 'Name') return '25%';
        if (d === 'Description') return '50%';
        return '12.5%';
      })
      .text(d => d);
  
    const tbody = table.append('tbody');
  
    // Function to create table rows
    const createRows = (data, isTop) => {
      if (data.length === 0) return;
  
      tbody.append('tr')
        .style('background-color', '#f5f5f5')
        .append('td')
        .attr('colspan', 3)
        .style('padding', '4px')
        .style('font-size', '12px')
        .style('border-bottom', '1px solid #ddd')
        .html(`<strong>${isTop ? 'Top 10 Genes' : 'Bottom 10 Genes'}</strong>`);
  
      const rows = tbody.selectAll(`.gene-row-${isTop ? 'top' : 'bottom'}`)
        .data(data)
        .enter()
        .append('tr')
        .attr('class', `gene-row-${isTop ? 'top' : 'bottom'}`)
        .style('cursor', 'pointer')
        .style('border-bottom', '1px solid #ddd')
        .attr('data-locus-id', d => d.gene[self.id_col])
        .on('click', function(e, d) {
          self.sgb.display_feature(d.gene[self.contig_col], d.gene[self.start_col], d.gene[self.end_col]);
        });

  
      rows.append('td')
        .style('padding', '4px')
        .style('border-right', '1px solid #ddd')
        .style('font-size', '12px')
        .style('width', '30%') // Match column width
        .html(d => (d.gene.name == 'NA') ? d.gene[self.id_col] : d.gene.name || d.gene[self.id_col]);
  
      rows.append('td')
        .style('padding', '4px')
        .style('border-right', '1px solid #ddd')
        .style('font-size', '12px')
        .style('width', '50%') // Match column width
        .text(function(d) {
          if (d.gene.desc) {
            return `${d.gene.desc.substring(0, 50)}${d.gene.desc.length > 50 ? '...' : ''}`;
          } else {
            return ''
          }
        });
  
      rows.append('td')
        .style('padding', '4px')
        .style('font-size', '12px')
        .style('width', '20%') // Match column width
        .style('background-color', d => d3.scaleDiverging()
          .domain([-4, 0, 4])
          .range(["#2d03fc", "#CCCCCC", "#fcdb03"])(d.score))
        .text(d => d.score.toFixed(2));

    };
  
    // Create top and bottom gene rows
    createRows(topGenes, true);
    createRows(bottomGenes.reverse(), false);

    // Now making scatterplot div, which will not be displayed at first
    const compare_contentDiv = self.sgb.sidebar_div.append('div')
      .attr('class', 'panel_content gene_compare_content');

    // Select element for y-axis
    const select = compare_contentDiv.append('select')
      .style('margin-top', '10px');

    let yAxisColumn = self.include_halfs ? col.column : self.column_config.filter(c => (c.name!=col.column))[0].column; // Default y-axis column
    select.selectAll('option')
      .data(self.include_halfs ? self.column_config : self.column_config.filter(c => (c.name!=col.column)))
      .enter()
      .append('option')
      .text(d => ((d.column==col.column) && self.include_halfs) ? d.name + ' half2' : d.name)
      .attr('value', d => d.column);

    select.property('value', yAxisColumn);

    select.on('change', function() {
      yAxisColumn = d3.select(this).property('value');
      updateScatterplot();
    });

    const svgWidth = 340;
    const svgHeight = 280;
    const margin = { top: 10, right: 20, bottom: 60, left: 50 };
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    const svg = compare_contentDiv.append('svg')
      .attr('width', svgWidth)
      .attr('height', svgHeight)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    let xScale, yScale;

    function updateScatterplot() {
      // Set nulls to 0 in both columns

      const half_half_plot = ((yAxisColumn == col.column) && self.include_halfs);

      const xcol = half_half_plot ? col.column+'_half1' : col.column;
      const ycol = half_half_plot ? col.column+'_half2' : yAxisColumn;

      let plotData;

      if (half_half_plot) {
        plotData = self.data.data
          .select([xcol, ycol, col.column+'_num_filtered_insertions', self.contig_col, self.start_col, self.end_col, self.id_col, 'name', 'desc'])
          .rename({[xcol]: 'x', [ycol]: 'y', [col.column+'_num_filtered_insertions']: 'xf', [col.column+'_num_filtered_insertions']: 'yf'})
          .filter(d => d.x && d.y) // filtering out nulls
          .objects();
      } else {
        plotData = self.data.data
          .select([xcol, ycol, self.contig_col, self.start_col, self.end_col, self.id_col, 'name', 'desc'])
          .rename({[xcol]: 'x', [ycol]: 'y'})
          .filter(d => d.x && d.y) // filtering out nulls
          .objects();
      }


      // Update scales
      xScale = d3.scaleLinear()
        .domain([Math.min(0, d3.min(plotData, d => d.x)), d3.max(plotData, d => d.x)])
        .range([0, width]);

      yScale = d3.scaleLinear()
        .domain([Math.min(0, d3.min(plotData, d => d.y)), d3.max(plotData, d => d.y)])
        .range([height, 0]);

      // Remove existing elements
      svg.selectAll('*').remove();
      if (plotData.length == 0) {
        svg.append('text')
          .attr('x', width / 2)
          .attr('y', height / 2)
          .attr('text-anchor', 'middle')
          .style('font-size', '16px')
          .text('No shared data');
      } else {
// add dashed horizontal line at y=0 and dashed vertical line at x=0
      svg.append('line')
        .attr('x1', xScale(0))
        .attr('y1', 0)
        .attr('x2', xScale(0))
        .attr('y2', height)
        .attr('stroke', 'black')
        .attr('stroke-dasharray', '4');

      svg.append('line')
        .attr('x1', 0)
        .attr('y1', yScale(0))
        .attr('x2', width)
        .attr('y2', yScale(0))
        .attr('stroke', 'black')
        .attr('stroke-dasharray', '4');

      // Add axes
      svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale));

      svg.append('g')
        .call(d3.axisLeft(yScale));

      // Add points
      svg.selectAll('.dot')
        .data(plotData)
        .enter().append('circle')
        .attr('class', 'dot')
        .attr('cx', function(d) {
          if (self.filter_by_strain_count) {
            return (d.xf < 3) ? xScale(0) : xScale(d.x);
          } else {
            return xScale(d.x);
          }
        })
        .attr('cy', function(d) {
          if (self.filter_by_strain_count) {
            return (d.yf < 3) ? yScale(0) : yScale(d.y);
          } else {
            return yScale(d.y);
          }
        })
        .attr('r', 3)
        .attr('fill', function(d) {
          if (self.filter_by_strain_count) {
            if (d.xf < 3 || d.yf < 3) {
              return '#F33';
            } else {
              return '#333'
            }
          } else {
            return '#333';
          }
        })
        .on('click', (event, d) => {
          self.sgb.display_feature(d[self.contig_col], d[self.start_col], d[self.end_col]);
        })
        .on('mouseover', function(event, d) {
          d3.select(this)
            .attr('r', 6)
            .raise();
          self.sgb.default_gene_tooltip_func(event, d);
        })
        .on('mouseout', () => {
          svg.selectAll('.dot')
            .attr('r', 3);
          self.sgb.hide_tooltip();
        });

        if (self.filter_by_strain_count) {
          // add legend for red points
          svg.append('circle')
            .attr('cx', 10)
            .attr('cy', svgHeight - 15)
            .attr('r', 5)
            .attr('fill', '#F33');

          svg.append('text')
            .attr('x', 20)
            .attr('y', svgHeight - 10)
            .style('font-size', '14px')
            .text('Filtered out (insufficient insertions)');
        }

        // Add axis labels
        svg.append("text")
          .attr("x", width / 2)
          .attr("y", height + 30)
          .style("text-anchor", "middle")
          .style("font-size", "14px")
          .text(half_half_plot ? col.name + " (half1)" : col.name);

        /*
        svg.append("text")
          .attr("y", 0)
          .attr("x", -10)
          .attr("dy", "1em")
          .style("text-anchor", "middle")
          .style("font-size", "14px")
          .text(half_half_plot ? col.name + " (half2)" : yAxisColumn);
          */
      }
    }
    updateScatterplot();

    self.sgb.sidebar_content.node().scrollTop = 0;
    self.sgb.show_sidebar(null, 380); // force a 380px sidebar
    show_panel(self.active_sidebar_panel);
  }

  filter_datum(d, column) {
    // filter function to filter by strain count
    if (this.filter_by_strain_count) {
      return d[column+'_num_filtered_insertions'] >= 3;
    }
    return true;
  }

}

async function load_browser(strain, contig, region, focal_col=null) {
  // Loads the genome browser for a given strain
  // Override defaults with any URL params
  const url_params = new URLSearchParams(window.location.search);
  if (url_params.has('contig')) contig = url_params.get('contig');
  if (url_params.has('start') && url_params.has('end')) {
    region = [parseInt(url_params.get('start')), parseInt(url_params.get('end'))];
  }
  if (url_params.has('focal')) focal_col = url_params.get('focal');
  const initial_saved_state = {};
  if (url_params.has('focal')) initial_saved_state.focal = url_params.get('focal');
  if (url_params.has('phages')) initial_saved_state.phages = url_params.get('phages').split(',');

  const b_div = d3.select('#browser_div');
  
  // Show loading spinner
  b_div.html(`
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: rgba(255, 255, 255, 0.9); z-index: 1000;">
      <div style="border: 8px solid #f3f3f3; border-top: 8px solid #3498db; border-radius: 50%; width: 60px; height: 60px; animation: spin 1s linear infinite;"></div>
      <p style="margin-top: 20px; font-size: 16px; color: #666;">Loading browser data...</p>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `);
  
  const dubseq_file = `../data/${strain}/DubSeq.feather`;
  const fna = `../data/${strain}/genome_for_dubseq.fna`;
  const faa = `../data/${strain}/aaseq_for_dubseq`;
  const gene_table_file = `../data/${strain}/genes_w_ecocyc_dubseq_ref.tab`;

  const metadata = await d3.csv('../data/Dubseq_sets.csv');
  let example_time_zeros = {};
  metadata.forEach(d => {
    for (let col of d.time0.split(';')) {
      example_time_zeros[d.phage] = col; // just keep overwriting, any time zero example is good enough
    }
  });
  const assays = metadata.filter(d => d.nickname == strain);
  console.log('Assays for strain', strain, assays);

  const icols = ['locusId', 'sysName', 'scaffoldId', 'begin', 'end', 'strand', 'name', 'desc', 'ecocyc_id'];
  const dubseq_data = await aq.loadArrow(dubseq_file);
  console.log('DubSeq data loaded:', dubseq_data);
  const data_cols = assays.map(d => ({name: d.phage_rep, column: d.set}));
  const phages = Array.from(new Set(assays.map(d => d.phage)));
  const prelim_all_column_config = phages.map(d => ({name: d, column: d, agg_columns: data_cols.filter(dc => dc.name.split(' ')[0] == d), agg_op: 'mean'}));

  const columns_to_start_with = [
    'Bas63',
    'K5',
    'TulB',
    'LZ4',
    'RB49',
    'RB51',
    'Sew11',
    'Bas02',
    'Bas06',
    'EV212',
  ]

  // Clear loading spinner
  b_div.html('');

  const my_browser = new SimpleGenomeBrowser(strain, true, window.innerWidth - 20, b_div, {'fasta_file': fna, 'aa_file': faa, 'starting_contig': contig, 'starting_domain': region, show_strain: false, saved_state: initial_saved_state});

  my_browser.loadingPromise.then(sgb_instance => {
    const gtt = new customGeneTableTrack(sgb_instance, 'Gene Track', {load_threshold: 10000000}, gene_table_file);
    sgb_instance.add_track(gtt);
    const restored_focal = sgb_instance.saved_state.focal ?? focal_col;
    const restored_phages = sgb_instance.saved_state.phages ?? columns_to_start_with;
    const cht = new customHeatmapTrack(sgb_instance, 'DubSeq Data Track', {focal_col: restored_focal, load_threshold: 10000000, current_columns: restored_phages, icols:icols}, prelim_all_column_config, 'scaffoldId', 'begin', 'end', 'locusId', c_scale, dubseq_data);
    cht.filter_by_strain_count = false; // used for RBTnSeq, here we are just showing raw data with caveats
    sgb_instance.add_track(cht);
    
    const subtrack_data = {}
    subtrack_data['count'] = new serverFeatureData(sgb_instance, 'dubseq_count_data', fetch_path, {strain_name: strain, file_type: 'counts'}, {contig_col: 'scaffold'});
    subtrack_data['count'].base_columns = subtrack_data['count'].base_columns.concat([{name: 'barcode', dtype: 'str'}]); // need to fetch for coloring
    subtrack_data['fit'] = new serverFeatureData(sgb_instance, 'dubseq_fit_data', fetch_path, {strain_name: strain, file_type: 'fits'}, {contig_col: 'scaffold'});
    subtrack_data['fit'].base_columns = subtrack_data['fit'].base_columns.concat([{name: 'barcode', dtype: 'str'}]); // need to fetch for coloring
    
    // subtrack stuff
    cht.subtracks = {'count': [], 'fit': []};
    const reset_subtracks = function(which) {
      for (let t of cht.subtracks[which]) {
        t.remove_track();
      }
      delete cht.subtracks[which];
      cht.subtracks[which] = [];
    }
    const load_subtracks = function(which) {
      const col = cht.column_config.filter(c => (c.name==cht.focal_col))[0];
      const cols = col.agg_columns ?? [col.column];

      const scaletype = (which=='count') ? 'symlogcount' : 'linear';
      const whichname = (which=='count') ? 'count' : 'Log2 fold-change';
      reset_subtracks(which);
      for (let c of cols) {
        cht.subtracks[which].push(new serverDubSeqLineTrack(sgb_instance, `Barcode ${whichname}: ${c.name}, ${c.column}`, c.column, {title: '', y_scale_type: scaletype}, 'scaffold', 'begin', 'end', `dubseq_${which}_data`))
      }
      if (which=='count') {
        const t0_ex = example_time_zeros[cols[0].name.split(' ')[0]];
        cht.subtracks[which].push(new serverDubSeqLineTrack(sgb_instance, `Example time zero ${t0_ex}`, t0_ex, {title: '', y_scale_type: scaletype}, 'scaffold', 'begin', 'end', `dubseq_${which}_data`))
      }

      subtrack_data[which].update_data().then(() => {
        subtrack_data[which].loaded = true;
        for (let track of cht.subtracks[which]) {
          track.display_region();
        }
      });
    }
    cht.subtracks_on = {'count': true, 'fit': false};
    cht.count_col_button = cht.add_controls_button('Hide fragment counts for focal column',
      function() {
        if (cht.subtracks_on['count']) {
          cht.count_col_button.text('Show fragment counts for focal column')
          cht.count_col_button.style('background-color', '#ccc'); 
          cht.subtracks_on['count'] = false;
          reset_subtracks('count');
        } else {
          cht.count_col_button.text('Hide fragment counts for focal column')
          cht.count_col_button.style('background-color', '#faa'); 
          cht.subtracks_on['count'] = true;
          load_subtracks('count');
        }
      }
    ).style('background-color', '#faa');
    load_subtracks('count');

    cht.fit_col_button = cht.add_controls_button('Show fragment log2 fold-change for focal column',
      function() {
        if (cht.subtracks_on['fit']) {
          cht.fit_col_button.text('Show fragment log2 fold-change for focal column')
          cht.fit_col_button.style('background-color', '#ccc');
          cht.subtracks_on['fit'] = false;
          reset_subtracks('fit');
        } else {
          cht.fit_col_button.text('Hide fragment log2 fold-change for focal column')
          cht.fit_col_button.style('background-color', '#faa');  
          cht.subtracks_on['fit'] = true;
          load_subtracks('fit');
        }
      }
    );
    
    cht.col_name_click = function(event, col) {
      if (cht.subtracks_on['count']) load_subtracks('count');
      if (cht.subtracks_on['fit']) load_subtracks('fit');
    }

  });
}

export { load_browser };