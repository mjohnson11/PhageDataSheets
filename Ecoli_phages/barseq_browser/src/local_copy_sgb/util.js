import * as aq from 'https://cdn.jsdelivr.net/npm/arquero@7.2.0/dist/arquero.min.js/+esm';
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import Sortable, { MultiDrag } from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/modular/sortable.esm.js';
Sortable.mount(new MultiDrag());


async function fetch_server_data(fetch_path, json_object) {
  // Retrieves data from a parquet file on the server
  //console.log('fetching data from server:', fetch_path, json_object);
  const response = await fetch(fetch_path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(json_object),
  });
  
  if (!response.ok) {
    try {
      const errorData = await response.json();
      console.error("Error fetching data:", errorData.error || response.statusText);
    } catch (e) {
      console.error("Error fetching data:", response.statusText);
    }
    return;
  }
  
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const table = aq.fromArrow(bytes);
  const data = table.objects(); // TODO - consider returning the arquero table directly

  if ('data_log_message' in Object.keys(json_object)) {
    console.log(json_object.data_log_message, data);
  }
  
  return data;
} 

function parse_fasta(data) {
  let seq_dict = {};
  let currentSeq = "";
  let currentSeqName = "";
  data.split("\n").forEach(line => {
    if (line.startsWith(">")) {
      if (currentSeqName) {
        seq_dict[currentSeqName] = currentSeq;
      }
      currentSeqName = line.slice(1).split(' ')[0];
      currentSeq = "";
    } else {
      currentSeq += line.trim();
    }
  });
  if (currentSeqName) {
    seq_dict[currentSeqName] = currentSeq;
  }
  return seq_dict;
}

