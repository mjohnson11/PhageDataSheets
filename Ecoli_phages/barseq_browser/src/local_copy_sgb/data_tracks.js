// These tracks load a single dataset along with the track
// They must define a param data_name during the synchronous part of the constructor

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as aq from 'https://cdn.jsdelivr.net/npm/arquero@7.2.0/dist/arquero.min.js/+esm';

import { geneTrack, quantitativeFeatureTrack } from "./SGB_tracks.js";
import { staticFeatureData, staticPointData } from "./SimpleGenomeBrowser.js";
import { open_column_selector, data_shaper } from "./helper_functions.js";

class gffTrack extends geneTrack {
  /**
   * Extends `geneTrack` to load and display gene features from a GFF (General Feature Format) file.
   * Parses GFF data and adds gene information to the browser's search index.
   *
   * @param {SimpleGenomeBrowser} sgb - The SimpleGenomeBrowser instance this track belongs to.
   * @param {string} name - The name of the track.
   * @param {number} h - The height of the track in pixels.
   * @param {number} top - The top position of the track in pixels.
   * @param {object} [config={}] - An optional configuration object for the track.
   * @param {string} gff_file - Path to the GFF file to load.
   * @param {string} [type_filter='CDS'] - Feature type to filter for from the GFF file (e.g., 'CDS', 'gene', 'mRNA').
   *
   * @customizable_methods
   * - Inherits customizable methods from `geneTrack`: `hover_function`, `click_function`, `get_feature_stroke`, `get_feature_fill`, `make_gene_display`, `load_region`.
   *   Can customize these methods to alter the appearance or information displayed for GFF-loaded genes.
   */

  constructor(sgb, name, config, gff_file, type_filter='CDS') {
    super(sgb, name, config, 'scaffoldId', 'begin', 'end', 'locusId');
    const self = this;
    self.gff_file = gff_file;
    self.data_name = self.name+'_data';
    d3.text(gff_file).then(function(tdata) {
      let raw_data = d3.tsvParseRows(tdata.split('\n').filter((line) => (!line.startsWith('#'))).join('\n'), self.gff_parse);
      if (type_filter) {
        raw_data = raw_data.filter((d) => d.type==type_filter);
      }
      for (let row of raw_data) {
        row.attributes.split(';').forEach(function(pair) {
          let keyVal = pair.split('=');
          row[keyVal[0]] = keyVal[1];
        })
        // Some renaming for consistency
        row['name'] = row['gene'] || row['locus_tag'];
        row['locusId'] = row['locus_tag'];
        row['desc'] = row['product'];
        // Adding info to the search index
        self.sgb.search_dict[String(row['locusId'])] = {
          'contig': row[self.contig_col],
          'start': row[self.start_col],
          'end': row[self.end_col],
          'datum': row,
          'track': self
        }
      }
      self.data = new staticFeatureData(self.sgb, self.name+'_data', aq.from(raw_data), config);
      console.log('gff data loaded:', self.data);
      // Updating autocomplete search bar
      self.sgb.autoCompleteEl.data = {src: Object.keys(self.sgb.search_dict).map((k) => k + ' ' + self.sgb.search_dict[k].datum.name + ' ' + self.sgb.search_dict[k].datum.desc)};
      self.data.filter_by_contig();
      self.data.update_data();
      self.display_region();
    })
  }

  gff_parse(r) {
    return {
      'scaffoldId': r[0], 
      'type': r[2], 
      'begin': parseInt(r[3]), 
      'end': parseInt(r[4]),
      'strand': r[6],
      'phase': r[7],
      'attributes': r[8]
    }
  }

}

class gbTrack extends geneTrack {
  /**
   * Extends `geneTrack` to load and display gene features from pre-loaded Genbank JSON data.
   * Parses Genbank JSON (output from https://github.com/cheminfo-js/genbank-parser) 
   * and adds gene information to the browser's search index.
   *
   * @param {SimpleGenomeBrowser} sgb - The SimpleGenomeBrowser instance this track belongs to.
   * @param {string} name - The name of the track.
   * @param {number} h - The height of the track in pixels.
   * @param {number} top - The top position of the track in pixels.
   * @param {object} [config={}] - An optional configuration object for the track.
   * @param {array} genbank_json - Array of Genbank JSON objects to load feature data from.
   * @param {string} [type_filter='CDS'] - Feature type to filter for from the Genbank data (e.g., 'CDS', 'gene', 'mRNA').
   *
   * @customizable_methods
   * - Inherits customizable methods from `geneTrack`: `hover_function`, `click_function`, `get_feature_stroke`, `get_feature_fill`, `make_gene_display`, `load_region`.
   *   Can customize these methods to alter the appearance or information displayed for Genbank-loaded genes.
   */
  constructor(sgb, name, config, genbank_json, type_filter='CDS') {
    super(sgb, name, config, 'scaffoldId', 'begin', 'end', 'locusId')
    const self = this;
    self.genbank_json = genbank_json;
    self.data_name = self.name+'_data';
    let raw_data = [];
    for (let rec of genbank_json) {
      const scaffoldId = rec.name;
      for (let feature of rec.features) {
        if (feature.type == type_filter) {
          let row = {
            'scaffoldId': scaffoldId,
            'locusId': feature.notes.locus_tag[0],
            'begin': feature.start,
            'end': feature.end,
            'strand': feature.strand == 1 ? '+' : '-',
            'name': feature.name,
            'desc': feature.notes.product ? feature.notes.product[0] : '',
            'pseudo': feature.notes.pseudo ? true : false,
            'gb_row': feature
          };
          raw_data.push(row);
          self.sgb.search_dict[String(row['locusId'])] = {
            'contig': row[self.contig_col],
            'start': row[self.start_col],
            'end': row[self.end_col],
            'datum': row,
            'track': self
          }
        }
      }
    }
    self.data = new staticFeatureData(self.sgb, self.name+'_data', aq.from(raw_data), config);
    console.log('gb data loaded:', self.data);
    // Updating autocomplete search bar
    self.sgb.autoCompleteEl.data = {src: Object.keys(self.sgb.search_dict).map((k) => k + ' ' + self.sgb.search_dict[k].datum.name + ' ' + self.sgb.search_dict[k].datum.desc)};
    self.data.filter_by_contig();
    self.data.update_data();
    self.display_region();
  }
}

