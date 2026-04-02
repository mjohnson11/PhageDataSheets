// This encompasses the basic display tracks, which do not involve data loading
// They are extended in data_tracks.js and can be extended elsewhere

// Need to refine data_map smartly - needs to be updated when things load... etc. I think I just need to make an "add_track" function
// LOTS OF BUG SQUASHING
// ADDING IN NICE FORGOTTEN FEATURES

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as aq from 'https://cdn.jsdelivr.net/npm/arquero@7.2.0/dist/arquero.min.js/+esm';
import { SimpleGenomeBrowser } from "./SimpleGenomeBrowser.js";
import { measure_text } from "./util.js";
import { nice_logcount_scale } from "./helper_functions.js"

class baseTrack {
  /**
   * Base class for all track types in the Simple Genome Browser.
   * Provides the basic structure for a track, including a div and SVG element,
   * and handles basic region loading logic based on zoom level.
   * This class is extended by specific track implementations.
   *
   * @param {SimpleGenomeBrowser} sgb - The SimpleGenomeBrowser instance this track belongs to.
   * @param {string} name - The name of the track.
   * @param {number} h - The height of the track in pixels.
   * @param {number} top - The top position of the track in pixels, relative to the browser div.
   * 
   * @param {object} [config={}] - An optional configuration object for the track.
   * @param {number} [config.load_threshold=1000000] - The domain width (in base pairs) above which track data will not be automatically loaded,
   *                                                   and a "force load" button will be displayed.
   *
   * @customizable_methods
   * - `load_region()`: Must be overridden by subclasses to implement the specific logic
   *                    for loading and displaying data for the current genomic region.
   * - `filter_by_contig()`: Must be overridden by subclasses to implement track-specific 
   *                         filtering logic when the displayed contig changes.
   */
  constructor(sgb, name, config) {
    const self = this;
    self.sgb = sgb;
    self.name = name;
    
    self.config = config;
    self.title_h = config.title_h ?? 24;
    self.load_threshold = config.load_threshold ?? 1000000;
    self.expanded = true;

    // holding div just has the clickable title to expand / hide tracks
    self.holding_div = self.sgb.inner_div.append('div')
      .attr('class', 'sgb_track_holding_div')
      .style('width', self.sgb.display_w)
      .style('position', 'relative')
      .style('left', -1*self.sgb.w)

    // make a div 20 pixels tall to hold the title and other controls, which
    // should automatically flow left to right
    self.controls_div = self.holding_div.append('div')
      .attr('class', 'sgb_track_controls')
      .style('position', 'relative')
      .style('left', self.sgb.w)
      .style('margin-bottom', 5)
      .style('padding-left', 10)
      .style('display', 'flex')
      .style('align-items', 'left')
      .style('height', self.title_h);
    
    self.div = self.holding_div.append('div')
      .style('position', 'relative')

    self.svg = self.div.append('svg')
      .attr('width', self.sgb.display_w)
      .style('position', 'absolute')
      .style('left', 0)
      .style('top', 0)

    self.g = self.svg.append('g');

    self.force_load_on = false;
    self.currently_force_loading = false;

    self.force_load_div = self.div.append('div')
      .style('position', 'absolute')
      .style('left', 0)
      .style('top', 0)
      .style('width', '100%')
      .style('height', '100%')
      .style('background-color', '#CCC')
      .style('z-index', 10)
      .style('visibility', 'hidden')

    self.force_load_div.append('button')
      // use css to center the button in the div
      .style('position', 'relative')
      .style('left', '0%')
      .style('top', '50%')
      .style('transform', 'translate(-50%, -50%)')
      .html('Click to force load')
      .on('click', () => {
        self.force_load_on = false;
        self.currently_force_loading = true;
        self.force_load_track();
      })

    if (!config.hide_title) {
      self.show_title(self.name);
    }
  }

  update_track_height(new_h) {
    const self = this;
    self.track_h = new_h;
    self.div.style('height', self.track_h);
    self.svg.attr('height', self.track_h);
  }

  show_title(title, fontsize=14) {
    const self = this;
    if (self.title_div) self.title_div.remove();
    self.title_div = self.controls_div.append('div')
      .attr('class', 'track_title')
      .style('top', 0)
      .style('height', self.title_h-6)
      .style('color', 'black')
      .style('padding', 2)
      .style('margin', 1)
      .style('margin-right', 20)
      .style('padding-left', 6)
      .style('padding-right', 6)
      .style('font-size', fontsize+'px')
      .style('text-align', 'center')
      .style('cursor', 'pointer')
      .style('z-index', 11)
      //.style('background-color', '#EEE')   // lighter background
      .style('border-radius', '0')          // no rounded edges
      .style('border-bottom', '1px solid black')
      .text(title)
      .on('mouseover', () => {
        self.title_div.style('opacity', 0.8);
        self.title_div.style('background-color', '#EEE');
      })
      .on('mouseout', () => {
        self.title_div.style('opacity', 1);
        self.title_div.style('background-color', 'transparent');
      })
      .on('click', () => {
        if (self.expanded) {
          self.div.style('display', 'none');
          //self.holding_div.style('height', fontsize*2);
          self.expanded = false;
        } else {
          self.div.style('display', 'block');
          //self.holding_div.style('height', self.track_h);
          self.expanded = true;
          if (self.data.loaded) {
            self.display_region();
          } else {
            self.data.update_data().then(() => {
              self.data.loaded = true;
              self.display_region();
            });
          }
        }
      });
  }

  add_controls_button(text, callback) {
    const self = this;
    return self.controls_div.append('div')
      .attr('class', 'sgb_settings_btn')
      .style('height', self.title_h-6)
      .style('margin', 1)
      .style('margin-right', 20)
      .style('padding', 2)
      .style('padding-left', 6)
      .style('padding-right', 6)
      .style('border-radius', '5px')
      .style('border', '1px solid #777')
      .style('font-size', Math.max(10, self.title_h-10) + 'px')
      .style('text-align', 'center')
      .style('cursor', 'pointer')
      .style('background-color', '#EEE')
      .style('z-index', 11)
      .text(text)
      .on('mouseover', function() { d3.select(this).style('opacity', 0.8); })
      .on('mouseout', function() { d3.select(this).style('opacity', 1); })
      .on('click', (event) => { callback(event); });
  }

  hide_title() {
    self.title_div.style('visibility', 'hidden')
  }

