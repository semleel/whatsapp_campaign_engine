const fs=require('fs');
const lines=fs.readFileSync('src/services/campaignEngine.js','utf8').split('\n');
for(let i=730;i<750;i++) console.log(String(i+1).padStart(4,'0')+': '+lines[i]);
