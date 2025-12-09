const fs=require('fs');
const text=fs.readFileSync('src/services/campaignEngine.js','utf8');
let stack=[]; let line=1; let col=0;
for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='\n'){line++;col=0;continue;}col++;
  if(ch==='{' ) stack.push({line,col});
  if(ch==='}') stack.pop();
}
console.log('unclosed count', stack.length);
console.log(stack.slice(-5));
