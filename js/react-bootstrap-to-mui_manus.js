
const componentMap = {
  'Button': { mui: 'Button', import: '@mui/material' },
  'Card': { mui: 'Card', import: '@mui/material' },
  'Modal': { mui: 'Dialog', import: '@mui/material' },
  'Form': { mui: 'FormControl', import: '@mui/material' },
  'Input': { mui: 'TextField', import: '@mui/material' },
  'FormControl': { mui: 'TextField', import: '@mui/material' },
  'Navbar': { mui: 'AppBar', import: '@mui/material' },
  'Dropdown': { mui: 'Menu', import: '@mui/material' },
  'Table': { mui: 'Table', import: '@mui/material' },
  'Badge': { mui: 'Badge', import: '@mui/material' },
  'Alert': { mui: 'Alert', import: '@mui/material' },
  'Container': { mui: 'Container', import: '@mui/material' },
  'Row': { mui: 'Grid', import: '@mui/material' },
  'Col': { mui: 'Grid', import: '@mui/material' },
  'Tabs': { mui: 'Tabs', import: '@mui/material' },
  'Tab': { mui: 'Tab', import: '@mui/material' },
  'Pagination': { mui: 'Pagination', import: '@mui/material' },
  'Spinner': { mui: 'CircularProgress', import: '@mui/material' },
  'Toast': { mui: 'Snackbar', import: '@mui/material' },
  'ButtonGroup': { mui: 'ButtonGroup', import: '@mui/material' },
  'Accordion': { mui: 'Accordion', import: '@mui/material' },
  'Offcanvas': { mui: 'Drawer', import: '@mui/material' },
  'ProgressBar': { mui: 'LinearProgress', import: '@mui/material' },
  'ListGroup': { mui: 'List', import: '@mui/material' },
  'ListGroupItem': { mui: 'ListItem', import: '@mui/material' },
};

// Mapping for specific prop transformations
const propMap = {
  'Button': {
    'variant': (value) => {
      switch (value) {
        case 'primary': return 'contained';
        case 'secondary': return 'outlined';
        case 'link': return 'text';
        default: return value;
      }
    },
    'size': (value) => {
      switch (value) {
        case 'sm': return 'small';
        case 'lg': return 'large';
        default: return 'medium';
      }
    },
  },
  'Modal': {
    'show': 'open',
    'onHide': 'onClose',
  },
  'Row': {
    // Row becomes Grid container
    'className': (value, j) => {
      // Remove existing className if it only contains 'row' or similar layout classes
      // For more complex classNames, this might need a more sophisticated parser
      return j.jsxAttribute(j.jsxIdentifier('container'), null); // Add container prop
    },
    'noGutters': (value, j) => j.jsxAttribute(j.jsxIdentifier('spacing'), j.literal(0)), // Simplified, MUI spacing is more granular
  },
  'Col': {
    // Col becomes Grid item with specific sizing props
    'xs': (value, j) => j.jsxAttribute(j.jsxIdentifier('xs'), j.literal(parseInt(value, 10))),
    'sm': (value, j) => j.jsxAttribute(j.jsxIdentifier('sm'), j.literal(parseInt(value, 10))),
    'md': (value, j) => j.jsxAttribute(j.jsxIdentifier('md'), j.literal(parseInt(value, 10))),
    'lg': (value, j) => j.jsxAttribute(j.jsxIdentifier('lg'), j.literal(parseInt(value, 10))),
    'xl': (value, j) => j.jsxAttribute(j.jsxIdentifier('xl'), j.literal(parseInt(value, 10))),
    'className': (value, j) => {
      // Remove existing className if it only contains 'col' or similar layout classes
      return j.jsxAttribute(j.jsxIdentifier('item'), null); // Add item prop
    },
  },
  'Input': {
    'type': null, // MUI TextField handles type internally
  },
  'FormControl': {
    'controlId': null, // No direct equivalent, often handled by TextField's id/label
  },
};

