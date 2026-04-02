import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import autoComplete from 'https://cdn.jsdelivr.net/npm/@tarekraafat/autocomplete.js@10.2.7/dist/autoComplete.min.js/+esm'; 
import { fetch_server_data, parse_fasta, measure_text, reverse_complement, copy_sequence } from "./util.js";


class SimpleGenomeBrowser {
  /**
   * A class for creating a simple interactive genome browser in a specified div.
   * It handles the overall layout, data loading, navigation, and display of tracks.
   *
   * @param {string} orgId - The organism ID or name to display in the browser title.
   * @param {boolean} circular - Whether the genome is circular. If true, enables circular navigation.
   * @param {number} w - The width of the browser in pixels.
   * @param {number} h - The height of the browser in pixels.
   * @param {d3.Selection} div - The d3 selection of the div element to append the browser to.
   * 
   * @param {object} [config={}] - An optional configuration object.
   * @param {string} [config.starting_contig] - The contig to initially display. Defaults to the first contig in the loaded data.
   * @param {array} [config.starting_domain] - The genomic domain (start and end coordinates) to initially display. Defaults to a region in the first contig.
   * @param {boolean} [config.fastdrag=true] -  If true, enables 'fast drag' behavior, pre-rendering a wider area for smoother dragging. Defaults to true.
   * @param {string} [config.fasta_file] - Path to a FASTA file to load genome sequence data from.
   * @param {string} [config.aa_file] - Path to a FASTA file to load amino acid sequence data from (optional).
   * @param {array} [config.genbank_json] - Array of Genbank JSON objects to load genome and feature data from.
   *
   */
  constructor(orgId, circular, w, div, config = {}) {

    // Core data holder
    this.data = {};
    this.data_map = {}; // maps from named datasets to tracks

    // Required arguments
    this.orgId = orgId;
    this.circular = circular;
    this.w = w;
    this.original_w = w; // stored for sidebar resize
    this.div = div;
    this.config = config;
    this.show_strain = config.show_strain ?? true;

    // Optional arguments
    this.starting_contig = this.config.starting_contig ?? null;
    this.starting_domain = this.config.starting_domain ?? null;

    // layout 
    this.layout = this.config.layout ?? {
      'top': 10,
      'controls_h': 125,
      'x_buf': 40,
      'contig_axis_top': 35,
      'contig_zoom_bar_top': 35,
      'view_zoom_bar_top': 80,
      'track_axis_top': 80,
      'sidebar_w': 380,
      'outer_button_h': 30
    }
    this.layout.x_range = [this.layout.x_buf, w-this.layout.x_buf];
    this.midpoint = w / 2;
    this.display_w = w * 3;
    this.display_left = -1 * w;
    
    // Some variables / defaults
    this.tracks = {};
    this.seqs = {};
    this.seq_lens = {};
    this.sidebar_expanded = false;

    if (config.fasta_file) {
      const loadPromises = [fetch(config.fasta_file).then(response => response.text())];
  
      if (config.aa_file) {
        loadPromises.push(fetch(config.aa_file).then(response => response.text()));
      }
      this.loadingPromise = Promise.all(loadPromises)
        .then((responses) => {
          const fastaData = responses[0];
          const aaData = responses.length > 1 ? responses[1] : null;
          this.seqs = parse_fasta(fastaData);
          console.log(Object.keys(this.seqs));
          this.aa_seqs = aaData ? parse_fasta(aaData) : {};
          this.setup_browser();
          return this
        });
    } else if (config.genbank_json) {
      this.loadingPromise = new Promise((resolve) => {
        this.seqs = {};
        this.aa_seqs = {};
        config.genbank_json.forEach(genbank_rec => {
          this.seqs[genbank_rec.name] = genbank_rec.sequence;
          for (let feature of genbank_rec.features) {
            if (feature.type == 'CDS') {
              if (feature.notes.translation){
                this.aa_seqs[feature.notes.locus_tag[0]] = feature.notes.translation[0];
              }
            }
          }
        });
        console.log(this.seqs)
        this.setup_browser();
        resolve(this);
      });
    }
  }

  setup_browser() {
    // to be called after data is loaded
    this.seq_lens = Object.fromEntries(Object.entries(this.seqs).map(([k, v]) => [k, v.length]));
    if (!(this.starting_contig in this.seqs)) {
      this.starting_contig = Object.keys(this.seqs)[0];
      this.starting_domain = this.starting_domain || [
        Math.floor(this.seq_lens[this.starting_contig] / 4),
        Math.floor(5 * this.seq_lens[this.starting_contig] / 16),
      ];
    }
    this.build_basic_browser();
    this.setup_tooltip();
    this.setup_sidebar();
    if (this.config.sidebar_to_start) this.show_sidebar();
  }

  // making the browser

