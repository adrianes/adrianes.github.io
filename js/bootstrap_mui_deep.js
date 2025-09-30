// bootstrap-to-mui-optimized.js
/**
 * Script optimizado para migración de React-Bootstrap a Material-UI
 * Ejecutar: npx jscodeshift -t bootstrap-to-mui-optimized.js src/**/*.{js,jsx,ts,tsx}
 */

module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasChanges = false;

  // =========================================================================
  // CONFIGURACIÓN CENTRALIZADA
  // =========================================================================

  // Mapeo completo de componentes
  const COMPONENT_MAP = {
    // Componentes básicos
    Button: { 
      name: 'Button', 
      import: '@mui/material/Button',
      propMap: {
        variant: {
          primary: 'contained', secondary: 'outlined', success: 'contained',
          danger: 'contained', warning: 'contained', info: 'contained',
          light: 'outlined', dark: 'contained', link: 'text'
        },
        color: {
          primary: 'primary', secondary: 'secondary', success: 'success',
          danger: 'error', warning: 'warning', info: 'info',
          light: 'default', dark: 'primary', link: 'primary'
        },
        size: { sm: 'small', lg: 'large' }
      }
    },
    Alert: { 
      name: 'Alert', 
      import: '@mui/material/Alert',
      severityMap: {
        primary: 'info', secondary: 'info', success: 'success',
        danger: 'error', warning: 'warning', info: 'info',
        light: 'info', dark: 'info'
      }
    },
    Container: { 
      name: 'Container', 
      import: '@mui/material/Container' 
    },
    Card: { 
      name: 'Card', 
      import: '@mui/material/Card' 
    },
    Badge: { 
      name: 'Badge', 
      import: '@mui/material/Badge' 
    },
    Spinner: { 
      name: 'CircularProgress', 
      import: '@mui/material/CircularProgress' 
    },
    
    // Grid system
    Row: { 
      name: 'Grid', 
      import: '@mui/material/Grid',
      props: { container: true, spacing: 2 }
    },
    Col: { 
      name: 'Grid', 
      import: '@mui/material/Grid',
      props: { item: true, xs: 12 }
    },

    // Layout y navegación
    Navbar: { 
      name: 'AppBar', 
      import: '@mui/material/AppBar' 
    },
    Nav: { 
      name: 'Toolbar', 
      import: '@mui/material/Toolbar' 
    },

    // Formularios
    Form: { 
      name: 'Box', 
      import: '@mui/material/Box',
      role: 'form'
    },
    FormControl: { 
      name: 'TextField', 
      import: '@mui/material/TextField' 
    },
    FormLabel: { 
      name: 'InputLabel', 
      import: '@mui/material/InputLabel' 
    },
    'Form.Check': { 
      name: 'Checkbox', 
      import: '@mui/material/Checkbox' 
    },

    // Modal/Dialog
    Modal: { 
      name: 'Dialog', 
      import: '@mui/material/Dialog' 
    }
  };

  // Mapeo de subcomponentes
  const SUBCOMPONENT_MAP = {
    // Card
    'Card.Body': { name: 'CardContent', import: '@mui/material/CardContent' },
    'Card.Header': { name: 'CardHeader', import: '@mui/material/CardHeader' },
    'Card.Footer': { name: 'Box', import: '@mui/material/Box' },
    'Card.Title': { 
      name: 'Typography', 
      import: '@mui/material/Typography',
      props: { variant: 'h5', component: 'div' }
    },
    'Card.Text': { 
      name: 'Typography', 
      import: '@mui/material/Typography',
      props: { variant: 'body2', color: 'text.secondary' }
    },

    // Modal
    'Modal.Header': { name: 'DialogTitle', import: '@mui/material/DialogTitle' },
    'Modal.Body': { name: 'DialogContent', import: '@mui/material/DialogContent' },
    'Modal.Footer': { name: 'DialogActions', import: '@mui/material/DialogActions' },
    'Modal.Title': { name: 'DialogTitle', import: '@mui/material/DialogTitle' },

    // Navbar
    'Navbar.Brand': { 
      name: 'Typography', 
      import: '@mui/material/Typography',
      props: { variant: 'h6', component: 'div', sx: { flexGrow: 1 } }
    }
  };

  // Mapeo de clases CSS a sx prop (más completo)
  const CLASSNAME_TO_SX = {
    // Espaciado
    'm-0': { m: 0 }, 'm-1': { m: 1 }, 'm-2': { m: 2 }, 'm-3': { m: 3 }, 'm-4': { m: 4 }, 'm-5': { m: 5 },
    'mt-0': { mt: 0 }, 'mt-1': { mt: 1 }, 'mt-2': { mt: 2 }, 'mt-3': { mt: 3 }, 'mt-4': { mt: 4 }, 'mt-5': { mt: 5 },
    'mb-0': { mb: 0 }, 'mb-1': { mb: 1 }, 'mb-2': { mb: 2 }, 'mb-3': { mb: 3 }, 'mb-4': { mb: 4 }, 'mb-5': { mb: 5 },
    'ml-0': { ml: 0 }, 'ml-1': { ml: 1 }, 'ml-2': { ml: 2 }, 'ml-3': { ml: 3 }, 'ml-4': { ml: 4 }, 'ml-5': { ml: 5 },
    'mr-0': { mr: 0 }, 'mr-1': { mr: 1 }, 'mr-2': { mr: 2 }, 'mr-3': { mr: 3 }, 'mr-4': { mr: 4 }, 'mr-5': { mr: 5 },
    'mx-0': { mx: 0 }, 'mx-1': { mx: 1 }, 'mx-2': { mx: 2 }, 'mx-3': { mx: 3 }, 'mx-4': { mx: 4 }, 'mx-5': { mx: 5 },
    'my-0': { my: 0 }, 'my-1': { my: 1 }, 'my-2': { my: 2 }, 'my-3': { my: 3 }, 'my-4': { my: 4 }, 'my-5': { my: 5 },
    'p-0': { p: 0 }, 'p-1': { p: 1 }, 'p-2': { p: 2 }, 'p-3': { p: 3 }, 'p-4': { p: 4 }, 'p-5': { p: 5 },
    'pt-0': { pt: 0 }, 'pt-1': { pt: 1 }, 'pt-2': { pt: 2 }, 'pt-3': { pt: 3 }, 'pt-4': { pt: 4 }, 'pt-5': { pt: 5 },
    'pb-0': { pb: 0 }, 'pb-1': { pb: 1 }, 'pb-2': { pb: 2 }, 'pb-3': { pb: 3 }, 'pb-4': { pb: 4 }, 'pb-5': { pb: 5 },
    'pl-0': { pl: 0 }, 'pl-1': { pl: 1 }, 'pl-2': { pl: 2 }, 'pl-3': { pl: 3 }, 'pl-4': { pl: 4 }, 'pl-5': { pl: 5 },
    'pr-0': { pr: 0 }, 'pr-1': { pr: 1 }, 'pr-2': { pr: 2 }, 'pr-3': { pr: 3 }, 'pr-4': { pr: 4 }, 'pr-5': { pr: 5 },
    'px-0': { px: 0 }, 'px-1': { px: 1 }, 'px-2': { px: 2 }, 'px-3': { px: 3 }, 'px-4': { px: 4 }, 'px-5': { px: 5 },
    'py-0': { py: 0 }, 'py-1': { py: 1 }, 'py-2': { py: 2 }, 'py-3': { py: 3 }, 'py-4': { py: 4 }, 'py-5': { py: 5 },

    // Display y flexbox
    'd-flex': { display: 'flex' },
    'd-none': { display: 'none' },
    'd-block': { display: 'block' },
    'd-inline': { display: 'inline' },
    'd-inline-block': { display: 'inline-block' },
    'justify-content-start': { justifyContent: 'flex-start' },
    'justify-content-end': { justifyContent: 'flex-end' },
    'justify-content-center': { justifyContent: 'center' },
    'justify-content-between': { justifyContent: 'space-between' },
    'justify-content-around': { justifyContent: 'space-around' },
    'align-items-start': { alignItems: 'flex-start' },
    'align-items-end': { alignItems: 'flex-end' },
    'align-items-center': { alignItems: 'center' },
    'align-items-baseline': { alignItems: 'baseline' },
    'align-items-stretch': { alignItems: 'stretch' },
    'flex-column': { flexDirection: 'column' },
    'flex-row': { flexDirection: 'row' },
    'flex-wrap': { flexWrap: 'wrap' },
    'flex-nowrap': { flexWrap: 'nowrap' },
    'flex-fill': { flex: '1 1 auto' },

    // Texto
    'text-start': { textAlign: 'left' },
    'text-center': { textAlign: 'center' },
    'text-end': { textAlign: 'right' },
    'text-justify': { textAlign: 'justify' },
    'text-uppercase': { textTransform: 'uppercase' },
    'text-lowercase': { textTransform: 'lowercase' },
    'text-capitalize': { textTransform: 'capitalize' },
    'fw-bold': { fontWeight: 'bold' },
    'fw-bolder': { fontWeight: 'bolder' },
    'fw-normal': { fontWeight: 'normal' },
    'fw-light': { fontWeight: 'light' },
    'fst-italic': { fontStyle: 'italic' },
    'text-primary': { color: 'primary.main' },
    'text-secondary': { color: 'secondary.main' },
    'text-success': { color: 'success.main' },
    'text-danger': { color: 'error.main' },
    'text-warning': { color: 'warning.main' },
    'text-info': { color: 'info.main' },
    'text-muted': { color: 'text.secondary' },

    // Tamaños y posición
    'w-100': { width: '100%' },
    'h-100': { height: '100%' },
    'vw-100': { width: '100vw' },
    'vh-100': { height: '100vh' },
    'position-relative': { position: 'relative' },
    'position-absolute': { position: 'absolute' },
    'position-fixed': { position: 'fixed' },
    'position-sticky': { position: 'sticky' },

    // Borders
    'border': { border: '1px solid' },
    'border-0': { border: 0 },
    'rounded': { borderRadius: 1 },
    'rounded-0': { borderRadius: 0 },

    // Background colors
    'bg-primary': { backgroundColor: 'primary.main' },
    'bg-secondary': { backgroundColor: 'secondary.main' },
    'bg-success': { backgroundColor: 'success.main' },
    'bg-danger': { backgroundColor: 'error.main' },
    'bg-warning': { backgroundColor: 'warning.main' },
    'bg-info': { backgroundColor: 'info.main' },
    'bg-light': { backgroundColor: 'grey.100' },
    'bg-dark': { backgroundColor: 'grey.900' }
  };

  // =========================================================================
  // FUNCIONES AUXILIARES
  // =========================================================================

  // Función para agregar importaciones
  function addImport(j, root, source, componentName) {
    const existingImport = root.find(j.ImportDeclaration, {
      source: { value: source }
    });

    if (existingImport.size() > 0) {
      const specifiers = existingImport.get(0).node.specifiers;
      const alreadyImported = specifiers.some(spec => 
        spec.local.name === componentName
      );
      
      if (!alreadyImported) {
        specifiers.push(j.importDefaultSpecifier(j.identifier(componentName)));
      }
    } else {
      const newImport = j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier(componentName))],
        j.literal(source)
      );
      
      // Insertar después del último import
      const allImports = root.find(j.ImportDeclaration);
      if (allImports.size() > 0) {
        allImports.at(-1).insertAfter(newImport);
      } else {
        root.get().node.program.body.unshift(newImport);
      }
    }
  }

  // Función para mergear sx props
  function mergeSxAttribute(j, element, newSxProps) {
    const existingSx = element.attributes.find(
      attr => attr.name?.name === 'sx'
    );

    if (!existingSx) {
      element.attributes.push(
        j.jsxAttribute(
          j.jsxIdentifier('sx'),
          j.jsxExpressionContainer(
            j.objectExpression(
              Object.entries(newSxProps).map(([key, value]) =>
                j.property('init', j.identifier(key), 
                  typeof value === 'string' ? j.stringLiteral(value) : j.numericLiteral(value)
                )
              )
            )
          )
        )
      );
    } else {
      // Merge con sx existente
      if (existingSx.value?.expression?.properties) {
        Object.entries(newSxProps).forEach(([key, value]) => {
          const existingProp = existingSx.value.expression.properties.find(
            prop => prop.key.name === key
          );
          if (!existingProp) {
            existingSx.value.expression.properties.push(
              j.property('init', j.identifier(key), 
                typeof value === 'string' ? j.stringLiteral(value) : j.numericLiteral(value)
              )
            );
          }
        });
      }
    }
  }

  // Función para convertir className a sx
  function convertClassNameToSx(j, element) {
    const classNameAttr = element.attributes.find(
      attr => attr.name?.name === 'className'
    );

    if (!classNameAttr) return;

    let classValue = classNameAttr.value;
    let classes = [];

    // Extraer clases
    if (classValue.type === 'StringLiteral') {
      classes = classValue.value.split(' ').filter(c => c.trim());
    } else if (classValue.type === 'JSXExpressionContainer' &&
               classValue.expression.type === 'StringLiteral') {
      classes = classValue.expression.value.split(' ').filter(c => c.trim');
    }

    if (classes.length === 0) return;

    const sxProps = {};
    const remainingClasses = [];

    classes.forEach(cls => {
      if (CLASSNAME_TO_SX[cls]) {
        Object.assign(sxProps, CLASSNAME_TO_SX[cls]);
      } else {
        remainingClasses.push(cls);
      }
    });

    if (Object.keys(sxProps).length > 0) {
      mergeSxAttribute(j, element, sxProps);
      hasChanges = true;
    }

    // Actualizar o eliminar className
    if (remainingClasses.length > 0) {
      classNameAttr.value = j.stringLiteral(remainingClasses.join(' '));
    } else {
      element.attributes = element.attributes.filter(
        attr => attr.name?.name !== 'className'
      );
    }
  }

  // =========================================================================
  // TRANSFORMACIONES PRINCIPALES
  // =========================================================================

  // 1. Eliminar imports de Bootstrap
  root.find(j.ImportDeclaration).forEach(path => {
    const source = path.node.source.value;
    if (source.includes('bootstrap') || source.includes('react-bootstrap')) {
      j(path).remove();
      hasChanges = true;
    }
  });

  // 2. Convertir componentes principales
  Object.entries(COMPONENT_MAP).forEach(([bootstrapName, muiConfig]) => {
    root.find(j.JSXElement, {
      openingElement: { name: { name: bootstrapName } }
    }).forEach(path => {
      const element = path.node.openingElement;
      
      // Cambiar nombre del componente
      element.name.name = muiConfig.name;
      if (path.node.closingElement) {
        path.node.closingElement.name.name = muiConfig.name;
      }

      // Aplicar mapeo de props
      if (muiConfig.propMap) {
        element.attributes.forEach(attr => {
          if (attr.name?.name in muiConfig.propMap && attr.value) {
            const value = attr.value.value || attr.value.expression?.value;
            if (value && muiConfig.propMap[attr.name.name][value]) {
              attr.value.value = muiConfig.propMap[attr.name.name][value];
            }
          }
        });
      }

      // Aplicar props por defecto
      if (muiConfig.props) {
        Object.entries(muiConfig.props).forEach(([key, value]) => {
          if (typeof value === 'boolean') {
            element.attributes.push(j.jsxAttribute(j.jsxIdentifier(key)));
          } else {
            element.attributes.push(
              j.jsxAttribute(
                j.jsxIdentifier(key),
                j.jsxExpressionContainer(
                  typeof value === 'string' ? j.stringLiteral(value) : j.numericLiteral(value)
                )
              )
            );
          }
        });
      }

      // Convertir className a sx
      convertClassNameToSx(j, element);

      hasChanges = true;
    });
  });

  // 3. Convertir subcomponentes (Card.Body, Modal.Header, etc.)
  Object.entries(SUBCOMPONENT_MAP).forEach(([bootstrapName, muiConfig]) => {
    const [parent, child] = bootstrapName.split('.');
    
    root.find(j.JSXElement, {
      openingElement: { 
        name: { 
          type: 'JSXMemberExpression',
          object: { name: parent },
          property: { name: child }
        }
      }
    }).forEach(path => {
      const element = path.node.openingElement;
      
      // Cambiar a componente simple
      element.name = j.jsxIdentifier(muiConfig.name);
      if (path.node.closingElement) {
        path.node.closingElement.name = j.jsxIdentifier(muiConfig.name);
      }

      // Aplicar props por defecto
      if (muiConfig.props) {
        Object.entries(muiConfig.props).forEach(([key, value]) => {
          if (typeof value === 'object') {
            mergeSxAttribute(j, element, value);
          } else if (typeof value === 'boolean') {
            element.attributes.push(j.jsxAttribute(j.jsxIdentifier(key)));
          } else {
            element.attributes.push(
              j.jsxAttribute(
                j.jsxIdentifier(key),
                j.stringLiteral(value)
              )
            );
          }
        });
      }

      // Convertir className a sx
      convertClassNameToSx(j, element);

      hasChanges = true;
    });
  });

  // 4. Conversión especial para Grid columns
  root.find(j.JSXElement, {
    openingElement: { name: { name: 'Col' } }
  }).forEach(path => {
    const element = path.node.openingElement;
    const classNameAttr = element.attributes.find(
      attr => attr.name?.name === 'className'
    );

    if (classNameAttr?.value) {
      const classValue = classNameAttr.value.value || 
                        (classNameAttr.value.expression?.type === 'StringLiteral' ? 
                         classNameAttr.value.expression.value : '');
      
      if (classValue) {
        const classes = classValue.split(' ');
        const colClass = classes.find(c => c.match(/^col-(xs|sm|md|lg|xl)?-?(\d+)$/));
        
        if (colClass) {
          const match = colClass.match(/^col-(xs|sm|md|lg|xl)?-?(\d+)$/);
          const breakpoint = match[1] || 'xs';
          const size = parseInt(match[2]);
          
          element.attributes.push(
            j.jsxAttribute(
              j.jsxIdentifier(breakpoint),
              j.jsxExpressionContainer(j.numericLiteral(size))
            )
          );

          // Remover la clase procesada
          const remainingClasses = classes.filter(c => c !== colClass);
          if (remainingClasses.length > 0) {
            classNameAttr.value = j.stringLiteral(remainingClasses.join(' '));
          } else {
            element.attributes = element.attributes.filter(
              attr => attr.name?.name !== 'className'
            );
          }
          
          hasChanges = true;
        }
      }
    }
  });

  // 5. Conversión especial para Alert
  root.find(j.JSXElement, {
    openingElement: { name: { name: 'Alert' } }
  }).forEach(path => {
    const element = path.node.openingElement;
    const variantAttr = element.attributes.find(
      attr => attr.name?.name === 'variant'
    );

    if (variantAttr?.value) {
      const variant = variantAttr.value.value;
      if (COMPONENT_MAP.Alert.severityMap[variant]) {
        variantAttr.name.name = 'severity';
        variantAttr.value.value = COMPONENT_MAP.Alert.severityMap[variant];
        hasChanges = true;
      }
    }
  });

  // 6. Conversión especial para Container fluid
  root.find(j.JSXElement, {
    openingElement: { name: { name: 'Container' } }
  }).forEach(path => {
    const element = path.node.openingElement;
    const fluidAttr = element.attributes.find(
      attr => attr.name?.name === 'fluid'
    );

    if (fluidAttr) {
      element.attributes = element.attributes.filter(
        attr => attr.name?.name !== 'fluid'
      );
      element.attributes.push(
        j.jsxAttribute(
          j.jsxIdentifier('maxWidth'),
          j.jsxExpressionContainer(j.booleanLiteral(false))
        )
      );
      hasChanges = true;
    }
  });

  // 7. Agregar imports de MUI necesarios
  if (hasChanges) {
    const usedComponents = new Set();
    
    // Recopilar componentes usados
    root.find(j.JSXElement).forEach(path => {
      const name = path.node.openingElement.name.name;
      if (Object.values(COMPONENT_MAP).some(config => config.name === name) ||
          Object.values(SUBCOMPONENT_MAP).some(config => config.name === name)) {
        usedComponents.add(name);
      }
    });

    // Agregar imports
    usedComponents.forEach(componentName => {
      const componentConfig = Object.values(COMPONENT_MAP).find(
        config => config.name === componentName
      ) || Object.values(SUBCOMPONENT_MAP).find(
        config => config.name === componentName
      );

      if (componentConfig) {
        addImport(j, root, componentConfig.import, componentName);
      }
    });

    // Agregar importación básica de MUI si no hay otros imports
    if (usedComponents.size > 0) {
      addImport(j, root, '@mui/material/styles', 'ThemeProvider');
    }
  }

  return hasChanges ? root.toSource({ quote: 'single', reuseWhitespace: false }) : fileInfo.source;
};