  make_color_legend(color_map, config={}) {
    const self = this;
    const title = config.title || 'Key';
    const left = config.left || self.sgb.w+10;
    const top = config.top || 0;
    const width = config.width || 180;
    const fontsize = config.fontsize || 12;
    const height = config.height || fontsize+4;

    const legend_div = self.controls_div.append('div')
      .attr('class', 'color_legend')
      .style('position', 'absolute')
      .style('background-color', '#CCC')
      .style('border', '1px solid black')
      .style('text-align', 'center')
      .style('z-index', 9);

    const title_element = legend_div.append('h4')
      .text(title)
      .style('font-size', fontsize+'px')
      .style('cursor', 'pointer')
      .style('margin', 2);

    let y_offset = fontsize + 5;
    const legend_items = legend_div.append('div')
      .attr('class', 'legend_items')
      .style('visibility', 'hidden')
      .style('background-color', 'white')
      .style('border', '1px solid black')
      .style('padding-top', 15)
      .style('padding-bottom', 15)
      .style('padding-left', 4)
      .style('padding-right', 4);

    for (const [name, color] of Object.entries(color_map)) {
      const legend_item = legend_items.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('margin-bottom', '2px');

      legend_item.append('div')
        .style('width', '12px')
        .style('height', '12px')
        .style('background-color', color)
        .style('border', '1px solid black')
        .style('margin-right', '5px');

      legend_item.append('span')
        .text(name)
        .style('text-align', 'left')
        .style('font-size', fontsize+'px');
      y_offset += fontsize + 2;
    }

    let expanded = false;
    title_element
      .on('mouseover', () => {
        if (!expanded) {
          legend_items.style('visibility', 'visible');
          title_element.style('opacity', 0.8);
        }
      })
      .on('mouseout', () => {
        if (!expanded) {
          legend_items.style('visibility', 'hidden');
        }
        title_element.style('opacity', 1);
      })
      .on('click', () => {
        expanded = !expanded;
        legend_items.style('visibility', expanded ? 'visible' : 'hidden');
      });
  }

  async force_load_track() {
    // NOTE: this is a function I made to try to make it so
    // we can wait for the track to re-render before hiding the force
    // load button. I originally tried to do it right by chaining promises
    // through the loading and drawing functions, but it didn't work, and
    // I am confused about promises and canvas rendering. So for now we've
    // got this hacky delay.
    const self = this;
    self.load_region();
    await new Promise(resolve => setTimeout(resolve, 50));
    self.force_load_div.style('visibility', 'hidden');
  }

  load_region() {
    throw new Error("load_region() must be implemented by child class");
  }

  display_region() {
    const self = this;
    if ((self.sgb.domain_wid > self.load_threshold) && (!self.currently_force_loading)) {
      if (!self.force_load_on) {
        self.force_load_on = true;
        self.currently_force_loading = false;
        self.force_load_div.style('visibility', 'visible');
      }
    } else {
      self.load_region();
      if (self.force_load_on) {
        self.force_load_on = false;
        self.force_load_div.style('visibility', 'hidden');
      }
    }
  }

  resize() {
    const self = this;
    self.holding_div.style('width', self.sgb.display_w).style('left', -1 * self.sgb.w);
    self.controls_div.style('left', self.sgb.w);
    self.svg.attr('width', self.sgb.display_w);
  }

  remove_track() {
    // remove from data_map
    for (let dn of Object.keys(this.sgb.data_map)) {
      const data_list = this.sgb.data_map[dn];
      const i = data_list.indexOf(this.name);
      if (i > -1) {
        this.sgb.data_map[dn].splice(i, 1);
      }
    }
    delete this.sgb.tracks[this.name] // delete track
    this.holding_div.remove(); // remove from DOM
    // note that this object is not yet deleted and
    // that removing the track does not delete the data object
  }

}

class baseFeatureTrack extends baseTrack {
  /**
   * Extends `baseTrack` to provide a base class for tracks that display feature data.
   * Assumes feature data is an array of objects with attributes for contig, start, end, and id (e.g. locusId)
   * Provides methods for filtering feature data by contig and genomic region.
   * This class is intended to be further extended by specific feature track types.
   */

  constructor(sgb, name, config, contig_column, start_column, end_column, id_column) {
    super(sgb, name, config);
    this.contig_col = contig_column;
    this.start_col = start_column;
    this.end_col = end_column;
    this.id_col = id_column;
  }

  hover_function(e, gene_object) {
    // use default function provided by sgb
    this.sgb.default_gene_tooltip_func(e, gene_object);
  }

  click_function(gene_object) {
    // use default function provided by sgb
    this.sgb.sidebar_div.selectAll('*').remove();
    this.sgb.default_gene_sidebar_func(gene_object);
  }

  load_region() {
    throw new Error("load_region() must be implemented by child class");
  }
}

class geneTrack extends baseFeatureTrack {
  /**
   * Extends `baseFeatureTrack` to specifically display gene features.
   * Provides methods for drawing gene chevrons.
   * This class is extended by specific gene data source track types (e.g., GFF, Genbank).
   *
   * @customizable_methods
   * - `hover_function(e, gene_object)`: Can override to customize what happens when a gene is clicked 
   *                                     (default is to display info in a tooltip)
   * - `click_function(gene_object)`: Can override to customize what happens when a gene is clicked 
   *                                  (default is to display info in the sidebar)
   * - `load_region()`: Can override to implement the data loading and display logic for genes. The default implementation handles basic display of filtered gene data.
   * - `get_feature_stroke(d)`: Can override to customize the stroke color of gene features based on gene data (e.g., different colors for different gene types).
   * - `get_feature_fill(d)`: Can override to customize the fill color of gene features.
   * - `make_gene_display(d)`: Can override to completely customize the SVG elements used to display a gene feature.
   */

  constructor(sgb, name, config, contig_column, start_column, end_column, id_column) {
    super(sgb, name, config, contig_column, start_column, end_column, id_column);
    this.update_track_height(config.track_h ?? 40);
  }

  load_region() {
    const self = this;
    //console.log('Filtered gene data', self.data.filt_data);
    // remove holder g element, then remake
    self.g.remove()
    self.g = self.svg.append('g')
    self.g.on('click', () => console.log('g clicked'))
    self.g.selectAll('.feature_blocks')
      .data(self.data.filt_data)
      .enter()
      .append('g')
        .attr('class', 'sgb_gene')
        .attr('opacity', 0.8)
        .style('cursor', 'default')
        .on('mouseover', (e, d) => {
          self.hover_function(e, d, self);
        })
        .on('mousemove', (e) => self.sgb.move_tooltip(e.pageX, e.pageY))
        .on('mouseout', () => self.sgb.hide_tooltip())
        .html(function(d) { return self.make_gene_display(d); })
        .on('click', (e, d) => {
          console.log('clicked on gene', d.name);
          self.click_function(d);
          e.stopPropagation(); // DOES NOT stop drag from firing (quirk of d3 drag)
        });
  }