  build_basic_browser() {
    const self = this;

    self.sgb_outer_buttons = self.div.append('div')
      .attr('class', 'sgb_controls_container')
      .style('position', 'relative')
      .style('width', self.w)
      .style('margin', 5)
      .style('z-index', 20)
      .style('display', 'flex')
      .style('justify-content', 'space-around')

    self.sgb_outer_div = self.div.append('div')
      .style('position', 'relative')

    self.outer_div = self.sgb_outer_div.append('div')
      .attr('class', 'sgb_outer_div')
      .style('left', 0)
      .style('top', 0)
      .style('width', self.w)
      .style('position', 'absolute')

    self.inner_div = self.outer_div.append('div')
      .attr('class', 'sgb_inner_div')
      .style('left', 0)
      .style('top', self.layout.controls_h)
      .style('width', self.w)
      .style('position', 'absolute')
      .style('overflow-x', 'hidden')

    self.contig = self.starting_contig;
    self.contig_len = self.seq_lens[self.contig];

    self.set_domain(self.starting_domain);
    self.saved_state = self.config.saved_state ?? {};
    self.setup_drag();
    self.make_contig_picker();
    this.make_search_bar();
    self.make_controls();
    self.display_region();
  }

  make_controls() {
    const self = this;

    self.icon_r = 10;
    self.icon_spacing = 20;

    self.copy_link_btn = self.sgb_outer_buttons.append('button')
      .style('position', 'relative')
      .style('width', Math.min(self.original_w/6, 300))
      .style('font-size', '16px')
      .html('Copy Link to Current View')
      .on('click', function() {
        const url = self.get_share_url();
        navigator.clipboard.writeText(url).then(() => {
          const btn = d3.select(this);
          btn.html('Copied!');
          setTimeout(() => btn.html('Copy Link to Current View'), 2000);
        });
      });

    self.copy_dna_btn = self.sgb_outer_buttons.append('button')
      .style('position', 'relative')
      .style('width', Math.min(self.original_w/6, 300))
      .style('font-size', '16px')
      .html('Copy DNA Sequence of Region')
      .on('click', function() {
        // handle circular case
        const circ_domain = self.domain.map(self.circular_coordinate);
        if (self.circular && (circ_domain[1] < circ_domain[0])) {
          copy_sequence(self.seqs[self.contig].slice(self.domain[0]-1)+self.seqs[self.contig].slice(0,self.domain[1]), this)
        } else {
          copy_sequence(self.seqs[self.contig].slice(self.domain[0]-1, self.domain[1]), this)
        }
      })

    if (self.show_strain) {
      self.outer_div.append('h1')
        .style('position', 'absolute')
        .style('left', 20)
        .style('top', 0)
        .style('margin', 0)
        .html(self.orgId);
    }

    self.controls_svg = self.outer_div.append('svg')
      .attr('width', self.w)
      .attr('height', self.layout.controls_h);

    self.zoom_in_g = self.controls_svg.append('g')
      .attr('class', 'zoom_thing')
      .on('click', function() {
        self.display_region(self.zoom_in());
      });
    self.zoom_out_g = self.controls_svg.append('g')
      .attr('class', 'zoom_thing')
      .on('click', function() {
        self.display_region(self.zoom_out());
      });

    d3.selectAll('.zoom_thing:hover').style('opacity', 0.5);
    self.zoom_in_g.append('circle')
      .attr('cx', self.midpoint + self.icon_spacing)
      .attr('cy', self.layout.top + self.icon_r/2)
      .attr('r', self.icon_r)
      .attr('stroke', '#333')
      .attr('fill', '#CCC');
    self.zoom_in_g.append('line')
      .attr('x1', self.midpoint + self.icon_spacing - self.icon_r/2)
      .attr('x2', self.midpoint + self.icon_spacing + self.icon_r/2)
      .attr('y1', self.layout.top + self.icon_r/2)
      .attr('y2', self.layout.top + self.icon_r/2)
      .attr('stroke', '#333');
    self.zoom_in_g.append('line')
      .attr('x1', self.midpoint + self.icon_spacing)
      .attr('x2', self.midpoint + self.icon_spacing)
      .attr('y1', self.layout.top)
      .attr('y2', self.layout.top + self.icon_r/2 + self.icon_r/2)
      .attr('stroke', '#333');
    self.zoom_out_g.append('circle')
      .attr('cx', self.midpoint - self.icon_spacing)
      .attr('cy', self.layout.top + self.icon_r/2)
      .attr('r', self.icon_r)
      .attr('stroke', '#333')
      .attr('fill', '#CCC');
    self.zoom_out_g.append('line')
      .attr('x1', self.midpoint - self.icon_spacing - self.icon_r/2)
      .attr('x2', self.midpoint - self.icon_spacing + self.icon_r/2)
      .attr('y1', self.layout.top + self.icon_r/2)
      .attr('y2', self.layout.top + self.icon_r/2)
      .attr('stroke', '#333');

    self.x_scale = d3.scaleLinear().range(self.layout.x_range).domain(self.domain);
    self.x_axis = d3.axisTop(self.x_scale)
      .ticks(6)
      .tickFormat(self.circular_coordinate);
    self.x_ax_element = self.controls_svg.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0, ${self.layout.top + self.layout.track_axis_top})`)
      .call(self.x_axis);

    this.setup_full_contig_zoom_bar();
    this.setup_view_zoom_bar();
  }

  make_contig_picker() {
    const self = this;
    self.contig_picker = self.sgb_outer_buttons.append('select')
      .attr('id', "contig_picker")
      .style("width", "170px")
      .style("height", "25px")
      .style("outline", "none")
      .style("border", "none")
      .style("background-color", "#FFF")
      .style('font-size', '18px')
      .style("color", "#333")
      .on('focus', function () { d3.select(this).style('color', '#333')})
      .on('blur', function() { d3.select(this).style('color', '#333')})
      .property('value', self.contig)
      .on('change', function() { self.new_contig(d3.select(this).property("value"))});
  
      self.contig_picker.selectAll("option")
        .data(Object.keys(self.seq_lens))
        .enter()
        .append("option")
        .text(d => 'Contig: ' + d)
        .attr("value", d => d);
  }

  make_search_bar() {
    const self = this;
    self.search_div = self.sgb_outer_buttons.append('div')
      .attr('id', 'search_div')

    self.gene_search = self.search_div.append('input')
      .attr('id', 'main_searchbar')
      .attr('type', 'search')
      .attr('spellcheck', 'false')
      .attr('autocomplete', 'off')
      .style('width', Math.min(self.original_w/6, 300))
      .style('height', 25)
      .style('font-size', 18)
      .on('focus', function () { d3.select(this).style('color', '#333')})
      .on('blur', function() { d3.select(this).style('color', '#333')});
  
    self.search_dict = {};
    //console.log(help(autoCompleteJS));
    self.autoCompleteEl = new autoComplete({
        placeHolder: "Search for gene names...",
        selector: '#main_searchbar',
        data: {src: []},
        events: {
            input: {
                selection: (event) => {
                    const selection = event.detail.selection.value;
                    self.autoCompleteEl.input.value = '';
                    const search_result = self.search_dict[selection.split(' ')[0]];
                    self.display_feature(search_result.contig, search_result.start, search_result.end);
                    if (search_result.track.click_function) search_result.track.click_function(search_result.datum);
                    document.getElementById('main_searchbar').blur(); //removes focus so the cursor leaves
                }
            }
        }
    });
    
  }

  setup_full_contig_zoom_bar() {
    const self = this;
    const bar_height = 20;
    const bar_y_offset = self.layout.top + self.layout.contig_zoom_bar_top;

    self.full_contig_zoom_g = self.controls_svg.append('g')
      .attr('class', 'full_contig_zoom_bar');

    self.full_contig_x_scale = d3.scaleLinear().range(self.layout.x_range).domain([0, self.contig_len]);
    self.full_contig_axis = d3.axisTop(self.full_contig_x_scale)
      .tickSize(5)
      .ticks(5);
    self.full_contig_axis_element = self.full_contig_zoom_g.append('g')
      .attr('class', 'x_axis')
      .attr('transform', `translate(0, ${self.layout.top + self.layout.contig_axis_top})`)
      .call(self.full_contig_axis);

    self.full_contig_zoom_rects_g = self.full_contig_zoom_g.append('g');
    self.full_contig_bg_rect = self.full_contig_zoom_rects_g.append('rect')
      .attr('x', self.layout.x_range[0])
      .attr('y', bar_y_offset)
      .attr('width', self.layout.x_range[1] - self.layout.x_range[0])
      .attr('height', bar_height)
      .attr('fill', '#eee')
      .attr('stroke', 'black');

    self.full_contig_highlight_rect = self.full_contig_zoom_rects_g.append('rect')
      .attr('y', bar_y_offset)
      .attr('height', bar_height)
      .attr('fill', 'rgba(255, 0, 0, 0.5)');

    let drag_start_pos = null;
    let drag_rect = null;

    const drag_behavior = d3.drag()
      .on('start', (event) => {
        drag_start_pos = self.circular ? event.x : Math.min(Math.max(event.x, self.layout.x_range[0]), self.layout.x_range[1]);
        drag_rect = self.full_contig_zoom_g.append('rect')
          .attr('y', bar_y_offset)
          .attr('height', bar_height)
          .attr('fill', 'rgba(255, 0, 0, 0.7)')
          .attr('opacity', 0.7);
      })
      .on('drag', (event) => {
        const effective_mouse_pos = self.circular ? event.x : Math.min(Math.max(event.x, self.layout.x_range[0]), self.layout.x_range[1]);
        const x = Math.min(drag_start_pos, effective_mouse_pos);
        const width = Math.abs(drag_start_pos - effective_mouse_pos);
        drag_rect
          .attr('x', x)
          .attr('width', width);
      })
      .on('end', (event) => {
        const effective_mouse_pos = self.circular ? event.x : Math.min(Math.max(event.x, self.layout.x_range[0]), self.layout.x_range[1]);
        const start_px = Math.min(drag_start_pos, effective_mouse_pos);
        const end_px = Math.max(drag_start_pos, effective_mouse_pos);
        const start_coord = Math.floor(self.full_contig_x_scale.invert(start_px));
        const end_coord = Math.ceil(self.full_contig_x_scale.invert(end_px));
        // reset force load behavior
        for (let t of Object.values(self.tracks)) {
          t.currently_force_loading = false;
        }
        self.display_region({ domain: [start_coord, end_coord] });
        drag_rect.remove();
        drag_start_pos = null;
      });

    self.full_contig_zoom_rects_g.call(drag_behavior);
  }

  setup_view_zoom_bar() {
    const self = this;
    const bar_height = 20;
    const bar_y_offset = self.layout.top + self.layout.view_zoom_bar_top; // Below the main x axis

    self.view_zoom_g = self.controls_svg.append('g')
      .attr('class', 'view_zoom_bar');

    self.view_zoom_bg_rect = self.view_zoom_g.append('rect')
      .attr('x', self.layout.x_range[0])
      .attr('y', bar_y_offset)
      .attr('width', self.layout.x_range[1] - self.layout.x_range[0])
      .attr('height', bar_height)
      .attr('fill', '#fafafa')
      .attr('stroke', 'black')
      .attr('stroke-width', 1);

    let drag_start_pos = null;
    let drag_rect = null;

    const drag_behavior = d3.drag()
      .on('start', (event) => {
        drag_start_pos = self.circular ? event.x : Math.min(Math.max(event.x, self.layout.x_range[0]), self.layout.x_range[1]);
        drag_rect = self.view_zoom_g.append('rect')
          .attr('y', bar_y_offset)
          .attr('height', bar_height)
          .attr('fill', 'lightgray')
          .attr('opacity', 0.7);
      })
      .on('drag', (event) => {
        const effective_mouse_pos = self.circular ? event.x : Math.min(Math.max(event.x, self.layout.x_range[0]), self.layout.x_range[1]);
        const x = Math.min(drag_start_pos, effective_mouse_pos);
        const width = Math.abs(drag_start_pos - effective_mouse_pos);
        drag_rect
          .attr('x', x)
          .attr('width', width);
      })
      .on('end', (event) => {
        const effective_mouse_pos = self.circular ? event.x : Math.min(Math.max(event.x, self.layout.x_range[0]), self.layout.x_range[1]);
        const start_px = Math.min(drag_start_pos, effective_mouse_pos);
        const end_px = Math.max(drag_start_pos, effective_mouse_pos);
        const start_coord = Math.floor(self.x_scale.invert(start_px));
        const end_coord = Math.ceil(self.x_scale.invert(end_px));
        self.display_region({ domain: [start_coord, end_coord] });
        drag_rect.remove();
        drag_start_pos = null;
      });

    self.view_zoom_bg_rect.call(drag_behavior);
  }

  setup_drag() {
    const self = this;
    self.dragAction = d3.drag()
    //.filter(function(e) {
    //  return ((!d3.select(e.target).classed('tnseq_block')) || (!d3.select(e.target.parentElement).classed('sgb_gene')));
    //})
    .on('start', function(e) {
      //console.log(d3.select(e.target.parentElement).classed('sgb_gene'));
      self.drag_start_domain = self.x_scale.domain();
      self.drag_start = self.x_scale.invert(e.x);
      self.drag_start_mouse = e.x;
      self.x_change_mouse = 0
      self.tmp_scale = d3.scaleLinear().range(self.layout.x_range).domain(self.domain);
      self.tmp_axis = d3.axisTop(self.tmp_scale)
        .ticks(6)
        .tickFormat(self.circular_coordinate);
      self.x_ax_element.remove();
      self.x_ax_element = self.controls_svg.append('g')
        .attr('class', 'axis')
        .attr('transform', 'translate(0, '+String(self.layout.top+self.layout.track_axis_top)+')')
        .call(self.tmp_axis);
    })
    .on('drag', function(e) {
      const x_pos = self.x_scale.invert(e.x);
      const x_change = x_pos-self.drag_start;
      self.x_change_mouse = e.x-self.drag_start_mouse;
      self.set_domain(self.get_domain([self.drag_start_domain[0]-x_change, self.drag_start_domain[1]-x_change]))
      self.tmp_scale.domain(self.domain)
      self.x_ax_element.call(self.tmp_axis.scale(self.tmp_scale));
      for (let t of Object.values(self.tracks)) {
        t.g.attr('transform', 'translate('+String(self.x_change_mouse)+',0)');
        if (t.canvas) t.canvas.style('left', String(self.x_change_mouse));
      }
    })
    .on('end', function(e) {
      self.x_scale = self.tmp_scale;
      self.x_axis = self.tmp_axis;
      if (Math.abs(self.x_change_mouse) > 1) self.display_region();
    })
    self.outer_div.call(self.dragAction);
  }

  // coordinate functions

  circular_coordinate = (d) => {
    // Converts a linear coordinate to a circular coordinate within the contig.
    // the this variable is the class (self) if I use an arrow function
    // (don't totally get this, but works)
    return d < 0 ? this.contig_len + (d % this.contig_len) : d % this.contig_len;
  }

  get_coordinate_pixel_position(coordinate) {
    // Get the pixel position of a DNA coordinate
    let pos = this.x_scale(coordinate);
    if (this.expanded_domain_includes_zero) { // some are out of scale
      if (this.scale_near_zero) {
        // the scale is near zero (scale overflow to the left)
        if (coordinate > this.region_end) {
          pos = this.x_scale(coordinate-this.contig_len);
        }
      } else if (coordinate < this.region_start) {
        // the scale is near the contig len (scale overflow to the right)
        pos = this.x_scale(coordinate+this.contig_len);
      }  
    }
    // shifting to make the scale right
    pos += this.w;
    return pos;
  }

  get_feature_pixel_position(begin, end) {
    // Get the pixel positions of two DNA coordinates
    // NOTE: this still doesn't account for the case where a feature spans 0
    // and is one end is out of scale (I think)
    let left = this.x_scale(begin);
    let right = this.x_scale(end);
    if (this.expanded_domain_includes_zero) { // some are out of scale
      if (this.scale_near_zero) {
        // the scale is near zero (scale overflow to the left)
        if ((begin > this.region_start) || (end > this.region_start)) {
          left = this.x_scale(begin-this.contig_len);
          right = this.x_scale(end-this.contig_len);
          //console.log('if', left, right, this.region_start, this.region_end, begin, end)
        }
      } else {
        // the scale is near the contig len (scale overflow to the right)
        if ((begin < this.region_end) || (end < this.region_end)) {
          left = this.x_scale(begin+this.contig_len);
          right = this.x_scale(end+this.contig_len);
          //console.log('if2', left, right)
        }
      }  
    }
    // shifting to make the scale right
    left += this.w;
    right += this.w;
    return [left, right];
  }

  get_domain(proposed_domain) {
    /* if not circular, the domain will be fit into [0, this.contig_len]
    if circular, into [-this.contig_len, this.contig_len]
    */

    // make sure we're not bigger than the max size
    if (this.circular) {
      const domain_size = proposed_domain[1]-proposed_domain[0];

      if (domain_size > this.contig_len) { // enforces the size being <= contig len
        const offset = Math.ceil((domain_size-this.contig_len)/2);
        const index_spot = proposed_domain[0]+offset;
        // full circle starting at index_spot
        proposed_domain = [index_spot-this.contig_len+1, index_spot];
      }
      // map to positive circular coordinates
      proposed_domain = proposed_domain.map(this.circular_coordinate);

      if (proposed_domain[1] < proposed_domain[0]) {
        // if we overlap zero, make the start a negative coordinate
        proposed_domain[0] -= this.contig_len;
      }
    } else {
      proposed_domain = [Math.max(proposed_domain[0], 0), Math.min(proposed_domain[1], this.contig_len-1)];
    }
    return proposed_domain;
  }

  set_domain(proposed_domain) {
    this.domain = proposed_domain;
    this.domain_wid = this.domain[1]-this.domain[0];
    const d = this.domain; // just for readability
    this.initial_domain_includes_zero = d[0] < 0;
    // expanding on either side for fast dragging
    this.expanded_domain = this.get_domain([d[0]-this.domain_wid, d[1]+this.domain_wid])
    this.expanded_domain_includes_zero = this.expanded_domain[0] < 0;
    

    this.first_half = (d[0] + d[1])/(this.contig_len*2) < 0.5;
    // If this expanded domain includes zero, it's important
    // to know if the original domain (which sets the scale)
    // was low (near zero) or high (near the contig len)
    this.scale_near_zero = (this.initial_domain_includes_zero || this.first_half);
    this.region_start = this.circular_coordinate(this.expanded_domain[0]);
    this.region_end = this.circular_coordinate(this.expanded_domain[1]);
  }

  get_share_url() {
    const params = new URLSearchParams();
    params.set('contig', this.contig);
    params.set('start', this.circular_coordinate(this.domain[0]));
    params.set('end', this.circular_coordinate(this.domain[1]));
    for (const [key, val] of Object.entries(this.saved_state)) {
      params.set(key, Array.isArray(val) ? val.join(',') : val);
    }
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  // functions that change the x range

  new_contig(contig_name, starting_domain = null) {
    console.log('New contig', contig_name);
    this.contig = contig_name;
    this.contig_len = this.seq_lens[this.contig];
    this.contig_picker.property('value', this.contig);
    this.full_contig_x_scale.domain([0, this.contig_len]);
    this.full_contig_axis_element.call(this.full_contig_axis);
    if (starting_domain) {
      this.set_domain(starting_domain);
    } else {
      this.set_domain([Math.floor(this.contig_len / 10), Math.floor(this.contig_len / 5)]);
    }
    for (let d of Object.keys(this.data)) {
      this.data[d].filter_by_contig();
    }
    this.display_region();
  }

  zoom_in() {
    return {'domain': this.get_domain([this.domain[0]+this.domain_wid/4, this.domain[1]-this.domain_wid/4])};
  }

  zoom_out() {
    // reset force load behavior
    for (let t of Object.values(this.tracks)) {
      t.currently_force_loading = false;
    }
    return {'domain': this.get_domain([this.domain[0]-this.domain_wid, this.domain[1]+this.domain_wid])};
  }

  display_region(new_region = null) {
    const self = this;
    if (new_region) {
      if ('contig' in new_region) {
        if (new_region.contig != self.contig) {
          self.new_contig(new_region.contig, new_region.domain);
        } else {
          self.set_domain(new_region.domain);
        }
      } else {
        self.set_domain(new_region.domain);
      }
    }
    self.x_scale.domain(self.domain);
    self.x_ax_element.attr('transform', `translate(0, ${self.layout.top + self.layout.track_axis_top})`).call(self.x_axis);

    // Update full contig highlight
    const [start_px, end_px] = self.domain.map(self.full_contig_x_scale);
    self.full_contig_highlight_rect
      .attr('x', start_px)
      .attr('width', end_px - start_px);

    self.full_contig_x_scale.domain([0, self.contig_len]);
    self.full_contig_axis_element.call(self.full_contig_axis);

    self.x_scale.domain(self.domain);
    self.x_ax_element.call(self.x_axis);

    
    //console.log(self.data_map);
    // load datasets and display data
    for (let d of Object.keys(self.data_map)) {
      // check if any of the tracks using this data require loading
      if (Object.values(self.data_map[d]).some(tn => self.tracks[tn].expanded)) {
      self.data[d].update_data().then(() => {
          self.data[d].loaded = true;
          for (let tn of Object.values(self.data_map[d])) {
            let t = self.tracks[tn];
          t.display_region();
        }
      });
      } else {
        self.data[d].loaded = false;
      }
    }
  }

  add_track(track) {
    this.tracks[track.name] = track;
    if (track.data_name in this.data_map) {
      this.data_map[track.data_name].push(track.name);
    } else {
      this.data_map[track.data_name] = [track.name];
    }
  }

  // Setting up responsive elements - the tooltip and the sidebar

  setup_tooltip() {
    this.tooltip = d3.select('body').append('div')
      .style('visibility', 'hidden') 
      .style("background-color", "rgba(255, 255, 255, 0.8)") // Use rgba() for opacity
      .style("border-radius", "5px")
      .style("padding", "5px")
      .style("width", "150px")
      .style("color", "black")
      .style('z-index', '20')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('text-align', 'center')
      .html('<h2>yeah</h2><p>uhhuh</p>');
  }

  show_tooltip(x, y, html=null) {
    const tooltipWidth = 150; // matches the width set in setup_tooltip
    const windowWidth = window.innerWidth;
    
    // Check if tooltip would go off the right side
    const wouldOverflow = (x + 10 + tooltipWidth) > windowWidth;
    
    this.tooltip
      .style('left', wouldOverflow ? x - tooltipWidth - 10 : x + 10)
      .style('top', y + 20)
      .style('visibility', 'visible');
    if (html) this.tooltip.html(html);
  }

  move_tooltip(x, y) {
    const tooltipWidth = 150;
    const windowWidth = window.innerWidth;
    const wouldOverflow = (x + 75) > windowWidth;
    
    this.tooltip
      .style('left', wouldOverflow ? x - tooltipWidth - 10 : x - 75)
      .style('top', y + 20);
  }
  
  hide_tooltip() {
    this.tooltip.style('visibility', 'hidden');
  }

  setup_sidebar() {
    const self = this;
    this.current_sidebar_width = this.layout.sidebar_w;

    // Sidebar div is appended to the parent div, anchored to the left edge
    this.sidebar = this.sgb_outer_div.append('div')
      .attr('class', 'sgb_sidebar_div')
      .style("background-color", "#DDD")
      .style("width", 0)
      .style('position', 'absolute')
      .style('left', 0)
      .style('top', 0)
      .style('height', '80vh')
      .style('overflow-y', 'auto')
      .style('overflow-x', 'hidden')
      .style('z-index', 12)
      .style('text-align', 'left')
      .style('border-top-right-radius', '10px')
      .style('border-bottom-right-radius', '10px')
      .on('mousedown', function(event) {
        event.stopPropagation();
      });

    // Close button inside the sidebar (hidden when sidebar is closed)
    this.sidebar_button = this.sidebar.append('button')
      .style('font-size', '16px')
      .html("x")
      .style('position', 'absolute')
      .style('top', 7)
      .style('right', 7)
      .style('display', 'none') // hidden initially
      .style('z-index', 15)
      .on('click', () => {
        // Only hides the sidebar; opening is triggered by other UI actions
        this.hide_sidebar();
      });

    // Give the parent div an explicit width so right:0 works
    this.div.style('width', self.original_w + 'px');

    this.sidebar_content = this.sidebar.append('div')
      .attr('class', 'sidebar_content_div')

    this.sidebar_div = this.sidebar_content
      .append('div')
      .attr('class', 'sidebar-content-inner-div')
      .html('<h2>Click on a gene to see info here</h2>');

    this.sidebar_content
      .style('margin', 10)
      .style('display', 'none');
  }

  show_sidebar(html=null) {
    // Force sidebar width to 380px regardless of argument
    const forced_width = 380;
    if (html) this.sidebar_content.html(html);
    const needs_resize = !this.sidebar_expanded || this.current_sidebar_width !== forced_width;
    this.current_sidebar_width = forced_width;
    this.sidebar.style('width', forced_width + 'px').style('min-width', forced_width + 'px');
    this.sidebar_button.style('display', 'block'); // show close button inside sidebar
    this.sidebar_content.style('display', 'block');
    this.sidebar_expanded = true;
    // Shift the browser to the right of the sidebar and resize it
    if (needs_resize) {
      // Position the outer_div to start after the sidebar
      this.outer_div.style('left', forced_width + 'px');
      this.resize(this.original_w - forced_width);
    }
  }

  hide_sidebar() {
    this.sidebar.style('width', '0px').style('min-width', '0px');
    this.sidebar_button.style('display', 'none'); // hide close button
    this.sidebar_content.style('display', 'none');
    this.sidebar_expanded = false;
    // Reset outer_div position and restore full width
    this.outer_div.style('left', 0);
    this.resize(this.original_w);
  }

  default_gene_tooltip_func(e, gene_object) {
    if (gene_object) {
      const { locusId, name, desc } = gene_object;
  
      let html = `
          <div class="gene_tooltip">
            <p class="sidebar_title"><strong>${name}</strong></p>
            <p><strong>Locus ID:</strong> ${locusId}</p>
            <p><strong>Description:</strong> ${desc}</p>
          </div>
        `
      
      this.tooltip.selectAll('*').remove();
      this.tooltip.html(html);
      this.show_tooltip(e.pageX, e.pageY)
    }
  }

  default_gene_sidebar_func(gene_object) {
    if (gene_object) {

      const { locusId, name, desc, begin, end, strand, scaffoldId, pseudo } = gene_object;
      const sidebar_info_rows = [
        ['Name:', name],
        ['Locus ID:', locusId],
        ['Description:', desc],
        ['Contig:', scaffoldId],
        ['Start:', begin],
        ['End:', end],
        ['Strand:', strand]
      ]
      if (pseudo) sidebar_info_rows.push(['(Pseudogene)', '']);

      this.sidebar_div.selectAll('.sidebar_info_row')
        .data(sidebar_info_rows)
        .enter()
        .append('p')
          .attr('class', (d) => d[0]=='Name:' ? 'sidebar_info_row sidebar_title' : 'sidebar_info_row')
          .html((d) => `<strong>${d[0]}</strong> ${d[1]}`)
    
      this.sidebar_div.append('p').append('button')
        .html('Copy DNA Sequence')
        .on('click', function() {
          if (String(strand)=='+'){
            copy_sequence(this.seqs[scaffoldId].slice(begin-1, end), this);
          } else {
            copy_sequence(reverse_complement(this.seqs[scaffoldId].slice(begin-1, end)), this);
          }
          
        })
      
      if (this.aa_seqs != {}) {
        if (locusId in this.aa_seqs) {
          const aa_seq = this.aa_seqs[locusId];
          this.sidebar_div.append('p').append('button')
            .html('Copy AA Sequence')
            .on('click', function() {
              copy_sequence(aa_seq, this);
            })
          this.sidebar_div.append('p').append('a')
            .attr('href', `https://fast.genomics.lbl.gov/cgi/findHomologs.cgi?seqDesc=${locusId}&seq=${aa_seq}`)
            .attr('target', '_blank')
            .html('Find homologs with fast.genomics')
        } else {
          this.sidebar_div.append('p').html('No AA sequence available');
        }
      }
      this.sidebar_content.node().scrollTop = 0;
      this.show_sidebar();
    }
  }

  display_feature(contig, start, end) {
    const size = end-start;
    const left = start - size*2;
    const right = end + size*2;
    this.display_region({
      'contig': contig,
      'domain': [left, right]
    });
  }

  resize(new_w) {
    const self = this;
    self.w = new_w;
    self.display_w = new_w * 3;
    self.display_left = -1 * new_w;
    self.midpoint = new_w / 2;
    self.layout.x_range = [self.layout.x_buf, new_w - self.layout.x_buf];

    // Update outer/inner div widths
    self.outer_div.style('width', new_w);
    self.inner_div.style('width', new_w);

    // Update controls SVG
    self.controls_svg.attr('width', new_w);

    // Zoom in icon: circle + horizontal line + vertical line
    self.zoom_in_g.select('circle').attr('cx', self.midpoint + self.icon_spacing);
    const zi_lines = self.zoom_in_g.selectAll('line').nodes();
    // horizontal line
    d3.select(zi_lines[0])
      .attr('x1', self.midpoint + self.icon_spacing - self.icon_r / 2)
      .attr('x2', self.midpoint + self.icon_spacing + self.icon_r / 2);
    // vertical line
    d3.select(zi_lines[1])
      .attr('x1', self.midpoint + self.icon_spacing)
      .attr('x2', self.midpoint + self.icon_spacing);

    // Zoom out icon: circle + horizontal line
    self.zoom_out_g.select('circle').attr('cx', self.midpoint - self.icon_spacing);
    self.zoom_out_g.select('line')
      .attr('x1', self.midpoint - self.icon_spacing - self.icon_r / 2)
      .attr('x2', self.midpoint - self.icon_spacing + self.icon_r / 2);

    // Update scales
    self.x_scale.range(self.layout.x_range);
    self.full_contig_x_scale.range(self.layout.x_range);

    // Full contig zoom bar
    self.full_contig_bg_rect
      .attr('x', self.layout.x_range[0])
      .attr('width', self.layout.x_range[1] - self.layout.x_range[0]);

    // View zoom bar
    self.view_zoom_bg_rect
      .attr('x', self.layout.x_range[0])
      .attr('width', self.layout.x_range[1] - self.layout.x_range[0]);

    // Resize all tracks
    for (let t of Object.values(self.tracks)) {
      if (t.resize) t.resize();
    }

    // Re-render
    self.display_region();
  }

}

