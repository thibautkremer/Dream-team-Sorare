const fs = require('fs');
let code = fs.readFileSync('src/components/GalleryView.tsx', 'utf8');

code = code.replace(/import React, \{ useState, useMemo \} from 'react';/, "import React, { useState, useMemo, useTransition } from 'react';");
code = code.replace(/const \[searchTerm, setSearchTerm\] = useState\(''\);/, `const [searchTerm, setSearchTerm] = useState('');\n  const [isPending, startTransition] = useTransition();`);
code = code.replace(/onChange=\{\(e\) => \{ setSearchTerm\(e\.target\.value\); setCurrentPage\(1\); \}\}/, 
`onChange={(e) => { 
                const val = e.target.value; 
                startTransition(() => {
                  setSearchTerm(val); 
                  setCurrentPage(1); 
                });
              }}`);

fs.writeFileSync('src/components/GalleryView.tsx', code);
console.log('Patched GalleryView');