  get_feature_stroke(d) {
    // to be replaced in child class for custom coloring
    return 'none';
  }

  get_feature_fill(d) {
    // to be replaced in child class for custom coloring
    return '#333';
  }

  make_gene_display(d) {
    const self = this;
    const [left, right] = self.sgb.get_feature_pixel_position(d[self.start_col], d[self.end_col]);
    const width = right-left;
    const height = Math.max(Math.min(30, 1000000/self.sgb.domain_wid), 20);
    const halfHeight = height / 2;
    const chevron_size = (width < 10) ? 0 : Math.min(width/4, 20);
    const top = 0
    let points = '';
    if (d.strand) {
      if (d.strand === '-') {
        points = `${left},${top+halfHeight} ${left+chevron_size},${top+height} ${left+width},${top+height} ${left+width},${top} ${left+chevron_size},${top}`; 
      } else {
        points = `${right},${top+halfHeight} ${right-chevron_size},${top+height} ${right-width},${top+height} ${right-width},${top} ${right-chevron_size},${top}`;
      }
    } else {
      points = `${right},${top} ${right},${top+height} ${right-width},${top+height} ${right-width},${top}`;
    }

    const stroke = self.get_feature_stroke(d);
    const fill = self.get_feature_fill(d);
    const strokeWid = 1;
    const chev = `<polygon points="${points}" stroke=${stroke} fill=${fill} stroke-width=${strokeWid} />`;

    let label_use = '';
    if (right-left > 20) {
      const fontsizes = [8, 9, 10, 12, 14, 16, 18, 20]
      const textBuf = 2.5
      let label = String(d.name);
      let fontsize = fontsizes[0]
      let labelsize = measure_text(label, fontsize)
      let labelVisible = ((labelsize+2*textBuf+chevron_size) < right-left)
      if (labelVisible) {
        for (let f of fontsizes) {
          labelsize = measure_text(label, f)
          if ((labelsize+2*textBuf+chevron_size) < right-left) {
            fontsize = f
          } else {
            break
          }
        }
      }
      const x_pos = d.strand === '+' ? left+textBuf : left+textBuf+chevron_size;
      const y_pos = top+height-textBuf-2;
      label_use = labelVisible ? `<text x=${x_pos} y=${y_pos} font-size=${fontsize} fill="#FFF">${label}</text>` : '';
    } else {
      label_use = '';
    }

    return chev+label_use;
  }
}

class quantitativeFeatureTrack extends baseFeatureTrack {
  /**
   * Extends `baseFeatureTrack` to display quantitative data associated with genomic features, typically as a heatmap-like track.
   * Uses a canvas element for efficient rendering of a large number of features.
   * Requires data to be loaded in the constructor of extending classes.
   *
   * @param {SimpleGenomeBrowser} sgb - The SimpleGenomeBrowser instance this track belongs to.
   * @param {string} name - The name of the track.
   * @param {object} [config={}] - An optional configuration object for the track.
   * @param {array} display_columns - An array of column names from the data to display as quantitative rows in the heatmap.
   * @param {array} display_names - An array of display names corresponding to `display_columns`, shown as row titles.
   * @param {string} contig_column - The column name in the data that specifies the contig/chromosome ID.
   *
   * @param {object} [config] - Configuration object for the quantitativeFeatureTrack.
   *  Inherits configuration options from `baseFeatureTrack` and `baseTrack`.
   *
   * @customizable_methods
   * MUST CALL set_diverging_colorscale or define get_feature_block_fill
   * - `set_diverging_colorscale(scale)`: Call this method to customize the color scale used for the heatmap.
   *                                     Expects a d3 diverging color scale function.
   * - `get_feature_block_fill(d, column): Provide this method to customize the color with a function that takes as input
   *                                       the feature data object and the column name for this block
   * - `get_feature_block_stroke(d, column): Provide this method to customize the stroke color with a function that takes as input
   *                                       the feature data object and the column name for this block (default is no stroke)
   * - `hover_function(event, column, d)`: Override to customize the actions when a feature block is hovered.
   *                                       Receives the mouse event, the column name being displayed, and the feature data object.
   * - `click_function(event, column, d)`: Override to implement actions when a feature block is clicked.
   *                                       Receives the mouse event, the column name being displayed, and the feature data object.   
   * - `col_name_hover_function(event, d)`: Override to implement actions when a row name (display name) is hovered.
   *                                        Receives the mouse event and the display column name (d).
   * - `col_name_click_function(event, d)`: Override to implement actions when a row name (display name) is clicked.
   *                                        Receives the mouse event and the display column name (d).
   */

  constructor(sgb, name, config, full_column_config, contig_column, start_column, end_column, id_column) {
    super(sgb, name, config, contig_column, start_column, end_column, id_column);
    const self = this;

    // Special case for inputting a simple list of column names
    if (Array.isArray(full_column_config) && (typeof full_column_config[0] === 'string')) {
      self.full_column_config = full_column_config.map(col_name => ({ name: col_name, column: col_name }));
    } else {
      self.full_column_config = full_column_config;
    }
    
    let current_columns = config.current_columns ?? self.full_column_config.map(c => c.name);

    self.column_config = self.full_column_config
      .filter(c => current_columns.includes(c.name))
      .sort((a, b) => current_columns.indexOf(a.name) - current_columns.indexOf(b.name));

    self.focal_col = config.focal_col ?? self.column_config[0].name;
    if (self.sgb.saved_state) self.sgb.saved_state.focal = self.focal_col;

    self.inactive_config = self.full_column_config.filter(c => !current_columns.includes(c.name));

    self.divergingColorScale = d3.scaleDiverging();
    self.svg.style('z-index', 1);

    self.highlightRect = self.svg.append('rect') // single rect for highlighting
      .attr('fill', 'rgba(255, 0, 0, 0.5)')
      .style('visibility', 'hidden');

    self.active_sidebar_panel = config.active_sidebar_panel || 'gene_hits';

    self.svg
      .on('mousemove', (event) => self.handleMousemove(event))
      .on('mouseout', () => self.handleMouseout())
      .on('click', (event) => self.handleClick(event));

    self.reset_display();
        
  }