class baseData {
  /**
   * Base class for all data types in the Simple Genome Browser.
   *
   * @param {SimpleGenomeBrowser} sgb - The SimpleGenomeBrowser instance this track belongs to.
   * @param {string} name - The name of the data.
   *
   * Data tracks only need one function: update_data, which should update this.filt_data
   * using variables from this.sgb:
   *  contig, contig_len, domain, expanded_domain, circular, expanded_domain_includes_zero
   */
  constructor(sgb, name) {
    this.sgb = sgb;
    this.name = name;
    this.sgb.data[name] = this;
  }

  filter_by_contig() {
    const self = this;
    const chromo_column = self.contig_col ?? 'scaffoldId';
    self.contig_filt = self.data
      .params({ cc: chromo_column, contig: self.sgb.contig})
      .filter((d, $) => d[$.cc] == $.contig);
  }

  filter_points_by_region() {
    const self = this;
    self.region_start = self.sgb.circular_coordinate(self.sgb.expanded_domain[0]);
    self.region_end = self.sgb.circular_coordinate(self.sgb.expanded_domain[1]);
    if (this.sgb.circular && this.sgb.expanded_domain_includes_zero) {
      self.filt_data = self.contig_filt
        .params({ pc: self.pos_col, region_end: self.region_end, region_start: self.region_start })
        .filter((d, $) => ((d[$.pc] < $.region_end) || (d[$.pc] > $.region_start)));
    } else {
      self.filt_data = self.contig_filt
        .params({ pc: self.pos_col, region_end: self.region_end, region_start: self.region_start })
        .filter((d, $) => (d[$.pc] < $.region_end) && (d[$.pc] > $.region_start));
    }
  }