class geneTableTrack extends geneTrack {
  /**
   * Extends `geneTrack` to load and display gene features from a TSV (Tab-Separated Values) gene table file.
   * Assumes the gene table has columns: `locusId`, `name`, `scaffoldId`, `begin`, `end`, `desc`.
   *
   * @param {SimpleGenomeBrowser} sgb - The SimpleGenomeBrowser instance this track belongs to.
   * @param {string} name - The name of the track.
   * @param {number} h - The height of the track in pixels.
   * @param {number} top - The top position of the track in pixels.
   * @param {object} [config={}] - An optional configuration object for the track.
   * @param {string} gene_file - Path to the TSV gene table file.
   * @param {string} [chromo_column='scaffoldId'] - The column name in the gene table that corresponds to the chromosome/contig ID.
   *
   * @customizable_methods
   * - Inherits customizable methods from `geneTrack`: `hover_function`, `click_function`, `get_feature_stroke`, `get_feature_fill`, `make_gene_display`, `load_region`.
   *   Can customize these methods to alter the appearance or information displayed for gene table-loaded genes.
   */

  constructor(sgb, name, config, gene_file) {
    super(sgb, name, config, 'scaffoldId', 'begin', 'end', 'locusId')
    const self = this;
    self.gene_file = gene_file;
    self.data_name = self.name+'_data';
    aq.loadCSV(gene_file, {delimiter: '\t'}).then(function(tdata) {
      let raw_data  = tdata;
      for (let row of raw_data.objects()) {
        row['locusId'] = String(row['locusId']); // convert to string to avoid number-string comparison issues
        // Adding info to the search index
        self.sgb.search_dict[row.locusId] = {
          'contig': row[self.contig_col],
          'start': row[self.start_col],
          'end': row[self.end_col],
          'datum': row,
          'track': self
        }
      }
      self.data = new staticFeatureData(self.sgb, self.name+'_data', raw_data, config);
      console.log('gene data loaded:', self.data);
      // Updating autocomplete search bar
      self.sgb.autoCompleteEl.data = {src: Object.keys(self.sgb.search_dict).map((k) => k + ' ' + self.sgb.search_dict[k].datum.name + ' ' + self.sgb.search_dict[k].datum.desc)};
      self.data.filter_by_contig();
      self.data.update_data();
      self.display_region();
    })
  }
}

class heatmapTrack extends quantitativeFeatureTrack {

  constructor(browser, name, config, full_column_config, contig_column, start_column, end_column, id_column, c_scale, data_file_or_object) {
    super(browser, name, config, full_column_config, contig_column, start_column, end_column, id_column);
    const self = this;
    self.data_name = self.name+'_data';
    if (self.sgb.saved_state) self.sgb.saved_state.phages = self.column_config.map(c => c.name);
    self.set_diverging_colorscale(c_scale);
    self.suffixes = config.suffixes ?? [''];
    self.include_halfs = self.suffixes.includes('_half1') && self.suffixes.includes('_half2');
    self.icols = config.icols ?? ['locusId', 'sysName', 'scaffoldId', 'begin', 'end', 'strand', 'name', 'desc'];
    self.sidebar_onload = config.sidebar_onload ?? true;

    self.loadingPromise = new Promise((resolve, reject) => {
      const dataPromise = (typeof data_file_or_object === 'object')
        ? Promise.resolve(data_file_or_object)  // Use existing object if provided
        : aq.loadCSV(data_file_or_object, {delimiter: '\t'}); // Otherwise, load from TSV
      dataPromise.then(raw_data => {
        console.log('heatmap data loaded:', raw_data);
        self.og_data = raw_data;
        self.data = new staticFeatureData(self.sgb, self.data_name, null, config); // data to be set below
        self.update_data_by_column_config();
        self.display_region();
        const full_focal_col = self.column_config.filter((c) => c.name == self.focal_col)[0]
        if (self.sidebar_onload) self.make_summary_sidebar(full_focal_col);
        resolve(self);
      }).catch(reject);
    });

    // Add settings button for column selection
    self.settings_btn = self.add_controls_button('Select columns to display',
      () => {
      open_column_selector({
        column_config: self.column_config,
        unused_config: self.inactive_config,
        title: `Select columns for ${self.name} (select and drag columns)`,
        onSave: (new_current, new_unused) => {
            self.column_config = new_current;
            self.inactive_config = new_unused;
            if (self.sgb.saved_state) self.sgb.saved_state.phages = new_current.map(c => c.name);
            self.update_data_by_column_config();
            self.reset_display();
            self.display_region();
          }
        });
      });
  }

  update_data_by_column_config() {
    const self = this;
    self.data.data = data_shaper(self.og_data, self.column_config, self.icols, self.suffixes);
    self.data.filter_by_contig(self.contig_column);
    self.data.update_data();
  }
}

export { gffTrack, gbTrack, geneTableTrack, heatmapTrack}