  reset_display() {
    const self = this;
    self.block_h = self.config.block_height ?? 20;
    self.block_buffer = self.config.block_buffer ?? 1.1;
    self.block_ys = Array.from({ length: self.column_config.length }, (_, i) => self.block_h*self.block_buffer*i);
    self.canvas_h = self.block_h * self.block_buffer * self.column_config.length + 15;
    self.update_track_height(self.canvas_h);

    // Create canvas element outside the SVG, but in the same div
    self.div.select('canvas').remove(); // remove existing canvas if any
    self.canvas = self.div.append('canvas')
      .attr('width', self.sgb.display_w)
      .attr('height', self.canvas_h)
      .style('position', 'absolute')
      .style('left', 0)
      .style('top', 0)
      .style('z-index', 0); 
    self.ctx = self.canvas.node().getContext('2d');

    // div to hold row names
    if (self.row_title_div) self.row_title_div.remove();
    self.row_title_div = self.div.append('div')
      .style('width', '200px')
      .style('position', 'absolute')
      .style('left', self.sgb.w)
      .style('top', 0)
      .style('z-index', 2);

    self.pixelMap = null; // Will store our pre-calculated pixel data.

    self.display_column_names();
  
  }

  set_diverging_colorscale(scale) {
    this.divergingColorScale = scale;
  }

  display_column_names() {
    const self = this;
    self.row_title_div.selectAll('.heatmap_col_name')
      .data(self.column_config)
      .join('div') // Use .join('div') for creating and updating divs
      .attr('class', 'heatmap_col_name')
      .style('position', 'absolute')
      .style('top', (d, i) => `${self.block_ys[i]}px`)
      .style('left', '10px')
      .style('text-align', 'left')
      .style('width', '200px')
      .style('height', `${self.block_h}px`)
      .style('background-color', (d, i) => i % 2 == 0 ? '#DDD' : '#FFF')
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('padding-left', '5px')
      .style('box-sizing', 'border-box') // Important to include padding in the element's total width and height
      .style('cursor', 'pointer')
      .html((d, i) => `<span style="font-size: ${Math.min(self.block_h, 16)}px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%;">${d.name}</span>`)
      .on('mouseover', function (event, d) {
        d3.select(this).style('background-color', '#F88');
        if (self.col_name_hover_function) self.col_name_hover_function(event, d);
      })
      .on('mouseout', function () {
        self.row_title_div.selectAll('.heatmap_col_name').style('background-color', (data, i) => {
          return data.name === self.focal_col ? '#FAA' : i % 2 === 0 ? '#DDD' : '#FFF';
        });
        self.sgb.hide_tooltip();
      })
      .on('click', function(event, d) {
        if (d.name != self.focal_col) {
          self.focal_col = d.name;
          if (self.sgb.saved_state) self.sgb.saved_state.focal = d.name;
          self.row_title_div.selectAll('.heatmap_col_name').style('background-color', (data, i) => {
            return data.name === self.focal_col ? '#FAA' : i % 2 === 0 ? '#DDD' : '#FFF';
          });
        }
        // even if it is a repeat click, call the click func
        if (self.col_name_click_function) self.col_name_click_function(event, d);
        event.stopPropagation();
      });

    console.log(self.column_config);
    // if focal column no longer selected, just use top one
    if (self.column_config.filter((c) => c.name == self.focal_col).length==0) {
      self.focal_col = self.column_config[0].name;
    }
    console.log('focal row set to', self.focal_col);
    // Set initial background color for the focused row
    self.row_title_div.selectAll('.heatmap_col_name').style('background-color', function(d) {
      return d.name === self.focal_col ? '#FAA' : d3.select(this).style('background-color');
    });
  }