  filter_features_by_region() {
    const self = this;
    self.region_start = self.sgb.circular_coordinate(self.sgb.expanded_domain[0]);
    self.region_end = self.sgb.circular_coordinate(self.sgb.expanded_domain[1]);
    if (this.sgb.circular && this.sgb.expanded_domain_includes_zero) {
      self.filt_data = self.contig_filt
        .params({ sc: self.start_col, ec: self.end_col, end: self.region_end, start: self.region_start })
        .filter((d, $) => ((d[$.sc] < $.end) || (d[$.ec] > $.start) || (d[$.ec] < d[$.sc])));
    } else {
      self.filt_data = self.contig_filt
        .params({ sc: self.start_col, ec: self.end_col, end: self.region_end, start: self.region_start })
        .filter((d, $) => (d[$.sc] < $.end) && (d[$.ec] > $.start));
    }
  }
}

class staticPointData extends baseData {

  constructor(sgb, name, data, config) {
    super(sgb, name);
    this.data = data;
    this.contig_col = config.contig_col ?? 'scaffoldId';
    this.pos_col = config.pos_col ?? 'pos';
  }

  update_data() {
    this.filter_points_by_region();
    return Promise.resolve();
  }

}

class staticFeatureData extends baseData {

  constructor(sgb, name, data, config) {
    super(sgb, name);
    this.data = data;

    this.contig_col = config.contig_col ?? 'scaffoldId';
    this.start_col = config.start_col ?? 'begin';
    this.end_col = config.end_col ?? 'end';
  }

