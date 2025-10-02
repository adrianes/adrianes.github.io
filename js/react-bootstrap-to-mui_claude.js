/**
 * JSCodeshift script para migrar de React-Bootstrap a Material-UI
 * 
 * Uso:
 * jscodeshift -t transform.js src/
 * 
 * Para modo dry-run (sin cambios):
 * jscodeshift -t transform.js src/ --dry --print
 */

module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasChanges = false;

  // Mapeo de componentes React-Bootstrap a Material-UI
  const componentMap = {
    // Layout
    'Container': '@mui/material/Container',
    'Row': null, // Se usará Grid con container
    'Col': '@mui/material/Grid',
    
    // Botones
    'Button': '@mui/material/Button',
    'ButtonGroup': '@mui/material/ButtonGroup',
    
    // Forms
    'Form': null, // Se maneja con Box o componentes nativos
    'FormControl': '@mui/material/FormControl',
    'FormGroup': '@mui/material/FormGroup',
    'FormLabel': '@mui/material/FormLabel',
    'FormCheck': '@mui/material/Checkbox',
    'InputGroup': '@mui/material/TextField',
    
    // Navegación
    'Nav': '@mui/material/Tabs',
    'Navbar': '@mui/material/AppBar',
    'NavDropdown': '@mui/material/Menu',
    
    // Componentes
    'Alert': '@mui/material/Alert',
    'Badge': '@mui/material/Badge',
    'Card': '@mui/material/Card',
    'CardBody': '@mui/material/CardContent',
    'CardHeader': '@mui/material/CardHeader',
    'CardFooter': '@mui/material/CardActions',
    'Dropdown': '@mui/material/Select',
    'Modal': '@mui/material/Dialog',
    'ModalHeader': '@mui/material/DialogTitle',
    'ModalBody': '@mui/material/DialogContent',
    'ModalFooter': '@mui/material/DialogActions',
    'Spinner': '@mui/material/CircularProgress',
    'Table': '@mui/material/Table',
    'Toast': '@mui/material/Snackbar',
    'Tooltip': '@mui/material/Tooltip',
    'Pagination': '@mui/material/Pagination',
    'ProgressBar': '@mui/material/LinearProgress',
    'ListGroup': '@mui/material/List',
    'ListGroupItem': '@mui/material/ListItem',
  };

  // Detectar imports de react-bootstrap
  const bootstrapImports = new Set();
  root.find(j.ImportDeclaration, {
    source: { value: 'react-bootstrap' }
  }).forEach(path => {
    path.node.specifiers.forEach(spec => {
      if (spec.type === 'ImportSpecifier') {
        bootstrapImports.add(spec.imported.name);
      }
    });
  });

  // Si no hay imports de react-bootstrap, no hacer nada
  if (bootstrapImports.size === 0) {
    return fileInfo.source;
  }

  // Verificar cuáles componentes son realmente de react-bootstrap
  // comparando con declaraciones locales
  const localComponents = new Set();
  
  // Buscar declaraciones de componentes locales
  root.find(j.VariableDeclarator, {
    id: { type: 'Identifier' }
  }).forEach(path => {
    if (path.node.init && 
        (path.node.init.type === 'ArrowFunctionExpression' || 
         path.node.init.type === 'FunctionExpression')) {
      localComponents.add(path.node.id.name);
    }
  });

  root.find(j.FunctionDeclaration).forEach(path => {
    if (path.node.id) {
      localComponents.add(path.node.id.name);
    }
  });

  root.find(j.ClassDeclaration).forEach(path => {
    if (path.node.id) {
      localComponents.add(path.node.id.name);
    }
  });

  // Componentes que necesitan ser reemplazados (solo los de bootstrap)
  const componentsToReplace = Array.from(bootstrapImports).filter(
    comp => !localComponents.has(comp) && componentMap[comp]
  );

  // Eliminar imports de react-bootstrap
  root.find(j.ImportDeclaration, {
    source: { value: 'react-bootstrap' }
  }).forEach(path => {
    j(path).remove();
    hasChanges = true;
  });

  // Agregar imports de Material-UI necesarios
  const muiImports = new Map();
  componentsToReplace.forEach(comp => {
    const muiPath = componentMap[comp];
    if (muiPath) {
      if (!muiImports.has(muiPath)) {
        muiImports.set(muiPath, []);
      }
      // Determinar el nombre del componente MUI
      const muiCompName = comp === 'CardBody' ? 'CardContent' :
                          comp === 'CardFooter' ? 'CardActions' :
                          comp === 'FormCheck' ? 'Checkbox' :
                          comp === 'Spinner' ? 'CircularProgress' :
                          comp === 'ProgressBar' ? 'LinearProgress' :
                          comp === 'ListGroupItem' ? 'ListItem' :
                          comp === 'ModalHeader' ? 'DialogTitle' :
                          comp === 'ModalBody' ? 'DialogContent' :
                          comp === 'ModalFooter' ? 'DialogActions' :
                          comp;
      muiImports.get(muiPath).push(muiCompName);
    }
  });

  // Insertar imports de MUI al inicio del archivo
  const firstImport = root.find(j.ImportDeclaration).at(0);
  if (firstImport.length > 0) {
    muiImports.forEach((components, source) => {
      const uniqueComponents = [...new Set(components)];
      const importStatement = j.importDeclaration(
        uniqueComponents.map(comp => j.importSpecifier(j.identifier(comp))),
        j.literal(source)
      );
      firstImport.insertBefore(importStatement);
      hasChanges = true;
    });
  }

  // Reemplazar componentes JSX solo si son de react-bootstrap
  componentsToReplace.forEach(bootstrapComp => {
    const muiComp = bootstrapComp === 'CardBody' ? 'CardContent' :
                    bootstrapComp === 'CardFooter' ? 'CardActions' :
                    bootstrapComp === 'FormCheck' ? 'Checkbox' :
                    bootstrapComp === 'Spinner' ? 'CircularProgress' :
                    bootstrapComp === 'ProgressBar' ? 'LinearProgress' :
                    bootstrapComp === 'ListGroupItem' ? 'ListItem' :
                    bootstrapComp === 'ModalHeader' ? 'DialogTitle' :
                    bootstrapComp === 'ModalBody' ? 'DialogContent' :
                    bootstrapComp === 'ModalFooter' ? 'DialogActions' :
                    bootstrapComp === 'Modal' ? 'Dialog' :
                    bootstrapComp;

    // Reemplazar elementos de apertura
    root.find(j.JSXOpeningElement, {
      name: { name: bootstrapComp }
    }).forEach(path => {
      path.node.name.name = muiComp;
      
      // Ajustar props específicas
      if (bootstrapComp === 'Button') {
        // Cambiar variant de Bootstrap a MUI
        path.node.attributes.forEach(attr => {
          if (attr.name && attr.name.name === 'variant') {
            if (attr.value.value === 'primary') attr.value.value = 'contained';
            if (attr.value.value === 'secondary') attr.value.value = 'outlined';
            if (attr.value.value === 'link') attr.value.value = 'text';
          }
        });
      }
      
      if (bootstrapComp === 'Col') {
        // Convertir props de Col a Grid
        const sizeAttrs = path.node.attributes.filter(
          attr => attr.name && ['xs', 'sm', 'md', 'lg', 'xl'].includes(attr.name.name)
        );
        sizeAttrs.forEach(attr => {
          attr.name.name = attr.name.name;
        });
        // Agregar item prop
        path.node.attributes.push(
          j.jsxAttribute(j.jsxIdentifier('item'))
        );
      }
      
      if (bootstrapComp === 'Row') {
        path.node.name.name = 'Grid';
        path.node.attributes.push(
          j.jsxAttribute(j.jsxIdentifier('container')),
          j.jsxAttribute(j.jsxIdentifier('spacing'), j.jsxExpressionContainer(j.numericLiteral(2)))
        );
      }
      
      if (bootstrapComp === 'Modal') {
        // Agregar onClose prop si show existe
        const showAttr = path.node.attributes.find(
          attr => attr.name && attr.name.name === 'show'
        );
        if (showAttr) {
          showAttr.name.name = 'open';
        }
      }
      
      hasChanges = true;
    });

    // Reemplazar elementos de cierre
    root.find(j.JSXClosingElement, {
      name: { name: bootstrapComp }
    }).forEach(path => {
      path.node.name.name = muiComp;
      hasChanges = true;
    });
  });

  return hasChanges ? root.toSource({ quote: 'single' }) : fileInfo.source;
};

// Configuración para el parser
module.exports.parser = 'tsx';