export default function transformer(file, api) {
  const j = api.j;
  const root = j(file.source);

  const reactBootstrapImports = new Map(); // Map<localIdentifier, originalComponentName>
  const muiImports = new Map(); // Map<componentName, importPath>

  // 1. Collect react-bootstrap imports and their local identifiers
  root.find(j.ImportDeclaration, { source: { value: 'react-bootstrap' } })
    .forEach(path => {
      path.node.specifiers.forEach(specifier => {
        if (specifier.type === 'ImportSpecifier') {
          reactBootstrapImports.set(specifier.local.name, specifier.imported.name);
        }
      });
    });

  // 2. Transform JSX elements
  root.find(j.JSXElement)
    .forEach(path => {
      const openingElement = path.node.openingElement;
      const componentLocalName = openingElement.name.name;

      // Check if this component's local name corresponds to a react-bootstrap import
      if (reactBootstrapImports.has(componentLocalName)) {
        const rbOriginalComponentName = reactBootstrapImports.get(componentLocalName);

        if (componentMap[rbOriginalComponentName]) {
          const muiComponent = componentMap[rbOriginalComponentName].mui;
          const muiImportPath = componentMap[rbOriginalComponentName].import;

          if (muiComponent) {
            // Replace component name
            openingElement.name.name = muiComponent;
            if (path.node.closingElement) {
              path.node.closingElement.name.name = muiComponent;
            }

            // Add to MUI imports to be added later
            if (muiImportPath) {
              muiImports.set(muiComponent, muiImportPath);
            }

            // Transform props
            if (propMap[rbOriginalComponentName]) {
              openingElement.attributes = openingElement.attributes.map(attr => {
                if (attr.type === 'JSXAttribute' && propMap[rbOriginalComponentName][attr.name.name]) {
                  const propTransformer = propMap[rbOriginalComponentName][attr.name.name];
                  if (typeof propTransformer === 'function') {
                    // If it's a function, call it to get new prop name/value
                    const transformed = propTransformer(attr.value ? (attr.value.type === 'Literal' ? attr.value.value : attr.value) : true, j); // Pass j for creating new nodes
                    if (transformed === null) return null; // Remove prop
                    if (transformed && transformed.type === 'JSXAttribute') return transformed; // If function returns a JSXAttribute directly
                    // Default to renaming prop with original value if function returns a simple value
                    return j.jsxAttribute(j.jsxIdentifier(attr.name.name), j.literal(transformed));
                  } else if (propTransformer === null) {
                    return null; // Remove prop
                  } else {
                    // If it's a string, it's a direct prop name rename
                    return j.jsxAttribute(j.jsxIdentifier(propTransformer), attr.value);
                  }
                }
                return attr;
              }).filter(Boolean); // Filter out nulls (removed props)
            }
          }
        }
      }
    });

  // 3. Remove old react-bootstrap imports and add new MUI imports
  const existingMuiImports = new Set();
  root.find(j.ImportDeclaration, { source: { value: '@mui/material' } })
    .forEach(path => {
      path.node.specifiers.forEach(specifier => {
        if (specifier.type === 'ImportSpecifier') {
          existingMuiImports.add(specifier.imported.name);
        }
      });
    });

  let lastImportDeclaration = null;
  root.find(j.ImportDeclaration).forEach(path => {
    lastImportDeclaration = path;
  });

  // Collect all new MUI imports to be added
  const newMuiImportSpecifiers = new Map(); // Map<importPath, Set<componentName>>
  muiImports.forEach((importPath, component) => {
    if (!existingMuiImports.has(component)) {
      if (!newMuiImportSpecifiers.has(importPath)) {
        newMuiImportSpecifiers.set(importPath, new Set());
      }
      newMuiImportSpecifiers.get(importPath).add(component);
    }
  });

  // Add new MUI imports
  newMuiImportSpecifiers.forEach((components, importPath) => {
    const specifiers = Array.from(components).map(component => j.importSpecifier(j.identifier(component)));
    const importStatement = j.importDeclaration(specifiers, j.literal(importPath));

    if (lastImportDeclaration) {
      j(lastImportDeclaration).insertAfter(importStatement);
    } else {
      root.get().node.program.body.unshift(importStatement);
    }
  });

  // Remove react-bootstrap imports
  root.find(j.ImportDeclaration, { source: { value: 'react-bootstrap' } })
    .forEach(path => {
      const newSpecifiers = path.node.specifiers.filter(specifier => {
        const originalComponentName = reactBootstrapImports.get(specifier.local.name);
        // Keep imports if they are not mapped for transformation or if they are not in the componentMap
        return !originalComponentName || !componentMap[originalComponentName];
      });

      if (newSpecifiers.length > 0) {
        path.node.specifiers = newSpecifiers;
      } else {
        j(path).remove(); // Remove the entire import declaration if no specifiers are left
      }
    });

  return root.toSource();
}

