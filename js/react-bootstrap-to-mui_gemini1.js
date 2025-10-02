/**
 * jscodeshift script para migrar componentes de react-bootstrap a @mui/material.
 *
 * @author Gemini
 */
export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // --- Paso 1: Definir Mapeos de Componentes y Props ---
  const componentMap = {
    Alert: 'Alert',
    Button: 'Button',
    Card: 'Card',
    Col: 'Grid',
    Container: 'Container',
    Modal: 'Dialog', // Dialog es a menudo un mejor reemplazo para Modal
    Row: 'Grid',
    Spinner: 'CircularProgress',
    Table: 'Table',
  };

  // Mapeo para sub-componentes como <Modal.Header />
  const subComponentMap = {
    'Modal.Header': 'DialogTitle',
    'Modal.Title': 'DialogTitle',
    'Modal.Body': 'DialogContent',
    'Modal.Footer': 'DialogActions',
    'Card.Img': 'CardMedia',
    'Card.Body': 'CardContent',
    'Card.Title': 'Typography', // Typography es un sustituto común
    'Card.Text': 'Typography',
  };

  // --- Paso 2: Identificar los Componentes Importados de `react-bootstrap` ---
  // Esta lista es clave para validar que solo se transformen los componentes de la librería.
  const bootstrapImportSpecifiers = new Map(); // Mapea NombreOriginal -> nombreLocal
  const bootstrapImportDeclaration = root.find(j.ImportDeclaration, {
    source: { value: 'react-bootstrap' },
  });

  if (bootstrapImportDeclaration.length === 0) {
    return file.source; // No se encontró el import, no se hace nada.
  }

  bootstrapImportDeclaration.forEach(path => {
    path.node.specifiers.forEach(specifier => {
      if (j.ImportSpecifier.check(specifier)) {
        bootstrapImportSpecifiers.set(specifier.imported.name, specifier.local.name);
      }
    });
  });

  if (bootstrapImportSpecifiers.size === 0) {
    return file.source;
  }

  // Mapa inverso para encontrar el nombre original a partir del nombre local
  const localNamesToOriginal = new Map(Array.from(bootstrapImportSpecifiers, a => [a[1], a[0]]));
  const componentsToReplace = Array.from(bootstrapImportSpecifiers.values());
  const muiComponentsToAdd = new Set();

  // --- Paso 3: Reemplazar Sub-Componentes (ej. Modal.Header) ---
  root
    .find(j.JSXOpeningElement, { name: { type: 'JSXMemberExpression' } })
    .filter(path => {
      const objectName = path.node.name.object.name;
      const propertyName = path.node.name.property.name;
      const originalObjectName = localNamesToOriginal.get(objectName);
      // Validar si el objeto base (ej. 'Modal') fue importado de react-bootstrap
      return originalObjectName && subComponentMap[`${originalObjectName}.${propertyName}`];
    })
    .forEach(path => {
      const objectName = path.node.name.object.name;
      const propertyName = path.node.name.property.name;
      const originalObjectName = localNamesToOriginal.get(objectName);
      const fullName = `${originalObjectName}.${propertyName}`;
      const newComponentName = subComponentMap[fullName];

      if (newComponentName) {
        muiComponentsToAdd.add(newComponentName);
        // Reemplazar <Modal.Header> por <DialogTitle>
        const newIdentifier = j.jsxIdentifier(newComponentName);
        path.replace(j.jsxOpeningElement(newIdentifier, path.node.attributes, path.node.selfClosing));
        
        // Sincronizar la etiqueta de cierre si existe
        const parentElement = path.parent.node;
        if (parentElement.closingElement) {
          parentElement.closingElement.name = newIdentifier;
        }

        // Casos especiales de props
        if (fullName === 'Card.Img') {
          path.node.attributes.push(j.jsxAttribute(j.jsxIdentifier('component'), j.stringLiteral('img')));
        }
        if (fullName === 'Card.Title') {
          path.node.attributes.push(j.jsxAttribute(j.jsxIdentifier('variant'), j.stringLiteral('h5')));
        }
      }
    });

  // --- Paso 4: Reemplazar Componentes Principales ---
  root
    .find(j.JSXOpeningElement, (node) => componentsToReplace.includes(node.name.name))
    .forEach(path => {
      const localName = path.node.name.name;
      const originalName = localNamesToOriginal.get(localName);
      const newComponentName = componentMap[originalName];

      if (!newComponentName) return;

      muiComponentsToAdd.add(newComponentName);
      path.node.name.name = newComponentName;

      const newAttributes = [];
      let attributesChanged = false;

      // Lógica de transformación de props
      path.node.attributes.forEach(attr => {
        if (!j.JSXAttribute.check(attr)) {
          newAttributes.push(attr);
          return;
        }

        let transformed = false;
        // Modal: show -> open, onHide -> onClose
        if (originalName === 'Modal') {
          if (attr.name.name === 'show') { attr.name.name = 'open'; transformed = true; }
          if (attr.name.name === 'onHide') { attr.name.name = 'onClose'; transformed = true; }
        }
        // Alert: variant -> severity
        if (originalName === 'Alert' && attr.name.name === 'variant') {
          attr.name.name = 'severity';
          transformed = true;
        }
        // Button: size="sm" -> "small", size="lg" -> "large"
        if (originalName === 'Button' && attr.name.name === 'size' && j.StringLiteral.check(attr.value)) {
          if (attr.value.value === 'sm') { attr.value.value = 'small'; transformed = true; }
          if (attr.value.value === 'lg') { attr.value.value = 'large'; transformed = true; }
        }
        // Button: variant -> color/variant
        if (originalName === 'Button' && attr.name.name === 'variant' && j.StringLiteral.check(attr.value)) {
          const variantValue = attr.value.value;
          if (variantValue.startsWith('outline-')) {
            const color = variantValue.replace('outline-', '');
            newAttributes.push(j.jsxAttribute(j.jsxIdentifier('variant'), j.stringLiteral('outlined')));
            newAttributes.push(j.jsxAttribute(j.jsxIdentifier('color'), j.stringLiteral(color)));
          } else {
            newAttributes.push(j.jsxAttribute(j.jsxIdentifier('color'), j.stringLiteral(variantValue)));
          }
          attributesChanged = true;
          transformed = true; // Para que no se agregue el original
        }
        if (!transformed) {
          newAttributes.push(attr);
        } else {
          attributesChanged = true;
        }
      });
      
      // Casos especiales de Layout
      if (originalName === 'Row') {
        newAttributes.unshift(j.jsxAttribute(j.jsxIdentifier('container'), null));
        attributesChanged = true;
      } else if (originalName === 'Col') {
        newAttributes.unshift(j.jsxAttribute(j.jsxIdentifier('item'), null));
        attributesChanged = true;
      }
      
      if(attributesChanged) {
        path.node.attributes = newAttributes;
      }
    });

  // --- Paso 5: Gestionar Imports de MUI ---
  if (muiComponentsToAdd.size > 0) {
    const muiImportDeclaration = root.find(j.ImportDeclaration, {
      source: { value: '@mui/material' },
    });
    
    const newSpecifiers = Array.from(muiComponentsToAdd).map(name =>
      j.importSpecifier(j.identifier(name), j.identifier(name))
    );

    if (muiImportDeclaration.length > 0) {
      const existingSpecifiers = muiImportDeclaration.get(0).node.specifiers;
      const existingSpecifierNames = new Set(existingSpecifiers.map(s => s.local.name));
      const specifiersToAdd = newSpecifiers.filter(s => !existingSpecifierNames.has(s.local.name));
      if (specifiersToAdd.length > 0) {
        existingSpecifiers.push(...specifiersToAdd);
        existingSpecifiers.sort((a, b) => a.local.name.localeCompare(b.local.name));
      }
    } else {
      const newImport = j.importDeclaration(
        newSpecifiers.sort((a, b) => a.local.name.localeCompare(b.local.name)),
        j.literal('@mui/material')
      );
      const lastImport = root.find(j.ImportDeclaration).at(-1);
      if (lastImport.length > 0) {
        lastImport.insertAfter(newImport);
      } else {
        root.get().node.program.body.unshift(newImport);
      }
    }
  }

  // --- Paso 6: Eliminar el Antiguo Import de `react-bootstrap` ---
  bootstrapImportDeclaration.remove();

  // --- Paso 7: Devolver el código transformado ---
  return root.toSource({ quote: 'single' });
}