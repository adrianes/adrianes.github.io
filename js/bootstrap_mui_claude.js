/**
 * Bootstrap → Material UI Migration Tool
 * Ejecutar: npx jscodeshift -t bootstrap-to-mui-unified.js src/**/*.{js,jsx,ts,tsx} --parser=tsx
 * 
 * Combina las mejores prácticas de múltiples implementaciones para una migración robusta
 */

module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasChanges = false;

  // ============================================================================
  // MAPEOS Y CONFIGURACIONES
  // ============================================================================

  const COMPONENT_MAP = {
    Button: '@mui/material/Button',
    Alert: '@mui/material/Alert',
    Modal: '@mui/material/Dialog',
    Container: '@mui/material/Container',
    Card: '@mui/material/Card',
    Badge: '@mui/material/Badge',
    Spinner: '@mui/material/CircularProgress',
    Form: '@mui/material/Box',
  };

  const BUTTON_VARIANTS = {
    primary: { variant: 'contained', color: 'primary' },
    secondary: { variant: 'contained', color: 'secondary' },
    success: { variant: 'contained', color: 'success' },
    danger: { variant: 'contained', color: 'error' },
    warning: { variant: 'contained', color: 'warning' },
    info: { variant: 'contained', color: 'info' },
    light: { variant: 'outlined', color: 'inherit' },
    dark: { variant: 'contained', color: 'inherit' },
    link: { variant: 'text', color: 'primary' },
    'outline-primary': { variant: 'outlined', color: 'primary' },
    'outline-secondary': { variant: 'outlined', color: 'secondary' },
  };

  const SIZE_MAP = { sm: 'small', lg: 'large' };

  const ALERT_SEVERITY = {
    primary: 'info', secondary: 'info', success: 'success',
    danger: 'error', warning: 'warning', info: 'info',
  };

  const CLASS_TO_SX = [
    { re: /\bmb-(\d)\b/g, sx: m => ({ mb: Number(m[1]) }) },
    { re: /\bmt-(\d)\b/g, sx: m => ({ mt: Number(m[1]) }) },
    { re: /\bms-(\d)\b/g, sx: m => ({ ml: Number(m[1]) }) },
    { re: /\bme-(\d)\b/g, sx: m => ({ mr: Number(m[1]) }) },
    { re: /\bmx-(\d)\b/g, sx: m => ({ mx: Number(m[1]) }) },
    { re: /\bmy-(\d)\b/g, sx: m => ({ my: Number(m[1]) }) },
    { re: /\bp-(\d)\b/g, sx: m => ({ p: Number(m[1]) }) },
    { re: /\bpx-(\d)\b/g, sx: m => ({ px: Number(m[1]) }) },
    { re: /\bpy-(\d)\b/g, sx: m => ({ py: Number(m[1]) }) },
    { re: /\bpt-(\d)\b/g, sx: m => ({ pt: Number(m[1]) }) },
    { re: /\bpb-(\d)\b/g, sx: m => ({ pb: Number(m[1]) }) },
    { re: /\bd-flex\b/g, sx: () => ({ display: 'flex' }) },
    { re: /\bd-none\b/g, sx: () => ({ display: 'none' }) },
    { re: /\btext-center\b/g, sx: () => ({ textAlign: 'center' }) },
    { re: /\bjustify-content-center\b/g, sx: () => ({ justifyContent: 'center' }) },
    { re: /\balign-items-center\b/g, sx: () => ({ alignItems: 'center' }) },
    { re: /\bflex-column\b/g, sx: () => ({ flexDirection: 'column' }) },
    { re: /\bgap-(\d)\b/g, sx: m => ({ gap: Number(m[1]) }) },
  ];

  // ============================================================================
  // UTILIDADES
  // ============================================================================

  function addMUIImport(componentName) {
    const importPath = `@mui/material/${componentName}`;
    const existing = root.find(j.ImportDeclaration, { source: { value: importPath } });
    
    if (existing.size() === 0) {
      const importDecl = j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier(componentName))],
        j.stringLiteral(importPath)
      );
      const firstImport = root.find(j.ImportDeclaration).at(0);
      if (firstImport.size()) {
        firstImport.insertBefore(importDecl);
      } else {
        root.get().node.program.body.unshift(importDecl);
      }
    }
  }

  function mergeSxProp(element, sxObj) {
    if (Object.keys(sxObj).length === 0) return;
    
    const attrs = element.openingElement.attributes;
    const sxAttr = attrs.find(a => a.type === 'JSXAttribute' && a.name.name === 'sx');
    
    if (!sxAttr) {
      attrs.push(
        j.jsxAttribute(
          j.jsxIdentifier('sx'),
          j.jsxExpressionContainer(
            j.objectExpression(
              Object.entries(sxObj).map(([k, v]) =>
                j.property('init', j.identifier(k), 
                  typeof v === 'number' ? j.numericLiteral(v) : j.stringLiteral(v))
              )
            )
          )
        )
      );
    } else if (sxAttr.value?.type === 'JSXExpressionContainer' && 
               sxAttr.value.expression.type === 'ObjectExpression') {
      const props = sxAttr.value.expression.properties;
      Object.entries(sxObj).forEach(([k, v]) => {
        const exists = props.find(p => p.key?.name === k);
        if (!exists) {
          props.push(j.property('init', j.identifier(k), 
            typeof v === 'number' ? j.numericLiteral(v) : j.stringLiteral(v)));
        }
      });
    }
  }

  function removeBootstrapImports() {
    root.find(j.ImportDeclaration)
      .filter(path => {
        const val = path.node.source.value;
        return val === 'react-bootstrap' || val.includes('bootstrap/dist/css');
      })
      .remove();
    hasChanges = true;
  }

  // ============================================================================
  // TRANSFORMADORES
  // ============================================================================

  function transformButtons() {
    root.find(j.JSXElement, {
      openingElement: { name: { type: 'JSXIdentifier', name: 'Button' } }
    }).forEach(path => {
      const attrs = path.node.openingElement.attributes;
      const newAttrs = [];
      let hasVariant = false;

      attrs.forEach(attr => {
        if (attr.type !== 'JSXAttribute') {
          newAttrs.push(attr);
          return;
        }

        if (attr.name.name === 'variant' && attr.value?.type === 'Literal') {
          hasVariant = true;
          const bsVariant = attr.value.value;
          const muiProps = BUTTON_VARIANTS[bsVariant];
          if (muiProps) {
            newAttrs.push(j.jsxAttribute(j.jsxIdentifier('variant'), j.stringLiteral(muiProps.variant)));
            newAttrs.push(j.jsxAttribute(j.jsxIdentifier('color'), j.stringLiteral(muiProps.color)));
          }
        } else if (attr.name.name === 'size' && attr.value?.type === 'Literal') {
          const muiSize = SIZE_MAP[attr.value.value];
          if (muiSize) {
            newAttrs.push(j.jsxAttribute(j.jsxIdentifier('size'), j.stringLiteral(muiSize)));
          } else {
            newAttrs.push(attr);
          }
        } else {
          newAttrs.push(attr);
        }
      });

      if (!hasVariant) {
        newAttrs.unshift(j.jsxAttribute(j.jsxIdentifier('variant'), j.stringLiteral('contained')));
      }

      path.node.openingElement.attributes = newAttrs;
      addMUIImport('Button');
      hasChanges = true;
    });
  }

  function transformAlerts() {
    root.find(j.JSXElement, {
      openingElement: { name: { type: 'JSXIdentifier', name: 'Alert' } }
    }).forEach(path => {
      const attrs = path.node.openingElement.attributes;
      attrs.forEach(attr => {
        if (attr.type === 'JSXAttribute' && attr.name.name === 'variant' && attr.value?.type === 'Literal') {
          const severity = ALERT_SEVERITY[attr.value.value] || 'info';
          attr.name.name = 'severity';
          attr.value = j.stringLiteral(severity);
        }
      });
      addMUIImport('Alert');
      hasChanges = true;
    });
  }

  function transformModals() {
    root.find(j.JSXElement, {
      openingElement: { name: { type: 'JSXIdentifier', name: 'Modal' } }
    }).forEach(path => {
      path.node.openingElement.name.name = 'Dialog';
      if (path.node.closingElement) path.node.closingElement.name.name = 'Dialog';

      const attrs = path.node.openingElement.attributes;
      attrs.forEach(attr => {
        if (attr.type !== 'JSXAttribute') return;
        if (attr.name.name === 'show') attr.name.name = 'open';
        if (attr.name.name === 'onHide') attr.name.name = 'onClose';
      });

      path.node.children = path.node.children.map(child => {
        if (child.type !== 'JSXElement') return child;
        const name = child.openingElement?.name;
        
        if (name?.type === 'JSXMemberExpression' && name.object.name === 'Modal') {
          const prop = name.property.name;
          if (prop === 'Header' || prop === 'Title') {
            child.openingElement.name = j.jsxIdentifier('DialogTitle');
            child.closingElement.name = j.jsxIdentifier('DialogTitle');
            addMUIImport('DialogTitle');
          } else if (prop === 'Body') {
            child.openingElement.name = j.jsxIdentifier('DialogContent');
            child.closingElement.name = j.jsxIdentifier('DialogContent');
            addMUIImport('DialogContent');
          } else if (prop === 'Footer') {
            child.openingElement.name = j.jsxIdentifier('DialogActions');
            child.closingElement.name = j.jsxIdentifier('DialogActions');
            addMUIImport('DialogActions');
          }
        }
        return child;
      });

      addMUIImport('Dialog');
      hasChanges = true;
    });
  }

  function transformGrid() {
    // Row → Grid container
    root.find(j.JSXElement, {
      openingElement: { name: { type: 'JSXIdentifier', name: 'Row' } }
    }).forEach(path => {
      path.node.openingElement.name.name = 'Grid';
      if (path.node.closingElement) path.node.closingElement.name.name = 'Grid';
      
      const attrs = path.node.openingElement.attributes;
      if (!attrs.some(a => a.type === 'JSXAttribute' && a.name.name === 'container')) {
        attrs.push(j.jsxAttribute(j.jsxIdentifier('container'), null));
      }
      if (!attrs.some(a => a.type === 'JSXAttribute' && a.name.name === 'spacing')) {
        attrs.push(j.jsxAttribute(j.jsxIdentifier('spacing'), j.jsxExpressionContainer(j.numericLiteral(2))));
      }
      
      addMUIImport('Grid');
      hasChanges = true;
    });

    // Col → Grid item
    root.find(j.JSXElement, {
      openingElement: { name: { type: 'JSXIdentifier', name: 'Col' } }
    }).forEach(path => {
      path.node.openingElement.name.name = 'Grid';
      if (path.node.closingElement) path.node.closingElement.name.name = 'Grid';
      
      const attrs = path.node.openingElement.attributes;
      if (!attrs.some(a => a.type === 'JSXAttribute' && a.name.name === 'item')) {
        attrs.unshift(j.jsxAttribute(j.jsxIdentifier('item'), null));
      }
      
      addMUIImport('Grid');
      hasChanges = true;
    });
  }

  function transformContainer() {
    root.find(j.JSXElement, {
      openingElement: { name: { type: 'JSXIdentifier', name: 'Container' } }
    }).forEach(path => {
      const attrs = path.node.openingElement.attributes;
      const fluidIdx = attrs.findIndex(a => a.type === 'JSXAttribute' && a.name.name === 'fluid');
      
      if (fluidIdx >= 0) {
        attrs.splice(fluidIdx, 1);
        attrs.push(
          j.jsxAttribute(j.jsxIdentifier('maxWidth'), j.jsxExpressionContainer(j.booleanLiteral(false)))
        );
        hasChanges = true;
      }
      
      addMUIImport('Container');
    });
  }

  function transformCards() {
    root.find(j.JSXElement).forEach(path => {
      const name = path.node.openingElement.name;
      
      if (name.type === 'JSXMemberExpression' && name.object.name === 'Card') {
        const prop = name.property.name;
        if (prop === 'Body') {
          path.node.openingElement.name = j.jsxIdentifier('CardContent');
          if (path.node.closingElement) path.node.closingElement.name = j.jsxIdentifier('CardContent');
          addMUIImport('CardContent');
          hasChanges = true;
        } else if (prop === 'Header') {
          path.node.openingElement.name = j.jsxIdentifier('CardHeader');
          if (path.node.closingElement) path.node.closingElement.name = j.jsxIdentifier('CardHeader');
          addMUIImport('CardHeader');
          hasChanges = true;
        } else if (prop === 'Title') {
          path.node.openingElement.name = j.jsxIdentifier('Typography');
          if (path.node.closingElement) path.node.closingElement.name = j.jsxIdentifier('Typography');
          path.node.openingElement.attributes.push(
            j.jsxAttribute(j.jsxIdentifier('variant'), j.stringLiteral('h5')),
            j.jsxAttribute(j.jsxIdentifier('component'), j.stringLiteral('div'))
          );
          addMUIImport('Typography');
          hasChanges = true;
        }
      } else if (name.type === 'JSXIdentifier' && name.name === 'Card') {
        addMUIImport('Card');
      }
    });
  }

  function transformFormControls() {
    root.find(j.JSXElement).forEach(path => {
      const name = path.node.openingElement.name;
      
      if (name.type === 'JSXMemberExpression' && name.object.name === 'Form' && name.property.name === 'Control') {
        path.node.openingElement.name = j.jsxIdentifier('TextField');
        if (path.node.closingElement) path.node.closingElement.name = j.jsxIdentifier('TextField');
        addMUIImport('TextField');
        hasChanges = true;
      }
    });
  }

  function transformClassNamesToSx() {
    root.find(j.JSXAttribute, { name: { name: 'className' } }).forEach(path => {
      const val = path.node.value;
      if (!val || val.type !== 'Literal' || typeof val.value !== 'string') return;

      let cls = val.value;
      const sxObj = {};
      
      CLASS_TO_SX.forEach(rule => {
        let m;
        while ((m = rule.re.exec(cls)) !== null) {
          Object.assign(sxObj, rule.sx(m));
        }
        cls = cls.replace(rule.re, '').trim();
      });

      if (Object.keys(sxObj).length > 0) {
        const jsxEl = path.parent.value;
        mergeSxProp(path.parent.parent.value, sxObj);
        
        if (cls) {
          path.node.value = j.stringLiteral(cls);
        } else {
          jsxEl.attributes = jsxEl.attributes.filter(a => 
            !(a.type === 'JSXAttribute' && a.name.name === 'className')
          );
        }
        hasChanges = true;
      }
    });
  }

  // ============================================================================
  // EJECUCIÓN
  // ============================================================================

  removeBootstrapImports();
  transformButtons();
  transformAlerts();
  transformModals();
  transformGrid();
  transformContainer();
  transformCards();
  transformFormControls();
  transformClassNamesToSx();

  return hasChanges ? root.toSource({ quote: 'single', reuseWhitespace: false }) : null;
};