  update_data() {
    this.filter_features_by_region();
    return Promise.resolve();
  }

}

class serverPointData extends baseData {

  constructor(sgb, name, fetch_path, fetch_json, config) {
    super(sgb, name);
    this.data = {};
    this.contig_col = config.contig_col ?? 'scaffoldId';
    this.pos_col = config.pos_col ?? 'pos';
    // these will be modified before a server call
    this.fetch_path = fetch_path;
    this.fetch_json = fetch_json;
    this.fetch_json.filter_type = 'pos';
    this.fetch_json.contig_col = this.contig_col;
    this.base_columns = [
      {name: this.contig_col, dtype: 'str'},
      {name: this.pos_col, dtype: 'int'},
    ]
  }

  async update_data() {
    // this.columns must be set before calling this function
    let [low, high] = this.sgb.expanded_domain;
    this.fetch_json.low = parseInt(low);
    this.fetch_json.high = parseInt(high);
    this.fetch_json.contig = this.sgb.contig;
    this.fetch_json.contig_len = this.sgb.contig_len;
    this.fetch_json.columns = this.base_columns.slice();
    if (this.name in this.sgb.data_map) {
      for (let track of Object.values(this.sgb.data_map[this.name]).map(track_name => this.sgb.tracks[track_name])) {
      this.fetch_json.columns.push({name: track.column, dtype: 'float'});
      }
    }
    return new Promise((resolve) => {
      fetch_server_data(this.fetch_path, this.fetch_json)
        .then(data => {
          this.filt_data = data;
          resolve();
        });
    });
  }

}

