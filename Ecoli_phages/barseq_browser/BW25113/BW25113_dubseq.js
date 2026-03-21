import { load_browser } from "../src/PhageBrowser_dubseq.js";

document.addEventListener('DOMContentLoaded', () => {
  // Your code to run after the DOM is ready goes here!
  console.log("DOM is fully loaded!");
  load_browser(
    'Keio',
    'CP009273.1', 
    [2000000, 2040000],
    'Sew11'
  );
});

