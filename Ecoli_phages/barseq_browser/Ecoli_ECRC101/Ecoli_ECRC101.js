import { load_browser } from "../src/PhageBrowser.js?v=2";

document.addEventListener('DOMContentLoaded', () => {
  // Your code to run after the DOM is ready goes here!
  console.log("DOM is fully loaded!");
  load_browser(
    'Ecoli_ECRC101',
    'contig_3', 
    [1629109, 1634309]
  );
});