class serverFeatureData extends baseData {

  constructor(sgb, name, fetch_path, fetch_json, config) {
    super(sgb, name);
    this.data = {};
    this.contig_col = config.contig_col ?? 'scaffoldId';
    this.start_col = config.start_col ?? 'begin';
    this.end_col = config.end_col ?? 'end';
    // these will be modified before a server call
    this.fetch_path = fetch_path;
    this.fetch_json = fetch_json;
    this.fetch_json.filter_type = 'beginend';
    this.fetch_json.contig_col = this.contig_col;
    this.base_columns = [
      {name: this.contig_col, dtype: 'str'},
      {name: this.start_col, dtype: 'int'},
      {name: this.end_col, dtype: 'int'},
    ]
  }

  async update_data() {
    let [low, high] = this.sgb.expanded_domain;
    this.fetch_json.low = parseInt(low);
    this.fetch_json.high = parseInt(high);
    this.fetch_json.contig = this.sgb.contig;
    this.fetch_json.contig_len = this.sgb.contig_len;
    this.fetch_json.columns = this.base_columns.slice();
    if (this.name in this.sgb.data_map) {
      for (let track of Object.values(this.sgb.data_map[this.name]).map(track_name => this.sgb.tracks[track_name])) {
      this.fetch_json.columns.push({name: track.column, dtype: 'float'});
      }
    }
    return new Promise((resolve) => {
      fetch_server_data(this.fetch_path, this.fetch_json)
        .then(data => {
          this.filt_data = data;
          resolve();
        });
    });
  }

}



export { SimpleGenomeBrowser, baseData, staticPointData, staticFeatureData, serverPointData, serverFeatureData };