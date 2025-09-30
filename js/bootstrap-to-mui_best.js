/**
 * Codemod para migrar de React‑Bootstrap a Material UI.
 *
 * Este script utiliza jscodeshift para realizar una migración de la mayoría de
 * componentes y utilidades de Bootstrap a sus equivalentes en MUI. Se basa en
 * las ideas de múltiples codemods existentes pero intenta cubrir los casos
 * comunes de manera más completa.
 *
 * Cobertura:
 *  - Elimina importaciones de `react-bootstrap` y de hojas de estilo de Bootstrap.
 *  - Añade importaciones de `@mui/material` para los componentes que se utilizan.
 *  - Convierte componentes básicos: Button, Alert, Modal → Dialog, Container,
 *    Row/Col → Grid, Card y sus subcomponentes, Spinner, Badge, Table,
 *    Form.Control → TextField, Navbar básico (AppBar + Toolbar).
 *  - Mapea props como `variant` y `size` de Button a `variant`/`color`/`size` de MUI.
 *  - Mapea `variant` de Alert a `severity`.
 *  - Renombra y ajusta props para Modal (`show`→`open`, `onHide`→`onClose`) y sus
 *    subcomponentes a los equivalentes de Dialog (`DialogTitle`, `DialogContent`,
 *    `DialogActions`).
 *  - Convierte clases utilitarias de Bootstrap (`mb-*`, `mt-*`, `d-flex`, etc.) en
 *    la propiedad `sx` de MUI, mergeándola si ya existe.
 *  - Soporta conversión de clases de columna (`col-4`, `col-md-6`, etc.) en props
 *    de Grid (`xs`, `md`, …) y conserva breakpoints existentes.
 *
 * Limitaciones:
 *  - No migra componentes complejos como Navbar con collapse o Dropdowns,
 *    InputGroup, Tooltips, Offcanvas, etc. Estos requerirán intervención manual.
 *  - Algunas combinaciones de clases de utilidad pueden requerir ajustes manuales.
 *  - Solo maneja una parte de las utilidades de color (`text-*` y `bg-*`).
 */