  col_name_click_function(event, col) {
    // default function for clicking a row name (see make_summary_sidebar below)
    this.make_summary_sidebar(col);
    // optional additional function to add behavior on click
    if (this.col_name_click) this.col_name_click(event, col);
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

    const sorted = self.data.data
      .params({c: col.column})
      .orderby(aq.desc((d, $) => d[$.c]));

    const topGenes = sorted.slice(0,10).objects().map(row => ({ gene: row, score: row[col.column] }));
    const bottomGenes = sorted.slice(-10).objects().map(row => ({ gene: row, score: row[col.column] }));

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
      .data(['Name', 'Description', 'Score', 'T-value'])
      .enter()
      .append('th')
      .style('padding', '4px')
      .style('border-right', (d, i) => i < 2 ? '1px solid #ddd' : null)
      .style('font-size', '12px')
      .style('width', (d, i) => { // Set column widths
        if (d === 'Name') return '30%';
        if (d === 'Description') return '55%';
        return '15%';
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
      .attr('class', 'panel_content gene_compare_content')
      .style('display', 'none');

    // Select element for y-axis
    const select = compare_contentDiv.append('select')
      .style('margin', '10px');


    let yAxisColumn = self.include_halfs ? col.column : self.column_config[0].column; // Default y-axis column
    select.selectAll('option')
      .data(self.column_config)
      .enter()
      .append('option')
      .text(d => d.name)
      .attr('value', d => d.column);

    select.property('value', yAxisColumn);

    select.on('change', function() {
      yAxisColumn = d3.select(this).property('value');
      updateScatterplot();
    });

    const svgWidth = 340;
    const svgHeight = 250;
    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
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

      const plotData = self.data.data
        .select([xcol, ycol, self.contig_col, self.start_col, self.end_col, self.id_col, 'name', 'desc'])
        .rename({[xcol]: 'x', [ycol]: 'y'})
        .objects();

      // Update scales
      xScale = d3.scaleLinear()
        .domain([d3.min(plotData, d => d.x), d3.max(plotData, d => d.x)])
        .range([0, width]);

      yScale = d3.scaleLinear()
        .domain([d3.min(plotData, d => d.y), d3.max(plotData, d => d.y)])
        .range([height, 0]);

      // Remove existing elements
      svg.selectAll('*').remove();

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
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', 3)
        .attr('fill', '#333')
        .on('click', (event, d) => {
          self.sgb.display_feature(d[self.contig_col], d[self.start_col], d[self.end_col]);
        })
        .on('mouseover', function(event, d) {
          d3.select(this)
            .attr('fill', 'red')
            .raise();
          self.sgb.default_gene_tooltip_func(event, d);
        })
        .on('mouseout', () => {
          svg.selectAll('.dot').attr('fill', '#333')
          self.sgb.hide_tooltip();
        });

        // Add axis labels
        svg.append("text")
          .attr("x", width / 2)
          .attr("y", height + margin.bottom)
          .style("text-anchor", "middle")
          .style("font-size", "14px")
          .text(half_half_plot ? col.name + " (half1)" : col.name);

        svg.append("text")
          .attr("transform", "rotate(-90)")
          .attr("y", 0 - margin.left)
          .attr("x",0 - (height / 2))
          .attr("dy", "1em")
          .style("text-anchor", "middle")
          .style("font-size", "14px")
          .text(half_half_plot ? col.name + " (half2)" : yAxisColumn);
    }
    updateScatterplot();

    self.sgb.sidebar_content.node().scrollTop = 0;
    self.sgb.show_sidebar(null, 380); // force a 380px sidebar
    show_panel(self.active_sidebar_panel);
  }

  load_region() {
    const self = this;
    self.object_data = self.data.filt_data.objects(); // TODO consider arquero...

    //console.log('Filtered heatmap data', self.data.filt_data);
    // Clear the canvas
    self.ctx.clearRect(0, 0, self.sgb.display_w, self.canvas_h);

    // Create pixel map and render canvas in a single loop
    self.pixelMap = Array(self.sgb.display_w).fill(null).map(() => Array(self.canvas_h).fill(null));

    for (let dataIndex = 0; dataIndex < self.object_data.length; dataIndex++) {
      const d = self.object_data[dataIndex];
      const [left, right] = self.sgb.get_feature_pixel_position(d[self.start_col], d[self.end_col]);

      for (let colIndex = 0; colIndex < self.column_config.length; colIndex++) {
        let column = self.column_config[colIndex].column;
        if (d[column] && self.filter_datum(d, column)) {
          const y = self.block_ys[colIndex];
          if (self.get_feature_block_fill) {
            self.ctx.fillStyle = self.get_feature_block_fill(d, column);
          } else {
            self.ctx.fillStyle = self.divergingColorScale(d[column]);
          }
          self.ctx.fillRect(left, y, right - left, self.block_h);
          if (self.get_feature_block_stroke) {
            self.ctx.strokeStyle = self.get_feature_block_stroke(d, column);
            self.ctx.strokeRect(left, y, right - left, self.block_h);
          }
          self.ctx.fillRect(left, y, right - left, self.block_h);
          for (let x = Math.max(0, Math.floor(left)); x < Math.min(self.sgb.display_w, Math.ceil(right)); x++) {
              for (let py = Math.max(0, Math.floor(y)); py < Math.min(self.canvas_h, Math.ceil(y + self.block_h)); py++) {
                self.pixelMap[x][py] = { 'dataIndex': dataIndex, 'colIndex': colIndex };
              }
          }
        }
      }
    }

    // move the canvas with the svg
    self.canvas.style('left', 0);

  }

  filter_datum(d, column) {
    // default filter function, can be replaced in extending classes
    return true;
  }

  resize() {
    super.resize();
    this.canvas.attr('width', this.sgb.display_w);
    this.row_title_div.style('left', this.sgb.w);
  }

  handleMousemove(event) {
    const self = this;
    const mouseX = Math.floor(event.offsetX);
    const mouseY = Math.floor(event.offsetY);

    if (self.pixelMap && mouseX >= 0 && mouseX < self.pixelMap.length && mouseY >= 0 && mouseY < self.pixelMap[0].length) {
      const pixelInfo = self.pixelMap[mouseX][mouseY];

      if (pixelInfo) {
        const d = self.object_data[pixelInfo.dataIndex];
        const [left, right] = self.sgb.get_feature_pixel_position(d[self.start_col], d[self.end_col]);
        const y = self.block_ys[pixelInfo.colIndex];

        self.highlightRect
          .attr('x', left)
          .attr('y', y)
          .attr('width', right - left)
          .attr('height', self.block_h)
          .style('visibility', 'visible');
        const col = self.column_config[pixelInfo.colIndex];
        if (self.hover_function) self.hover_function(event, col, d);

        // keeping track of who was hovered and giving the option of a callback outside the track
        self.hoveredPixelInfo = pixelInfo;
        if (self.callback) self.callback('mouseover', {datum: d, column: col, pixelInfo: pixelInfo, track: self});

        return; // exit early as we found a hit
      }
    }
    // If no hit hide tooltip and highlight
    self.highlightRect.style('visibility', 'hidden');
    self.sgb.hide_tooltip();
  }

  handleMouseout() {
    const self = this;
    this.highlightRect.style('visibility', 'hidden');
    this.sgb.hide_tooltip();
    if (this.callback) this.callback('mouseout', {hoveredPixelInfo: self.hoveredPixelInfo, track: self});
  }

  handleClick(event) {
    const self = this;
    const mouseX = Math.floor(event.offsetX);
    const mouseY = Math.floor(event.offsetY);
    if (self.pixelMap && mouseX >= 0 && mouseX < self.pixelMap.length && mouseY >= 0 && mouseY < self.pixelMap[0].length) {
      const pixelInfo = self.pixelMap[mouseX][mouseY];

      if (pixelInfo) {
        const d = self.object_data[pixelInfo.dataIndex];
        const col = self.column_config[pixelInfo.colIndex];
        if (self.click_function) self.click_function(event, col, d);
        if (self.callback) self.callback('click', {datum: d, column: col, pixelInfo: pixelInfo, track: self});
      }
    }
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
            <p><strong>${column.name}:</strong> ${gene_object[column.column]}</p>
          </div>
        `
      
      self.sgb.tooltip.selectAll('*').remove();
      self.sgb.tooltip.html(html);
      self.sgb.show_tooltip(e.x, e.y)
    }
  }

}

class quantitativeYaxesTrack extends baseTrack {
  /**
   * Base class for tracks displaying quantitative data a single y axis
   * Meant to be defined with a data class already loaded
   * Uses a canvas for rendering and provides methods for handling mouse interactions.
   * Designed to be extended by tracks displaying points or lines representing quantitative values.
   * Abstract class - `getData` and `drawData` methods must be implemented by subclasses.
   *
   * @param {SimpleGenomeBrowser} sgb - The SimpleGenomeBrowser instance this track belongs to.
   * @param {string} name - The name of the track.
   * @param {number} h - The height of the track in pixels.
   * @param {number} top - The top position of the track in pixels.
   * @param {object} [config={}] - An optional configuration object for the track.
   *
   * @param {object} [config] - Configuration object for the quantitativeYaxesTrack.
   * @param {number[]} [config.yticks=[0.1, 1, 10, 100, 1000]] - Array of y-axis tick values.
   * @param {function} [config.ytick_formatter=(d => d)] - Function to format y-axis tick labels.
   * @param {boolean} [config.clip=false] - If true, clip values to the y-axis range.
   * @param {boolean} [config.log_y=false] - If true, use a logarithmic y-axis scale.
   *  Inherits configuration options from `baseTrack`.
   *
   * @customizable_methods
   * - `getData(low, high, contig)`: **Must be overridden.**  Implement data fetching for the given genomic region (`low`, `high`, `contig`).
   *                                Should return a Promise that resolves to the data to be displayed.
   * - `drawData(data, yScales)`: **Must be overridden.** Implement the canvas drawing logic for the track, using the loaded `data` and the provided `yScales` (d3 scales for each quantitative column).
   * - `highlight_function(event, pixelInfo)`: Define to customize what to *draw* when an element is hovered
   *                                           (typically defined in child classes to show overlay svgelement)
   * - `hover_function(event, pixelInfo)`: Define to customize what to do when an element is hovered
   *                                       pixelInfo is defined in the pixelMap of the child element, but typically has
   *                                       a data attribute and some info about the element's position
   * - `click_function(event, pixelInfo)`: Define to customize what to do when an element is clicked
   *                                       pixelInfo is defined in the pixelMap of the child element, but typically has
   *                                       a data attribute and some info about the element's position
   */

  constructor(sgb, name, column, config, contig_column) {
    super(sgb, name, config);
    const self = this;
    self.contig_col = contig_column;
    self.column = column;
    self.config = config;
    self.title = config.title ?? self.column;
    self.load_threshold = config.load_threshold ?? 1000000;
    self.yticks = config.yticks ?? 'infer';
    self.ydomain = config.ydomain ?? 'infer';
    if (self.ydomain != 'infer') self.use_domain = self.ydomain;
    if (self.yticks != 'infer') self.use_yticks = self.yticks;
    self.ytick_formatter = config.ytick_formatter ?? null;
    self.y_scale_type = config.y_scale_type ?? 'linear';
    self.clip = config.clip ?? false;
    self.n_yticks = config.n_yticks ?? 5;
    self.h = config.h ?? 100;
    self.update_track_height(self.h+self.title_h);
    self.h_buf = config.h_buf ?? 0.1;
    self.left_buf = config.left_buf ?? 60;

    const fraction_buf = self.h_buf*self.h;
    self.yrange = [self.h - fraction_buf, fraction_buf];
    self.base_scale = (self.y_scale_type=='symlogcount') ? d3.scaleSymlog() : (self.y_scale_type=='log') ? d3.scaleLog() : d3.scaleLinear();
    if (self.ydomain != 'infer') {
      self.yscale = (self.clip) ? self.base_scale.range(self.yrange).clamp(true).domain(self.use_domain) : self.base_scale.range(self.yrange).domain(self.use_domain).nice();
      self.svg.selectAll('.yline')
        .data(self.yticks)
        .enter()
        .append('line')
          .attr('class', 'yline')
          .attr('x1', 0)
          .attr('x2', self.sgb.display_w)
          .attr('y1', d => self.yscale(d))
          .attr('y2', d => self.yscale(d))
          .attr('stroke', 'black')
          .attr('stroke-width', d => (d == self.yticks[0] || d == self.yticks[self.yticks.length-1]) ? 1 : 0.25)

      const yAxis = d3.axisLeft(self.yscale)
        .tickValues(self.yticks)
        .tickSize(0)
        
      if (self.tick_formatter) yAxis.tickFormat(self.tick_formatter);

      self.axis_elements = self.svg.append('g');

      // hacky background for tick labels
      self.axis_elements.append('rect')
        .attr('x', self.sgb.w)
        .attr('width', self.left_buf)
        .attr('y', 0)
        .attr('height', self.h)
        .attr('fill', 'white')
  
      self.axis_elements.append('g')
        .attr('class', 'yaxis')
        .attr("transform", `translate(${self.sgb.w+self.left_buf},0)`)
        .call(yAxis);
              
      if (self.title) {
        self.axis_elements.append('text')
          .attr('class', 'countPlotTitle')
          .attr("y", self.yscale(self.yticks[self.yticks.length-1])-5)
          .attr("x", self.sgb.display_w/2)
          .html(self.title);
      }
    }

    self.canvas_div = self.div.append('div')
      .attr('id', 'canvasdiv')
      .style('z-index', 0);

    self.svg.style('z-index', 1);

    self.canvas = self.canvas_div.append('canvas')
      .attr('width', self.sgb.display_w)
      .attr('height', self.h)
      .style('position', 'absolute')
      .style('left', 0)
      .style('top', 0);

    self.ctx = self.canvas.node().getContext('2d');

    self.pixelMap = null;

    self.svg
      .on('mousemove', (event) => self.handleMousemove(event))
      .on('mouseout', () => self.handleMouseout())
      .on('click', (event) => self.handleClick(event));
  }

  resize() {
    super.resize();
    this.canvas.attr('width', this.sgb.display_w);
    // Update y-axis lines to span new width
    this.svg.selectAll('.yline').attr('x2', this.sgb.display_w);
    // Update axis elements if they exist
    if (this.axis_elements) {
      this.axis_elements.select('rect')
        .attr('x', this.sgb.w)
        .attr('width', this.left_buf);
      this.axis_elements.select('.yaxis')
        .attr('transform', `translate(${this.sgb.w + this.left_buf},0)`);
      this.axis_elements.select('.countPlotTitle')
        .attr('x', this.sgb.display_w / 2);
    }
  }

  async load_region() {
    const self = this;
    // Making a duplicate canvas to draw on and then deleting the
    // old one at the end
    const old_canvas = self.canvas;
    self.canvas = self.canvas_div.append('canvas')
      .attr('width', self.sgb.display_w)
      .attr('height', self.h)
      .style('position', 'absolute')
      .style('left', 0)
      .style('top', 0);

    self.ctx = self.canvas.node().getContext('2d');
    self.ctx.clearRect(0, 0, self.sgb.display_w, self.h);
    self.pixelMap = Array(self.sgb.display_w).fill(null).map(() => Array(self.h).fill(null));
    
    old_canvas.remove();
    
    if (self.ydomain == 'infer') {
      self.use_domain = d3.extent(self.data.filt_data.map((r)=>r[self.column]));
      if (self.use_domain[0] == self.use_domain[1]) self.use_domain = [0, 1]; // avoid zero domain
      self.yscale = (self.clip) ? self.base_scale.range(self.yrange).clamp(true).domain(self.use_domain).nice() : self.base_scale.range(self.yrange).domain(self.use_domain).nice();
      self.yticks = (self.y_scale_type == 'linear') ? self.yscale.ticks(4) : self.yscale.ticks();
      // set default ticks
      self.yAxis = d3.axisLeft(self.yscale)
        .tickValues(self.yticks)
        .tickSize(5)

      // if log scale, customize ticks
      if (self.y_scale_type != 'linear') {
        self.ytick_lines = nice_logcount_scale(self.yAxis, self.yscale)
      } else {
        self.ytick_lines = self.yticks;
      }
      
      self.svg.selectAll('.yline').remove();
      self.svg.selectAll('.yline')
        .data(self.ytick_lines)
        .enter()
        .append('line')
          .attr('class', 'yline')
          .attr('x1', 0)
          .attr('x2', self.sgb.display_w)
          .attr('y1', d => self.yscale(d))
          .attr('y2', d => self.yscale(d))
          .attr('stroke', 'black')
          .attr('stroke-width', d => (d == self.ytick_lines[0]) ? 1 : 0.25); //(d == self.yticks[0] || d == self.yticks[self.yticks.length-1]) ? 1 : 0.25);

      if (self.axis_elements) self.axis_elements.remove();
      self.axis_elements = self.svg.append('g');
      // hacky background for tick labels
      self.axis_elements.append('rect')
        .attr('x', self.sgb.w)
        .attr('width', self.left_buf)
        .attr('y', 0)
        .attr('height', self.h)
        .attr('fill', 'white')
      
      if (self.tick_formatter) self.yAxis.tickFormat(self.tick_formatter);
  
      self.axis_elements.append('g')
        .attr('class', 'yaxis')
        .attr("transform", `translate(${self.sgb.w+self.left_buf},0)`)
        .call(self.yAxis);
              
      self.axis_elements.append('text')
        .attr('class', 'countPlotTitle')
        .attr("y", self.yscale(self.yticks[self.yticks.length-1])-5)
        .attr("x", self.sgb.display_w/2)
        .html(self.title);
    }

    self.drawData();

  }
    
  handleMouseout() {
    if (this.mouseout_function) this.mouseout_function();
  }

  handleClick(event) {
    const self = this;
    const mouseX = Math.floor(event.offsetX);
    const mouseY = Math.floor(event.offsetY);
    if (self.pixelMap && mouseX >= 0 && mouseX < self.pixelMap.length && mouseY >= 0 && mouseY < self.pixelMap[0].length) {
      const pixelInfo = self.pixelMap[mouseX][mouseY];
      if (pixelInfo) {
        console.log('Clicked on:', pixelInfo);
        if (self.click_function) self.click_function(event, pixelInfo);
      }
    }
  }

  handleMousemove(event) {
    const self = this;
    const mouseX = Math.floor(event.offsetX);
    const mouseY = Math.floor(event.offsetY);
    if (self.pixelMap && mouseX >= 0 && mouseX < self.pixelMap.length && mouseY >= 0 && mouseY < self.pixelMap[0].length) {
      const pixelInfo = self.pixelMap[mouseX][mouseY];
      if (pixelInfo) {
        if (self.hover_function) self.hover_function(event, pixelInfo);
        if (self.highlight_function) self.highlight_function(event, pixelInfo);
      } else {
        self.handleMouseout();
      }
    } else {
      self.handleMouseout();
    }
  }

  async drawData(data){
    throw new Error("drawData() must be implemented by child class");
  }

  async getData(low, high, contig){
    throw new Error("getData() must be implemented by child class");
  }

}

class quantitativePointTrack extends quantitativeYaxesTrack {
  /**
   * Extends `quantitativeYaxisTrack` to display quantitative data as points on a canvas.
   * Suitable for tracks showing scatter plot-like data along the genome.
   *
   * @param {SimpleGenomeBrowser} sgb - The SimpleGenomeBrowser instance this track belongs to.
   * @param {string} name - The name of the track.
   * @param {number} h - The height of the track in pixels.
   * @param {number} top - The top position of the track in pixels.
   * @param {object} [config={}] - An optional configuration object for the track.
   * @param {string} contig_col - The column name in the data specifying the contig/chromosome ID.
   * @param {string} pos_column - The column name in the data specifying the genomic position of the point.
   *
   * @param {object} [config] - Configuration object for the quantitativePointTrack.
   *  Inherits configuration options from `quantitativeYaxisTrack` and `baseTrack`.
   *
   * @customizable_methods
   * - `drawData(data, yScales)`: Override to customize how points are rendered on the canvas. The default implementation draws circles.
   * - `getData(low, high, contig)`: **Must be overridden.** Implement data fetching for point data.
   * - `highlight_function(event, pixelInfo)`: Override to customize what to *draw* when an element is hovered
   * - `hover_function(event, pixelInfo)`: Override to customize what to do when an element is hovered
   *                                       pixelInfo is defined in the pixelMap of the child element, but typically has
   *                                       a data attribute and some info about the element's position
   * - `click_function(event, pixelInfo)`: Define to customize what to do when an element is clicked
   *                                       pixelInfo is defined in the pixelMap of the child element, but typically has
   *                                       a data attribute and some info about the element's position
   */
  constructor(sgb, name, column, config, contig_column, pos_column) {
    super(sgb, name, column, config, contig_column);
    this.pos_col = pos_column;
    this.pointRadius = config.pointRadius ?? 2;
    this.highlight_element = this.svg.append('circle')
      .attr('r', this.pointRadius * 3)
      .attr('fill', 'red')
      .style('visibility', 'hidden');

  }

  drawData() {
    const self = this;
    self.data.filt_data.forEach(d => {
      const x = self.sgb.get_coordinate_pixel_position(d[self.pos_col]);
      if (x >= 0 && x <= self.sgb.display_w) {
        const y = self.yscale(d[self.column]);
        self.ctx.fillStyle = (self.color_func) ? self.color_func(d, self.column) : "black";
        self.ctx.beginPath();
        self.ctx.arc(x, y, self.pointRadius, 0, 2 * Math.PI);
        self.ctx.fill();
        // Add to pixel map
        for (let px = Math.max(0, Math.floor(x - self.pointRadius)); px <= Math.min(self.sgb.display_w - 1, Math.ceil(x + self.pointRadius)); px++) {
          for (let py = Math.max(0, Math.floor(y - self.pointRadius)); py <= Math.min(self.h - 1, Math.ceil(y + self.pointRadius)); py++) {
            self.pixelMap[px][py] = { data: d, column: self.column};
          }
        }
      }
    })
  }

  highlight_function(event, pixelInfo) {
    const d = pixelInfo.data;
    for (let track of Object.values(this.sgb.data_map[this.data.name]).map(track_name => this.sgb.tracks[track_name])) {
      track.highlight_datum(d);
    }
  }

  highlight_datum(d) {
    const self = this;
    this.highlight_element
      .style('visibility', 'visible')
      .attr('cx', self.sgb.get_coordinate_pixel_position(d[self.pos_col]))
      .attr('cy', self.yscale(d[self.column]));
  }

  mouseout_function() {
    this.sgb.hide_tooltip();
    for (let track of Object.values(this.sgb.data_map[this.data.name]).map(track_name => this.sgb.tracks[track_name])) {
      track.highlight_element.style('visibility', 'hidden');
    }
  }

  hover_function(event, pixelInfo) {
    const d = pixelInfo.data;
    const column = pixelInfo.column;
    this.sgb.tooltip.selectAll('*').remove();
    this.sgb.tooltip.html(`${d[this.pos_col]}: ${column} = ${d[column]}`);
    this.sgb.show_tooltip(event.pageX, event.pageY);
  }

}

class quantitativeLineTrack extends quantitativeYaxesTrack {
  /**
   * Extends `quantitativeYaxisTrack` to display quantitative data as horizontal lines on a canvas.
   * Suitable for tracks showing DNA fragment scores or similar range-based quantitative data.
   *
   * @param {SimpleGenomeBrowser} sgb - The SimpleGenomeBrowser instance this track belongs to.
   * @param {string} name - The name of the track.
   * @param {number} h - The height of the track in pixels.
   * @param {number} top - The top position of the track in pixels.
   * @param {object} [config={}] - An optional configuration object for the track.
   * @param {string} contig_col - The column name in the data specifying the contig/chromosome ID.
   * @param {string} start_column - The column name in the data specifying the start genomic position of the line.
   * @param {string} end_column - The column name in the data specifying the end genomic position of the line.
   *
   * @param {object} [config] - Configuration object for the quantitativeLineTrack.
   *  Inherits configuration options from `quantitativeYaxisTrack` and `baseTrack`.
   *
   * @customizable_methods
   * - `drawData(data)`: Override to customize how lines are rendered on the canvas. The default implementation draws horizontal lines.
   * - `getData(low, high, contig)`: **Must be overridden.** Implement data fetching for line data.
   * - `highlight_function(event, pixelInfo)`: Override to customize what to *draw* when an element is hovered
   * - `hover_function(event, pixelInfo)`: Override to customize what to do when an element is hovered
   *                                       pixelInfo is defined in the pixelMap of the child element, but typically has
   *                                       a data attribute and some info about the element's position
   * - `click_function(event, pixelInfo)`: Define to customize what to do when an element is clicked
   *                                       pixelInfo is defined in the pixelMap of the child element, but typically has
   *                                       a data attribute and some info about the element's position
   */
  constructor(sgb, name, column, config, contig_column, start_column, end_column) {
    super(sgb, name, column, config, contig_column)
    this.start_col = start_column;
    this.end_col = end_column;
    this.lineWidth = config.lineWidth ?? 2;

    this.highlight_element = this.svg.append('line') // single line for highlighting
      .attr('stroke', 'red')
      .attr('stroke-width', this.lineWidth * 2) 
      .style('visibility', 'hidden');
  }

  drawData(){
    const self = this;
    self.data.filt_data.forEach((d) => {
      const [x1, x2] = self.sgb.get_feature_pixel_position(d[self.start_col], d[self.end_col]);
      //const x2 = self.sgb.get_coordinate_pixel_position(d[self.end_col]);
      //console.log(d[self.start_col], d[self.end_col], x1, x2, self.sgb.display_w);
      // Only draw the line if *any* part of it is visible
      if ((x1 <= self.sgb.display_w && x1 >= 0) 
            || (x2 <= self.sgb.display_w && x2 >= 0) 
            || (x1 < 0 && x2 > self.sgb.display_w)
          ){
        //console.log(x1, x2, self.sgb.display_w);
        const y = self.yscale(d[self.column]);
        self.ctx.strokeStyle = (self.color_func) ? self.color_func(d, self.column) : "black";
        self.ctx.lineWidth = self.lineWidth;
        self.ctx.beginPath();
        self.ctx.moveTo(Math.max(0, x1), y);
        self.ctx.lineTo(Math.min(self.sgb.display_w,x2), y);
        self.ctx.stroke();
        // Add to pixel map (highlight entire line segment)
        const startX = Math.max(0,Math.min(x1,x2));
        const endX = Math.min(self.sgb.display_w, Math.max(x1,x2));
        for (let px = Math.max(Math.floor(startX), 0); px <= Math.min(Math.ceil(endX), self.sgb.display_w-1); px++) {
          // Adding some padding above and below for the line
          for(let py = Math.max(0, Math.floor(y - self.lineWidth)); py <= Math.min(self.h -1, Math.ceil(y+self.lineWidth)); py++) {
            try {
              self.pixelMap[px][py] = { data: d, column: self.column};
            } catch (error) {
              console.log('Error adding to pixel map', px, py, self.pixelMap.length, self.pixelMap[0].length);
            }    
          }
        }
      }
    });
  }

  highlight_function(event, pixelInfo) {
    const self = this;
    const d = pixelInfo.data;
    for (let track of Object.values(this.sgb.data_map[this.data.name]).map(track_name => this.sgb.tracks[track_name])) {
      track.highlight_datum(d);
    }
  }

  highlight_datum(d) {
    const self = this;
    const [x1, x2] = self.sgb.get_feature_pixel_position(d[self.start_col], d[self.end_col]);
    const y = self.yscale(d[self.column]);
    this.highlight_element
      .style('visibility', 'visible')
      .attr('x1', x1)
      .attr('x2', x2)
      .attr('y1', y)
      .attr('y2', y);
  }

  mouseout_function() {
    this.sgb.hide_tooltip();
    for (let track of Object.values(this.sgb.data_map[this.data.name]).map(track_name => this.sgb.tracks[track_name])) {
      track.highlight_element.style('visibility', 'hidden');
    }
  }

  hover_function(event, pixelInfo) {
    const d = pixelInfo.data;
    const column = pixelInfo.column;
    this.sgb.tooltip.selectAll('*').remove();
    this.sgb.tooltip.html(`${d[this.start_col]}-${d[this.end_col]}: ${column} = ${d[column]}`);
    this.sgb.show_tooltip(event.pageX, event.pageY);
  }

}

export { baseFeatureTrack, geneTrack, quantitativeFeatureTrack, quantitativeYaxesTrack, quantitativePointTrack, quantitativeLineTrack };