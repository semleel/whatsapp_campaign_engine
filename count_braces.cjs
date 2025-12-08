const fs=require('fs');
const text=fs.readFileSync('src/services/campaignEngine.js','utf8');
let depth=0; let line=1; let col=0; let openAt=[];
for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='\n'){line++;col=0;continue;}col++;
  if(ch==='{' ){depth++; openAt.push({line,col});}
  if(ch==='}') depth--; 
}
console.log('final depth', depth, 'opens', openAt.length);