function fit_text(string, fontsize, max_width, shortened=false) {
  if ((measureText(string, fontsize) > max_width) & (string.length > 1)) {
    return fit_text(string.slice(0, -1), fontsize, max_width, true) + (shortened ? '' : '...');
  } else {
    return string;
  }
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

function copy_sequence(sequence, button, reverse_comp=false) {
  const seq = reverse_comp ? reverse_complement(sequence) : sequence;
  navigator.clipboard.writeText(seq);
  const original_button_text = button.innerHTML;
  button.innerHTML = 'Copied!'
  setTimeout(() => {
    button.innerHTML = original_button_text;
  }, 1000);
}

function reverse_complement(string) {
  const complement = {
    'A': 'T',
    'T': 'A',
    'C': 'G',
    'G': 'C',
    'a': 't',
    't': 'a',
    'c': 'g',
    'g': 'c',
    'N': 'N',
    'n': 'n',
  };
  let rev_comp = '';
  for (let i = string.length - 1; i >= 0; i--) {
    const base = string[i];
    rev_comp += complement[base] || base;
  }
  return rev_comp;
}

function open_column_selector(options) {
  const column_config = options.column_config || [];
  const unused_config = options.unused_config || [];
  const title = options.title || 'Select columns';
  const onSave = options.onSave || function(){};

  // ensure only one modal exists
  d3.select('.sgb_column_selector_modal').remove();

  const modal = d3.select('body').append('div')
    .attr('class', 'sgb_column_selector_modal')
    .style('position', 'fixed')
    .style('left', 0)
    .style('top', 0)
    .style('width', '100%')
    .style('height', '100%')
    .style('background-color', 'rgba(0,0,0,0.4)')
    .style('display', 'flex')
    .style('align-items', 'center')
    .style('justify-content', 'center')
    .style('z-index', 10000);

  const box = modal.append('div')
    .attr('class', 'sgb_column_selector_box')
    .style('width', '720px')
    .style('height', '520px')
    .style('background-color', 'white')
    .style('border', '1px solid #888')
    .style('border-radius', '6px')
    .style('padding', '12px')
    .style('box-sizing', 'border-box')
    .style('display', 'flex')
    .style('flex-direction', 'column');

  box.append('h3').text(title).style('margin', '4px 0 8px 0');

  const content = box.append('div')
    .style('flex', '1')
    .style('display', 'flex')
    .style('gap', '8px');

  // left: available columns
  const left = content.append('div')
    .style('flex', '1')
    .style('border', '1px solid #ddd')
    .style('height', 450)
    .style('overflow', 'scroll')
    .style('padding', '6px')
    .style('min-width', '240px');

  left.append('div').text('Available columns').style('font-weight', '600').style('margin-bottom', '6px');

  const availList = left.append('div').attr('class', 'sgb_avail_list');

  // right: current columns
  const right = content.append('div')
    .style('flex', '1')
    .style('border', '1px solid #ddd')
    .style('height', 450)
    .style('overflow', 'scroll')
    .style('padding', '6px')
    .style('min-width', '240px');

  right.append('div').text('Current columns').style('font-weight', '600').style('margin-bottom', '6px');

  const currList = right.append('div').attr('class', 'sgb_curr_list');

  // helper to get display subtitle
  const disp = (col) => {
    if (col.agg_columns) {
      return col.agg_columns.join(', ');
    } else {
      return col.column;
    }
  };

  availList.selectAll('.sgb_item')
    .data(unused_config)
    .join('div')
    .attr('class', 'sgb_item')
    .style('padding', '6px')
    .style('border-bottom', '1px solid #f0f0f0')
    .style('cursor', 'pointer')
    .style('user-select', 'none')
    .html(d => `<div style="font-size:12px">${d.name}<div style="font-size:10px;color:#666">${disp(d)}</div></div>`);

  currList.selectAll('.sgb_item')
    .data(column_config)
    .join('div')
    .attr('class', 'sgb_item')
    .style('padding', '6px')
    .style('border-bottom', '1px solid #f0f0f0')
    .style('cursor', 'pointer')
    .style('user-select', 'none')
    .html(d => `<div style="font-size:12px">${d.name}<div style="font-size:10px;color:#666">${disp(d)}</div></div>`);

  new Sortable(availList.node(), {
    multiDrag: true,
    group: 'shared', // set both lists to same group
    animation: 150,
    selectedClass: 'sgb_list_selected',
    avoidImplicitDeselect: false,
    multiDragKey: 'Meta'
  });

  new Sortable(currList.node(), {
    multiDrag: true,  
    group: 'shared',
    animation: 150,
    selectedClass: 'sgb_list_selected',
    avoidImplicitDeselect: false,
    multiDragKey: 'Meta'
  });

  // Function to close the modal
  const closeModal = () => {
    d3.select('.sgb_column_selector_modal').remove();
  };

  const update_and_exit = () => {
    closeModal();
    onSave(currList.selectAll('.sgb_item').data(), availList.selectAll('.sgb_item').data());   
  }

  const footer = box.append('div')
    .style('display', 'flex')
    .style('justify-content', 'flex-end')
    .style('gap', '8px')
    .style('padding-top', '12px');

  // Cancel button
  footer.append('button')
    .text('Cancel')
    .style('padding', '8px 16px')
    .style('border', '1px solid #ccc')
    .style('background-color', '#f0f0f0')
    .style('cursor', 'pointer')
    .on('click', closeModal);

  // Save button
  footer.append('button')
    .text('Save')
    .style('padding', '8px 16px')
    .style('border', 'none')
    .style('color', 'white')
    .style('background-color', '#007bff')
    .style('cursor', 'pointer')
    .on('click', update_and_exit)
}

function data_shaper(aq_df, column_config, icols, include_halfs=true) {
  // column_config is an array of columns that will be displayed, with entries like:
  // { 
  //    name: ...,
  //    column: ...,
  //    agg_columns: [...],
  //    agg_op: (mean|median),
  // }

  // roundtrip to objects is probably a bad idea, but here we are
  let new_data = [];
  let use_cols = [];
  let new_cols = [];
  for (let c of column_config) {
    if (c.agg_columns) {
      let suffixes = include_halfs ? ['', '_T', '_half1', '_half2'] : ['', '_T'];
      for (let suffix of suffixes) {
        let agg_col_names = c.agg_columns.map(col_name => col_name+suffix)
        new_cols.push(c.name+suffix)
        use_cols = use_cols.concat(agg_col_names)
      }
    }
  }
  for (let row of aq_df.select(use_cols).objects()) {
    let new_row = {};
    for (let c of column_config) {
      if (c.agg_columns) {
        let suffixes = include_halfs ? ['', '_T', '_half1', '_half2'] : ['', '_T'];
        for (let suffix of suffixes) {
          let agg_cols = c.agg_columns.map(col_name => row[col_name+suffix])
          let vals = agg_cols.filter(v => v != null && !Number.isNaN(v));
          if (vals.length == 0) {
            new_row[c.name+suffix] = null;
          } else if (c.agg_op == 'mean') {
            new_row[c.name+suffix] = d3.mean(vals);
          } else if (c.agg_op == 'median') {
            new_row[c.name+suffix] = d3.median(vals);
          }
        }
      }
    }
    new_data.push(new_row);
  }
  console.log('new_data sample:', new_data.slice(0,5), aq_df.select(use_cols).objects().slice(0,5));
  return aq_df.select(icols.concat(use_cols)).assign(aq.from(new_data));
  
  /* 
  here is an old arquero version, pretty messy  "escape" stuff, 
  not sure if it's worth it, so I am going to do an objects() approach
  which will be slow, but we can tolerate a little loading here
  for (let c of column_config) {
    if (c.agg_columns) {
      extra_cols = extra_cols.concat(c.agg_columns);
      if (c.agg_op == 'mean') {
        aq_df = aq_df
          .derive({ Atmp: aq.escape(
            function(d) {
              let use_cols = c.agg_columns.filter(tmp_col => !Number.isNaN(d[tmp_col]));
              return d3.mean(use_cols.map(tmp_col => d[tmp_col]));
            }
          )}).rename({ Atmp: c.name });
      } else if (c.agg_op == 'median') {
        aq_df = aq_df
          .derive({ Atmp: aq.escape(
            function(d) {
              let use_cols = c.agg_columns.filter(tmp_col => !Number.isNaN(d[tmp_col]));
              return d3.median(use_cols.map(tmp_col => d[tmp_col]));
            }
          )}).rename({ Atmp: c.name });
      }
    }
  }
  console.log(aq_df.select(icols.concat(column_config.map(c => c.name)).concat(extra_cols)).objects().slice(0,5));
  */
}

export { fetch_server_data, parse_fasta, fit_text, measure_text, reverse_complement, copy_sequence, open_column_selector, data_shaper };