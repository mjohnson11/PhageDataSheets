import { load_browser } from "../src/PhageBrowser.js";

document.addEventListener('DOMContentLoaded', () => {
  // Your code to run after the DOM is ready goes here!
  console.log("DOM is fully loaded!");
  load_browser(
    'BL21',
    'CP001509', 
    [140000, 210000],
    'Sew11'
  );
});
