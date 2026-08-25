const fs = require('fs');
let code = fs.readFileSync('src/components/SlotSwapModal.tsx', 'utf8');

const oldCheck = `onChange={e => setHideOpponents(e.target.checked)}`;
const newCheck = `onChange={e => setHideOpponents(e.target.checked)} checked={hideOpponents}`;

if (code.includes(oldCheck) && !code.includes(newCheck)) {
  code = code.replace(oldCheck, newCheck);
  fs.writeFileSync('src/components/SlotSwapModal.tsx', code);
  console.log('Fixed checkbox checked state');
}
