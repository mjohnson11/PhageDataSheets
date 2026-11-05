import { load_browser } from "../src/PhageBrowser.js?v=2";

document.addEventListener('DOMContentLoaded', () => {
  // Your code to run after the DOM is ready goes here!
  console.log("DOM is fully loaded!");
  load_browser(
    'Ecoli_ECRC100',
    'contig_1', 
    [864564, 869764]
  );
});