module.exports = function transformer(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  /**
   * 1. Detección de importaciones de react‑bootstrap.
   * Creamos un conjunto con todos los identificadores importados desde
   * `react-bootstrap`. De esta forma solo transformamos aquellos JSX
   * identificadores que realmente provienen de Bootstrap.
   */
  const bootstrapImports = new Set();
  root
    .find(j.ImportDeclaration, { source: { value: 'react-bootstrap' } })
    .forEach(path => {
      (path.node.specifiers || []).forEach(spec => {
        if (spec.type === 'ImportSpecifier' && spec.imported) {
          bootstrapImports.add(spec.local ? spec.local.name : spec.imported.name);
        }
      });
    });

  /**
   * 2. Eliminación de importaciones de Bootstrap.
   * Eliminamos tanto las importaciones de `react-bootstrap` como cualquier
   * importación de hojas de estilo de Bootstrap (por ejemplo
   * "bootstrap/dist/css/bootstrap.min.css").
   */
  root
    .find(j.ImportDeclaration)
    .filter(path => {
      const src = path.node.source.value;
      return (
        src === 'react-bootstrap' ||
        (typeof src === 'string' && src.includes('bootstrap'))
      );
    })
    .remove();

  /**
   * 3. Helpers para gestionar importaciones de MUI.
   * Mantenemos un conjunto de componentes MUI que necesitamos importar. Al
   * finalizar la transformación añadiremos todas las importaciones necesarias.
   */
  const muiImports = new Set();

  function addMuiImport(name) {
    muiImports.add(name);
  }

  /**
   * Inserta importaciones para todos los componentes MUI utilizados al principio
   * del archivo. Si ya existe una importación desde '@mui/material/<Nombre>'
   * para ese componente no se añade de nuevo.
   */
  function insertMuiImports() {
    // Primero eliminamos importaciones duplicadas de componentes MUI creadas por
    // codemods previos; las agruparemos al final.
    root
      .find(j.ImportDeclaration)
      .filter(path => {
        const src = path.node.source.value;
        return typeof src === 'string' && src.startsWith('@mui/material/');
      })
      .remove();

    const importNodes = Array.from(muiImports).map(name =>
      j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier(name))],
        j.literal(`@mui/material/${name}`)
      )
    );
    // Insertamos las importaciones al inicio del programa
    if (importNodes.length > 0) {
      const body = root.get().node.program.body;
      body.unshift(...importNodes);
    }
  }

  /**
   * 4. Función auxiliar para fusionar y/o añadir la prop `sx` en un elemento
   * JSX. Si existe una prop `sx`, se fusiona con el objeto extra. En caso
   * contrario se añade un nuevo atributo `sx` con el objeto proporcionado.
   */
  function mergeSxAttribute(openingElement, extraObj) {
    const attrs = openingElement.attributes || [];
    let sxAttr = attrs.find(
      a => a.type === 'JSXAttribute' && a.name.name === 'sx'
    );
    const newProperties = Object.entries(extraObj).map(([key, value]) =>
      j.property(
        'init',
        j.identifier(key),
        typeof value === 'number'
          ? j.literal(value)
          : j.stringLiteral(value)
      )
    );
    if (!sxAttr) {
      openingElement.attributes.push(
        j.jsxAttribute(
          j.jsxIdentifier('sx'),
          j.jsxExpressionContainer(j.objectExpression(newProperties))
        )
      );
      return;
    }
    // Si ya existe sx, intentamos fusionarlo si es un objeto literal
    const expr = sxAttr.value && sxAttr.value.expression;
    if (expr && expr.type === 'ObjectExpression') {
      newProperties.forEach(prop => {
        const exists = expr.properties.find(p => p.key.name === prop.key.name);
        if (!exists) {
          expr.properties.push(prop);
        }
      });
    } else {
      // Sustituimos sx por un objeto que contiene solo extraObj
      sxAttr.value = j.jsxExpressionContainer(
        j.objectExpression(newProperties)
      );
    }
  }

  /**
   * 5. Conversión de clases utilitarias Bootstrap a objeto `sx`.
   * Define reglas de regex para detectar utilidades comunes y generar pares
   * propiedad/valor compatibles con MUI. Devuelve el objeto `sx` generado y la
   * cadena de clases restante sin las utilidades procesadas.
   */
  function extractSxFromClasses(classString) {
    let cls = classString || '';
    const sxObj = {};
    const rules = [
      // Espaciados (margin)
      { re: /\bmb-(\d)\b/g, fn: m => ({ mb: Number(m[1]) }) },
      { re: /\bmt-(\d)\b/g, fn: m => ({ mt: Number(m[1]) }) },
      { re: /\bms-(\d)\b/g, fn: m => ({ ml: Number(m[1]) }) },
      { re: /\bme-(\d)\b/g, fn: m => ({ mr: Number(m[1]) }) },
      { re: /\bmx-(\d)\b/g, fn: m => ({ mx: Number(m[1]) }) },
      { re: /\bmy-(\d)\b/g, fn: m => ({ my: Number(m[1]) }) },
      { re: /\bp-(\d)\b/g, fn: m => ({ p: Number(m[1]) }) },
      { re: /\bpx-(\d)\b/g, fn: m => ({ px: Number(m[1]) }) },
      { re: /\bpy-(\d)\b/g, fn: m => ({ py: Number(m[1]) }) },
      { re: /\bpt-(\d)\b/g, fn: m => ({ pt: Number(m[1]) }) },
      { re: /\bpb-(\d)\b/g, fn: m => ({ pb: Number(m[1]) }) },
      { re: /\bps-(\d)\b/g, fn: m => ({ pl: Number(m[1]) }) },
      { re: /\bpe-(\d)\b/g, fn: m => ({ pr: Number(m[1]) }) },
      // Espaciado de columnas de Grid (gap)
      { re: /\bgap-(\d)\b/g, fn: m => ({ gap: Number(m[1]) }) },
      // Layout
      { re: /\bd-flex\b/g, fn: () => ({ display: 'flex' }) },
      { re: /\bd-block\b/g, fn: () => ({ display: 'block' }) },
      { re: /\bd-inline\b/g, fn: () => ({ display: 'inline' }) },
      { re: /\bd-none\b/g, fn: () => ({ display: 'none' }) },
      { re: /\bjustify-content-center\b/g, fn: () => ({ justifyContent: 'center' }) },
      { re: /\bjustify-content-between\b/g, fn: () => ({ justifyContent: 'space-between' }) },
      { re: /\bjustify-content-around\b/g, fn: () => ({ justifyContent: 'space-around' }) },
      { re: /\bjustify-content-end\b/g, fn: () => ({ justifyContent: 'flex-end' }) },
      { re: /\balign-items-center\b/g, fn: () => ({ alignItems: 'center' }) },
      { re: /\balign-items-end\b/g, fn: () => ({ alignItems: 'flex-end' }) },
      { re: /\balign-items-start\b/g, fn: () => ({ alignItems: 'flex-start' }) },
      { re: /\bflex-column\b/g, fn: () => ({ flexDirection: 'column' }) },
      // Alineación de texto
      { re: /\btext-center\b/g, fn: () => ({ textAlign: 'center' }) },
      { re: /\btext-start\b/g, fn: () => ({ textAlign: 'left' }) },
      { re: /\btext-end\b/g, fn: () => ({ textAlign: 'right' }) },
      // Colores de texto
      { re: /\btext-primary\b/g, fn: () => ({ color: 'primary.main' }) },
      { re: /\btext-secondary\b/g, fn: () => ({ color: 'secondary.main' }) },
      { re: /\btext-success\b/g, fn: () => ({ color: 'success.main' }) },
      { re: /\btext-danger\b/g, fn: () => ({ color: 'error.main' }) },
      { re: /\btext-warning\b/g, fn: () => ({ color: 'warning.main' }) },
      { re: /\btext-info\b/g, fn: () => ({ color: 'info.main' }) },
      { re: /\btext-muted\b/g, fn: () => ({ color: 'text.secondary' }) },
      // Colores de fondo
      { re: /\bbg-primary\b/g, fn: () => ({ bgcolor: 'primary.main' }) },
      { re: /\bbg-secondary\b/g, fn: () => ({ bgcolor: 'secondary.main' }) },
      { re: /\bbg-success\b/g, fn: () => ({ bgcolor: 'success.main' }) },
      { re: /\bbg-danger\b/g, fn: () => ({ bgcolor: 'error.main' }) },
      { re: /\bbg-warning\b/g, fn: () => ({ bgcolor: 'warning.main' }) },
      { re: /\bbg-info\b/g, fn: () => ({ bgcolor: 'info.main' }) },
      { re: /\bbg-light\b/g, fn: () => ({ bgcolor: 'grey.100' }) },
      { re: /\bbg-dark\b/g, fn: () => ({ bgcolor: 'grey.900' }) },
    ];
    rules.forEach(rule => {
      let match;
      while ((match = rule.re.exec(cls)) !== null) {
        Object.assign(sxObj, rule.fn(match));
      }
      // Eliminamos las clases encontradas de la cadena de clases
      cls = cls.replace(rule.re, ' ').trim();
    });
    return { sxObj, remainingClass: cls.trim() };
  }

  /**
   * 6. Conversión de Button.
   * Mapea variant/color/size y elimina la clase Bootstrap. También interpreta
   * `btn-*` del className para inferir variante y tamaño si no existen props.
   */
  function transformButton(path) {
    const element = path.node.openingElement;
    const attrs = element.attributes || [];
    let variantProp;
    let sizeProp;
    let classNameAttr;
    const otherAttrs = [];
    // Buscar props de variant, size y className
    attrs.forEach(attr => {
      if (attr.type !== 'JSXAttribute') {
        otherAttrs.push(attr);
        return;
      }
      const propName = attr.name.name;
      if (propName === 'variant') {
        variantProp = attr;
      } else if (propName === 'size') {
        sizeProp = attr;
      } else if (propName === 'className') {
        classNameAttr = attr;
      } else {
        otherAttrs.push(attr);
      }
    });
    // Determinar variante y color
    const bootstrapVariantMap = {
      primary: { variant: 'contained', color: 'primary' },
      secondary: { variant: 'contained', color: 'secondary' },
      success: { variant: 'contained', color: 'success' },
      danger: { variant: 'contained', color: 'error' },
      warning: { variant: 'contained', color: 'warning' },
      info: { variant: 'contained', color: 'info' },
      light: { variant: 'outlined', color: 'inherit' },
      dark: { variant: 'outlined', color: 'inherit' },
      link: { variant: 'text', color: 'primary' },
      'outline-primary': { variant: 'outlined', color: 'primary' },
      'outline-secondary': { variant: 'outlined', color: 'secondary' },
      'outline-success': { variant: 'outlined', color: 'success' },
      'outline-danger': { variant: 'outlined', color: 'error' },
      'outline-warning': { variant: 'outlined', color: 'warning' },
      'outline-info': { variant: 'outlined', color: 'info' },
    };
    const sizeMap = { sm: 'small', lg: 'large' };
    let bsVariant;
    let bsSize;
    // Extraer variante y tamaño de props
    if (variantProp && variantProp.value && variantProp.value.type === 'Literal') {
      bsVariant = variantProp.value.value;
    }
    if (sizeProp && sizeProp.value && sizeProp.value.type === 'Literal') {
      bsSize = sizeProp.value.value;
    }
    // Si no hay props variant/size pero hay className, intentamos inferir
    if ((!bsVariant || !bsSize) && classNameAttr && classNameAttr.value) {
      const val = classNameAttr.value;
      let classString = '';
      if (val.type === 'Literal') {
        classString = val.value;
      } else if (
        val.type === 'JSXExpressionContainer' &&
        val.expression.type === 'Literal'
      ) {
        classString = val.expression.value;
      }
      const classes = classString.split(/\s+/);
      classes.forEach(c => {
        if (!bsVariant && c.startsWith('btn-')) {
          bsVariant = c.replace('btn-', '');
        }
        if (!bsSize && (c === 'btn-sm' || c === 'btn-lg')) {
          bsSize = c.replace('btn-', '');
        }
      });
    }
    // Construir nuevas props
    const newAttrs = [...otherAttrs];
    if (bsVariant && bootstrapVariantMap[bsVariant]) {
      const { variant, color } = bootstrapVariantMap[bsVariant];
      newAttrs.push(
        j.jsxAttribute(j.jsxIdentifier('variant'), j.literal(variant))
      );
      newAttrs.push(
        j.jsxAttribute(j.jsxIdentifier('color'), j.literal(color))
      );
    }
    if (bsSize && sizeMap[bsSize]) {
      newAttrs.push(
        j.jsxAttribute(j.jsxIdentifier('size'), j.literal(sizeMap[bsSize]))
      );
    }
    // Si no se especifica variant, MUI por defecto aplica variant="text"
    if (!bsVariant) {
      newAttrs.unshift(
        j.jsxAttribute(j.jsxIdentifier('variant'), j.literal('text'))
      );
    }
    element.attributes = newAttrs;
    addMuiImport('Button');
  }

  /**
   * 7. Conversión de Alert.
   * Mapea el prop `variant` de react‑bootstrap a `severity` de MUI. Si no
   * existe, se conserva el comportamiento por defecto (`info`).
   */
  function transformAlert(path) {
    const element = path.node.openingElement;
    const attrs = element.attributes || [];
    const newAttrs = [];
    const variantMap = {
      primary: 'info',
      secondary: 'info',
      success: 'success',
      danger: 'error',
      warning: 'warning',
      info: 'info',
      light: 'info',
      dark: 'info',
    };
    let foundVariant = false;
    attrs.forEach(attr => {
      if (attr.type === 'JSXAttribute' && attr.name.name === 'variant') {
        foundVariant = true;
        const val = attr.value && attr.value.type === 'Literal' ? attr.value.value : null;
        const sev = variantMap[val] || 'info';
        newAttrs.push(
          j.jsxAttribute(j.jsxIdentifier('severity'), j.literal(sev))
        );
      } else {
        newAttrs.push(attr);
      }
    });
    if (!foundVariant) {
      // Si no había variant, no añadimos severity
      element.attributes = newAttrs;
    } else {
      element.attributes = newAttrs;
    }
    addMuiImport('Alert');
  }

  /**
   * 8. Conversión de Modal a Dialog. Renombra las props y sus subcomponentes.
   */
  function transformModal(path) {
    const el = path.node;
    // Cambiar nombre del componente
    el.openingElement.name.name = 'Dialog';
    if (el.closingElement) {
      el.closingElement.name.name = 'Dialog';
    }
    // Renombrar props show→open, onHide→onClose
    const attrs = el.openingElement.attributes || [];
    attrs.forEach(attr => {
      if (attr.type === 'JSXAttribute') {
        const name = attr.name.name;
        if (name === 'show') {
          attr.name.name = 'open';
        }
        if (name === 'onHide') {
          attr.name.name = 'onClose';
        }
      }
    });
    // Transformar subelementos de Modal
    el.children = el.children.map(child => {
      if (child.type !== 'JSXElement') return child;
      const childName = child.openingElement.name;
      // Modal.Header o Modal.Title → DialogTitle
      if (childName.type === 'JSXMemberExpression') {
        const objName = childName.object.name;
        const propName = childName.property.name;
        if (objName === 'Modal' && (propName === 'Header' || propName === 'Title')) {
          return j.jsxElement(
            j.jsxOpeningElement(j.jsxIdentifier('DialogTitle'), [], false),
            j.jsxClosingElement(j.jsxIdentifier('DialogTitle')),
            child.children
          );
        }
        if (objName === 'Modal' && propName === 'Body') {
          return j.jsxElement(
            j.jsxOpeningElement(j.jsxIdentifier('DialogContent'), [], false),
            j.jsxClosingElement(j.jsxIdentifier('DialogContent')),
            child.children
          );
        }
        if (objName === 'Modal' && propName === 'Footer') {
          return j.jsxElement(
            j.jsxOpeningElement(j.jsxIdentifier('DialogActions'), [], false),
            j.jsxClosingElement(j.jsxIdentifier('DialogActions')),
            child.children
          );
        }
      }
      return child;
    });
    addMuiImport('Dialog');
    addMuiImport('DialogTitle');
    addMuiImport('DialogContent');
    addMuiImport('DialogActions');
  }

  /**
   * 9. Conversión de Container.
   * Si tiene prop `fluid`, lo reemplazamos por `maxWidth={false}` para que
   * ocupe todo el ancho. Eliminar la prop `fluid`.
   */
  function transformContainer(path) {
    const attrs = path.node.openingElement.attributes || [];
    const newAttrs = [];
    attrs.forEach(attr => {
      if (attr.type === 'JSXAttribute' && attr.name.name === 'fluid') {
        // Si fluid tiene un valor false, usamos maxWidth="lg" (comportamiento de react-bootstrap)
        if (!attr.value || (attr.value.type === 'Literal' && attr.value.value === true)) {
          newAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier('maxWidth'),
              j.jsxExpressionContainer(j.booleanLiteral(false))
            )
          );
        }
      } else {
        newAttrs.push(attr);
      }
    });
    path.node.openingElement.attributes = newAttrs;
    addMuiImport('Container');
  }

  /**
   * 10. Conversión de Row y Col a Grid.
   * Para Row: renombramos a Grid y añadimos `container`.
   * Para Col: renombramos a Grid y añadimos `item`; leemos props xs, sm, etc., y
   *  procesamos las clases `col-*` para añadir breakpoints si es necesario.
   */
  function transformGridElements() {
    // Row → Grid container
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: 'JSXIdentifier', name: 'Row' } },
      })
      .forEach(p => {
        p.node.openingElement.name.name = 'Grid';
        if (p.node.closingElement) {
          p.node.closingElement.name.name = 'Grid';
        }
        // Añadir prop container si no existe
        const attrs = p.node.openingElement.attributes || [];
        const hasContainer = attrs.some(
          a => a.type === 'JSXAttribute' && a.name.name === 'container'
        );
        if (!hasContainer) {
          attrs.push(j.jsxAttribute(j.jsxIdentifier('container')));
        }
        addMuiImport('Grid');
      });
    // Col → Grid item
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: 'JSXIdentifier', name: 'Col' } },
      })
      .forEach(p => {
        p.node.openingElement.name.name = 'Grid';
        if (p.node.closingElement) {
          p.node.closingElement.name.name = 'Grid';
        }
        let attrs = p.node.openingElement.attributes || [];
        const newAttrs = [];
        // Siempre añadimos item
        newAttrs.push(j.jsxAttribute(j.jsxIdentifier('item')));
        // Copiamos props xs/sm/md/lg/xl existentes
        attrs.forEach(a => {
          if (a.type === 'JSXAttribute') {
            const n = a.name.name;
            if (['xs', 'sm', 'md', 'lg', 'xl'].includes(n)) {
              newAttrs.push(a);
            }
          }
        });
        // Parsear className para detectar col-*
        const classAttr = attrs.find(
          a => a.type === 'JSXAttribute' && a.name.name === 'className'
        );
        if (classAttr) {
          let cls = '';
          if (classAttr.value.type === 'Literal') {
            cls = classAttr.value.value;
          } else if (
            classAttr.value.type === 'JSXExpressionContainer' &&
            classAttr.value.expression.type === 'Literal'
          ) {
            cls = classAttr.value.expression.value;
          }
          const tokens = cls.split(/\s+/);
          tokens.forEach(tok => {
            // col-6 → xs=6
            let m = tok.match(/^col-(\d+)$/);
            if (m) {
              const size = Number(m[1]);
              newAttrs.push(
                j.jsxAttribute(
                  j.jsxIdentifier('xs'),
                  j.jsxExpressionContainer(j.literal(size))
                )
              );
            }
            // col-sm-4, col-md-6, col-lg-3, col-xl-2
            m = tok.match(/^col-(xs|sm|md|lg|xl)-(\d+)$/);
            if (m) {
              const br = m[1];
              const size = Number(m[2]);
              newAttrs.push(
                j.jsxAttribute(
                  j.jsxIdentifier(br),
                  j.jsxExpressionContainer(j.literal(size))
                )
              );
            }
          });
        }
        p.node.openingElement.attributes = newAttrs;
        addMuiImport('Grid');
      });
  }

  /**
   * 11. Conversión de Form.Control a TextField. Mantiene props comunes.
   */
  function transformFormControl() {
    root
      .find(j.JSXElement)
      .filter(p => {
        const name = p.node.openingElement.name;
        return (
          name.type === 'JSXMemberExpression' &&
          name.object.name === 'Form' &&
          name.property.name === 'Control'
        );
      })
      .forEach(p => {
        // Renombramos a TextField
        p.node.openingElement.name = j.jsxIdentifier('TextField');
        if (p.node.closingElement) {
          p.node.closingElement.name = j.jsxIdentifier('TextField');
        }
        const attrs = p.node.openingElement.attributes || [];
        // No hay que renombrar los props comunes porque coinciden con MUI
        // readOnly en MUI requiere InputProps={{ readOnly: true }}, se omite para revisión manual
        p.node.openingElement.attributes = attrs;
        addMuiImport('TextField');
      });
  }

  /**
   * 12. Conversión de Navbar básica.
   * Convierte <Navbar> en <AppBar> y envuelve su contenido en <Toolbar>. También
   * convierte <Navbar.Brand> en <Typography variant="h6">. Para navbars más
   * complejas con collapse o toggler se requiere intervención manual.
   */
  function transformNavbar() {
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: 'JSXIdentifier', name: 'Navbar' } },
      })
      .forEach(p => {
        p.node.openingElement.name.name = 'AppBar';
        if (p.node.closingElement) {
          p.node.closingElement.name.name = 'AppBar';
        }
        // Verificar si ya existe Toolbar
        const hasToolbar = p.node.children.some(
          c =>
            c.type === 'JSXElement' &&
            c.openingElement.name.type === 'JSXIdentifier' &&
            c.openingElement.name.name === 'Toolbar'
        );
        if (!hasToolbar) {
          const originalChildren = p.node.children;
          p.node.children = [
            j.jsxElement(
              j.jsxOpeningElement(j.jsxIdentifier('Toolbar'), [], false),
              j.jsxClosingElement(j.jsxIdentifier('Toolbar')),
              originalChildren
            ),
          ];
        }
        // Convertir Navbar.Brand
        root
          .find(j.JSXElement, {
            openingElement: {
              name: {
                type: 'JSXMemberExpression',
                object: { name: 'Navbar' },
                property: { name: 'Brand' },
              },
            },
          })
          .forEach(b => {
            b.node.openingElement.name = j.jsxIdentifier('Typography');
            if (b.node.closingElement) {
              b.node.closingElement.name = j.jsxIdentifier('Typography');
            }
            // Añadimos variant="h6" component="div"
            b.node.openingElement.attributes.push(
              j.jsxAttribute(j.jsxIdentifier('variant'), j.literal('h6'))
            );
            b.node.openingElement.attributes.push(
              j.jsxAttribute(j.jsxIdentifier('component'), j.literal('div'))
            );
          });
        addMuiImport('AppBar');
        addMuiImport('Toolbar');
        addMuiImport('Typography');
      });
  }

  /**
   * 13. Conversión de Card y sus subcomponentes.
   */
  function transformCard() {
    root
      .find(j.JSXElement)
      .forEach(p => {
        const nameNode = p.node.openingElement.name;
        // Card.Body → CardContent
        if (
          nameNode.type === 'JSXMemberExpression' &&
          nameNode.object.name === 'Card' &&
          nameNode.property.name === 'Body'
        ) {
          p.node.openingElement.name = j.jsxIdentifier('CardContent');
          if (p.node.closingElement) {
            p.node.closingElement.name = j.jsxIdentifier('CardContent');
          }
          addMuiImport('CardContent');
        }
        // Card.Header → CardHeader
        if (
          nameNode.type === 'JSXMemberExpression' &&
          nameNode.object.name === 'Card' &&
          nameNode.property.name === 'Header'
        ) {
          p.node.openingElement.name = j.jsxIdentifier('CardHeader');
          if (p.node.closingElement) {
            p.node.closingElement.name = j.jsxIdentifier('CardHeader');
          }
          addMuiImport('CardHeader');
        }
        // Card.Footer → CardActions (MUI no tiene CardFooter; CardActions es lo más cercano)
        if (
          nameNode.type === 'JSXMemberExpression' &&
          nameNode.object.name === 'Card' &&
          nameNode.property.name === 'Footer'
        ) {
          p.node.openingElement.name = j.jsxIdentifier('CardActions');
          if (p.node.closingElement) {
            p.node.closingElement.name = j.jsxIdentifier('CardActions');
          }
          addMuiImport('CardActions');
        }
        // Card.Title → Typography variant=h5, component=div
        if (
          nameNode.type === 'JSXMemberExpression' &&
          nameNode.object.name === 'Card' &&
          nameNode.property.name === 'Title'
        ) {
          p.node.openingElement.name = j.jsxIdentifier('Typography');
          if (p.node.closingElement) {
            p.node.closingElement.name = j.jsxIdentifier('Typography');
          }
          p.node.openingElement.attributes.push(
            j.jsxAttribute(j.jsxIdentifier('variant'), j.literal('h5'))
          );
          p.node.openingElement.attributes.push(
            j.jsxAttribute(j.jsxIdentifier('component'), j.literal('div'))
          );
          addMuiImport('Typography');
        }
        // Card.Text → Typography variant=body2 color=text.secondary
        if (
          nameNode.type === 'JSXMemberExpression' &&
          nameNode.object.name === 'Card' &&
          nameNode.property.name === 'Text'
        ) {
          p.node.openingElement.name = j.jsxIdentifier('Typography');
          if (p.node.closingElement) {
            p.node.closingElement.name = j.jsxIdentifier('Typography');
          }
          p.node.openingElement.attributes.push(
            j.jsxAttribute(j.jsxIdentifier('variant'), j.literal('body2'))
          );
          p.node.openingElement.attributes.push(
            j.jsxAttribute(
              j.jsxIdentifier('color'),
              j.literal('text.secondary')
            )
          );
          addMuiImport('Typography');
        }
        // Card en sí mismo
        if (nameNode.type === 'JSXIdentifier' && nameNode.name === 'Card') {
          addMuiImport('Card');
        }
      });
  }

  /**
   * 14. Conversión de Spinner a CircularProgress.
   */
  function transformSpinner() {
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: 'JSXIdentifier', name: 'Spinner' } },
      })
      .forEach(p => {
        p.node.openingElement.name.name = 'CircularProgress';
        if (p.node.closingElement) {
          p.node.closingElement.name.name = 'CircularProgress';
        }
        addMuiImport('CircularProgress');
      });
  }

  /**
   * 15. Conversión de Badge. No necesita ajustes de props salvo el nombre.
   */
  function transformBadge() {
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: 'JSXIdentifier', name: 'Badge' } },
      })
      .forEach(p => {
        // Mantiene las props tal cual
        addMuiImport('Badge');
      });
  }

  /**
   * 16. Conversión de Table.
   */
  function transformTable() {
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: 'JSXIdentifier', name: 'Table' } },
      })
      .forEach(p => {
        // No hay cambios específicos; MUI Table tiene API similar
        addMuiImport('Table');
      });
  }

  /**
   * 17. Conversión de clase className a sx. Se aplica a todos los JSXElements.
   */
  function convertClassesToSx() {
    root.find(j.JSXAttribute, { name: { name: 'className' } }).forEach(attrPath => {
      const val = attrPath.node.value;
      if (!val) return;
      let classString = '';
      if (val.type === 'Literal') {
        classString = val.value;
      } else if (val.type === 'JSXExpressionContainer' && val.expression.type === 'Literal') {
        classString = val.expression.value;
      }
      const { sxObj, remainingClass } = extractSxFromClasses(classString);
      if (Object.keys(sxObj).length > 0) {
        // Agregar/mergear `sx` al elemento padre (openingElement)
        const opening = attrPath.parent.parent.node;
        mergeSxAttribute(opening, sxObj);
        // Actualizar la clase
        if (remainingClass) {
          attrPath.node.value = j.literal(remainingClass);
        } else {
          // Eliminar className si no quedan clases
          const attrs = opening.attributes || [];
          opening.attributes = attrs.filter(
            a => !(a.type === 'JSXAttribute' && a.name.name === 'className')
          );
        }
      }
    });
  }

  /**
   * 18. Transformación principal.
   */
  // Transformar Button
  root
    .find(j.JSXElement, {
      openingElement: { name: { type: 'JSXIdentifier', name: 'Button' } },
    })
    .forEach(path => {
      if (bootstrapImports.has('Button')) {
        transformButton(path);
      }
    });
  // Transformar Alert
  root
    .find(j.JSXElement, {
      openingElement: { name: { type: 'JSXIdentifier', name: 'Alert' } },
    })
    .forEach(path => {
      if (bootstrapImports.has('Alert')) {
        transformAlert(path);
      }
    });
  // Transformar Modal
  root
    .find(j.JSXElement, {
      openingElement: { name: { type: 'JSXIdentifier', name: 'Modal' } },
    })
    .forEach(path => {
      if (bootstrapImports.has('Modal')) {
        transformModal(path);
      }
    });
  // Transformar Container, Row y Col
  root
    .find(j.JSXElement, {
      openingElement: { name: { type: 'JSXIdentifier', name: 'Container' } },
    })
    .forEach(path => {
      if (bootstrapImports.has('Container')) {
        transformContainer(path);
      }
    });
  transformGridElements();
  // Transformar Form.Control
  transformFormControl();
  // Transformar Navbar
  transformNavbar();
  // Transformar Card y subcomponentes
  transformCard();
  // Spinner, Badge, Table
  transformSpinner();
  transformBadge();
  transformTable();
  // Convertir className → sx
  convertClassesToSx();
  // Asegurar importaciones de MUI
  insertMuiImports();
  return root.toSource({ quote: 'single', reuseWhitespace: false });
};