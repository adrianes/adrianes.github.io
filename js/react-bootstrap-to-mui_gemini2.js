// transform.js

/**
 * @typedef {import('jscodeshift').FileInfo} FileInfo
 * @typedef {import('jscodeshift').API} API
 * @typedef {import('jscodeshift').ASTPath<import('jscodeshift').JSXElement>} JSXElementPath
 */

// Mapeo de componentes de react-bootstrap a Material-UI.
// Este objeto define las reglas de transformación.
const COMPONENT_MAP = {
  Button: {
    newName: 'Button',
    newPackage: '@mui/material',
    propMap: {
      variant: (value) => {
        const outlined = value.startsWith('outline-');
        const color = outlined? value.substring(8) : value;
        return [
          { newName: 'variant', newValue: outlined? 'outlined' : 'contained' },
          { newName: 'color', newValue: color },
        ];
      },
      size: (value) => ({ newName: 'size', newValue: value === 'lg'? 'large' : value === 'sm'? 'small' : 'medium' }),
      active: 'active',
      disabled: 'disabled',
    },
  },
  Card: {
    newName: 'Card',
    newPackage: '@mui/material',
    propMap: {
      bg: (value) => ({ type: 'sx', value: { bgcolor: `${value}.main` } }),
      border: (value) => ({ type: 'sx', value: { borderColor: `${value}.main`, border: 1 } }),
      text: (value) => ({ type: 'sx', value: { color: value === 'light'? 'common.white' : `${value}.main` } }),
    },
    subComponents: {
      Body: { newName: 'CardContent', newPackage: '@mui/material' },
      Title: { newName: 'Typography', newPackage: '@mui/material', props: [{ name: 'variant', value: 'h5' }, { name: 'component', value: 'div' }] },
      Header: { newName: 'CardHeader', newPackage: '@mui/material', transform: 'childrenToTitleProp' },
      Img: { newName: 'CardMedia', newPackage: '@mui/material', props: [{ name: 'component', value: 'img' }], propMap: { src: 'image' } },
      Text: { newName: 'Typography', newPackage: '@mui/material', props: [{ name: 'variant', value: 'body2' }] },
      Link: { newName: 'Link', newPackage: '@mui/material' },
    },
  },
  Modal: {
    newName: 'Dialog',
    newPackage: '@mui/material',
    propMap: {
      show: 'open',
      onHide: 'onClose',
      size: (value) => ({ newName: 'maxWidth', newValue: value }),
      centered: { newName: 'fullWidth', newValue: true }, // Aproximación, MUI no tiene un `centered` directo, se combina con maxWidth.
      keyboard: (value) => ({ newName: 'disableEscapeKeyDown', newValue:!value }),
    },
    subComponents: {
      Header: { newName: 'DialogTitle', newPackage: '@mui/material' },
      Title: { newName: null }, // El contenido de Modal.Title se mueve al padre DialogTitle
      Body: { newName: 'DialogContent', newPackage: '@mui/material' },
      Footer: { newName: 'DialogActions', newPackage: '@mui/material' },
    },
  },
  // Agregue aquí más mapeos para otros componentes como Alert, ListGroup, etc.
};

/**
 * @param {API} api
 * @returns {object}
 */
function helpers(api) {
  const j = api.jscodeshift;

  return {
    // Encuentra todas las importaciones de 'react-bootstrap' y crea un mapa de nombres locales.
    getBootstrapImports: (root) => {
      const bootstrapImports = new Map();
      root
       .find(j.ImportDeclaration, {
          source: { value: 'react-bootstrap' },
        })
       .forEach((path) => {
          path.node.specifiers.forEach((specifier) => {
            if (j.ImportSpecifier.check(specifier)) {
              bootstrapImports.set(specifier.local.name, specifier.imported.name);
            } else if (j.ImportDefaultSpecifier.check(specifier)) {
              bootstrapImports.set(specifier.local.name, 'default');
            }
          });
        });
      return bootstrapImports;
    },

    // Agrega o actualiza las importaciones de Material-UI.
    addMuiImports: (root, muiAdditions) => {
      if (muiAdditions.size === 0) return;

      const newSpecifiers = Array.from(muiAdditions).sort().map(name => j.importSpecifier(j.identifier(name), j.identifier(name)));

      const muiImports = root.find(j.ImportDeclaration, {
        source: { value: '@mui/material' },
      });

      if (muiImports.length > 0) {
        const firstMuiImport = muiImports.at(0);
        const existingSpecifiers = new Set(firstMuiImport.get().node.specifiers.map(s => s.local.name));
        const specifiersToAdd = newSpecifiers.filter(s =>!existingSpecifiers.has(s.local.name));
        if (specifiersToAdd.length > 0) {
          firstMuiImport.get().node.specifiers.push(...specifiersToAdd);
        }
      } else {
        const newImport = j.importDeclaration(newSpecifiers, j.literal('@mui/material'));
        const lastImport = root.find(j.ImportDeclaration).at(-1);
        if (lastImport.length > 0) {
          lastImport.insertAfter(newImport);
        } else {
          root.get().node.program.body.unshift(newImport);
        }
      }
    },

    // Elimina las importaciones de 'react-bootstrap'.
    removeBootstrapImports: (root) => {
      root
       .find(j.ImportDeclaration, {
          source: { value: 'react-bootstrap' },
        })
       .remove();
    },
  };
}

