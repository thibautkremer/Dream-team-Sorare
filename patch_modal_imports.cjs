const fs = require('fs');
let content = fs.readFileSync('src/components/ProjectionBreakdownModal.tsx', 'utf-8');

if (!content.includes('useState')) {
  content = content.replace("import React from 'react';", "import React, { useState, useEffect } from 'react';");
  fs.writeFileSync('src/components/ProjectionBreakdownModal.tsx', content);
}
