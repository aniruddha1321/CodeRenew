const fs = require('fs');
const path = require('path');

const from = path.resolve(__dirname, 'dist-electron', 'main.js');
const to = path.resolve(__dirname, 'dist-electron', 'main.cjs');

fs.rename(from, to, (err) => {
  if (err) {
    console.error("Rename failed:", err);
    process.exit(1);
  } else {
    console.log("Renamed main.js → main.cjs");
  }
});