/**
 * @param {FileInfo} fileInfo
 * @param {API} api
 */
export default function transformer(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  const h = helpers(api);

  // --- FASE 1: Identificar componentes importados de 'react-bootstrap' ---
  const bootstrapImports = h.getBootstrapImports(root);
  if (bootstrapImports.size === 0) {
    return null; // No hay nada que transformar en este archivo.
  }

  const muiAdditions = new Set();
  let hasChanges = false;

  // --- FASE 2: Encontrar y transformar elementos JSX ---
  root.find(j.JSXElement).forEach((path) => {
    const openingElement = path.node.openingElement;
    let componentNameNode = openingElement.name;
    let baseName;
    let subComponentName;

    if (j.JSXIdentifier.check(componentNameNode)) {
      baseName = componentNameNode.name;
    } else if (j.JSXMemberExpression.check(componentNameNode)) {
      baseName = componentNameNode.object.name;
      subComponentName = componentNameNode.property.name;
    }

    const importedName = bootstrapImports.get(baseName);
    if (!importedName) {
      return; // No es un componente de react-bootstrap.
    }

    const mapping = COMPONENT_MAP[importedName];
    if (!mapping) {
      return; // No hay mapeo para este componente.
    }

    let currentMapping = mapping;
    if (subComponentName) {
      currentMapping = mapping.subComponents?.[subComponentName];
      if (!currentMapping) return;
    }

    hasChanges = true;
    
    // Renombrar el componente
    if (currentMapping.newName) {
      openingElement.name = j.jsxIdentifier(currentMapping.newName);
      if (path.node.closingElement) {
        path.node.closingElement.name = j.jsxIdentifier(currentMapping.newName);
      }
      muiAdditions.add(currentMapping.newName);
    } else {
        // Casos como Modal.Title donde el nodo se elimina o se transforma en el padre
        if (importedName === 'Modal' && subComponentName === 'Title') {
            const parent = path.parent.node;
            if (j.JSXElement.check(parent) && parent.openingElement.name.name === 'DialogTitle') {
                parent.children = path.node.children;
                j(path).remove();
            }
        }
        return;
    }

    // Transformar props
    const newAttributes =;
    const sxProps =;

    openingElement.attributes.forEach(attr => {
      if (j.JSXAttribute.check(attr)) {
        const propName = attr.name.name;
        const propRule = currentMapping.propMap?.[propName];
        
        if (propRule) {
          const value = attr.value.expression?.value?? attr.value.value;
          if (typeof propRule === 'string') {
            newAttributes.push(j.jsxAttribute(j.jsxIdentifier(propRule), attr.value));
          } else if (typeof propRule === 'function') {
            const result = propRule(value);
            if (Array.isArray(result)) {
              result.forEach(res => {
                if (res.type === 'sx') {
                  sxProps.push(j.property('init', j.identifier(Object.keys(res.value)), j.literal(Object.values(res.value))));
                } else {
                  newAttributes.push(j.jsxAttribute(j.jsxIdentifier(res.newName), j.literal(res.newValue)));
                }
              });
            } else if (result.type === 'sx') {
              sxProps.push(j.property('init', j.identifier(Object.keys(result.value)), j.literal(Object.values(result.value))));
            } else {
              newAttributes.push(j.jsxAttribute(j.jsxIdentifier(result.newName), j.literal(result.newValue)));
            }
          }
        } else {
          newAttributes.push(attr);
        }
      } else {
        newAttributes.push(attr);
      }
    });

    // Agregar props adicionales del mapeo
    if (currentMapping.props) {
        currentMapping.props.forEach(prop => {
            newAttributes.push(j.jsxAttribute(j.jsxIdentifier(prop.name), j.literal(prop.value)));
        });
    }

    // Manejar transformaciones especiales (ej. Card.Header)
    if (currentMapping.transform === 'childrenToTitleProp') {
        const children = path.node.children;
        const titleValue = children.find(c => j.JSXText.check(c) && c.value.trim()!== '') |

| children;
        newAttributes.push(j.jsxAttribute(j.jsxIdentifier('title'), j.jsxExpressionContainer(titleValue)));
        path.node.children =;
        openingElement.selfClosing = true;
        path.node.closingElement = null;
    }
    
    // Combinar y agregar la prop `sx` si es necesario
    if (sxProps.length > 0) {
      const sxAttribute = j.jsxAttribute(
        j.jsxIdentifier('sx'),
        j.jsxExpressionContainer(j.objectExpression(sxProps))
      );
      newAttributes.push(sxAttribute);
    }
    
    openingElement.attributes = newAttributes;
  });

  if (!hasChanges) {
    return null;
  }

  // --- FASE 3: Gestionar importaciones ---
  h.removeBootstrapImports(root);
  h.addMuiImports(root, muiAdditions);

  return root.toSource({ quote: 'single' });
}