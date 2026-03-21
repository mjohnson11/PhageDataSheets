import { load_browser } from "../src/PhageBrowser.js";

document.addEventListener('DOMContentLoaded', () => {
  // Your code to run after the DOM is ready goes here!
  console.log("DOM is fully loaded!");
  load_browser(
    'Keio',
    '7023', 
    [3785000, 3815000],
  );
});

