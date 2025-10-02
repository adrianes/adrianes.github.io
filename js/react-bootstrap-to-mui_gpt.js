/**
 * jscodeshift codemod to migrate React-Bootstrap components to Material UI
 *
 * This script looks for imports from the `react-bootstrap` package and
 * replaces them with equivalent imports from Material UI (MUI).  It also
 * rewrites usages of certain Bootstrap sub‑components (for example
 * `<Card.Body>` or `<Card.Footer>`) into the appropriate MUI components
 * (for example `<CardContent>` and `<CardActions>`).  The goal of the
 * transform is to remove React‑Bootstrap from your project while mapping
 * the UI primitives to their closest MUI counterpart.
 *
 * ### How it works
 *
 * 1.  Every `ImportDeclaration` whose source is `react-bootstrap` is
 *     visited.  Each imported specifier is compared against a lookup
 *     table (`REPLACEMENTS`).  If a matching entry is found, the
 *     specifier is removed from the original import and scheduled for
 *     re‑import from the MUI package specified in the lookup table.  A
 *     local alias is preserved so that the remainder of the file need not
 *     change.  Unknown specifiers are left untouched on the original
 *     import declaration (they will still import from `react-bootstrap`),
 *     but a warning will be emitted on the console so you can perform
 *     manual remediation later.
 *
 * 2.  Whenever a `Card` component is imported from React‑Bootstrap, the
 *     script records its local alias (for example if you wrote
 *     `import { Card as BSCard } from 'react-bootstrap'` then `BSCard` is
 *     stored).  It then finds every JSX member expression that uses this
 *     alias (e.g. `<BSCard.Body>` or `<BSCard.Footer>`) and replaces
 *     those sub‑component tags with the matching MUI component defined in
 *     the `CARD_SUBCOMPONENTS` table.  For instance, `<Card.Body>`
 *     becomes `<CardContent>`.  The transform also schedules the MUI
 *     imports required by these new components.
 *
 * 3.  Finally, after all replacements are scheduled, the transform
 *     inserts new `import` statements for the MUI components.  If the
 *     file already imports from a given MUI module, new specifiers are
 *     merged into the existing import rather than duplicating it.
 *
 * The mapping used here is opinionated and may not cover every single
 * component provided by React‑Bootstrap.  When a component is not in the
 * lookup table, it will remain imported from `react-bootstrap` and a
 * console warning will be emitted.  You should review those warnings
 * and decide on an appropriate MUI replacement manually.
 */

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  /**
   * Mapping from React‑Bootstrap component names to their MUI equivalent.
   * Each entry defines the new component name and the module from which
   * it should be imported.  The local alias used in the original code
   * will be preserved.
   */
  const REPLACEMENTS = {
    // Generic components
    Alert: { newName: 'Alert', importSource: '@mui/material/Alert' },
    Badge: { newName: 'Badge', importSource: '@mui/material/Badge' },
    Breadcrumb: { newName: 'Breadcrumbs', importSource: '@mui/material/Breadcrumbs' },
    Button: { newName: 'Button', importSource: '@mui/material/Button' },
    ButtonGroup: { newName: 'ButtonGroup', importSource: '@mui/material/ButtonGroup' },
    // Card and related components
    Card: { newName: 'Card', importSource: '@mui/material/Card' },
    CardImg: { newName: 'CardMedia', importSource: '@mui/material/CardMedia' },
    CardImgOverlay: { newName: 'CardMedia', importSource: '@mui/material/CardMedia' },
    CardBody: { newName: 'CardContent', importSource: '@mui/material/CardContent' },
    CardHeader: { newName: 'CardHeader', importSource: '@mui/material/CardHeader' },
    CardFooter: { newName: 'CardActions', importSource: '@mui/material/CardActions' },
    CardTitle: { newName: 'Typography', importSource: '@mui/material/Typography' },
    CardSubtitle: { newName: 'Typography', importSource: '@mui/material/Typography' },
    CardText: { newName: 'Typography', importSource: '@mui/material/Typography' },
    // Navigation and layout
    Navbar: { newName: 'AppBar', importSource: '@mui/material/AppBar' },
    Nav: { newName: 'Tabs', importSource: '@mui/material/Tabs' },
    NavItem: { newName: 'Tab', importSource: '@mui/material/Tab' },
    NavLink: { newName: 'Tab', importSource: '@mui/material/Tab' },
    NavDropdown: { newName: 'Menu', importSource: '@mui/material/Menu' },
    Dropdown: { newName: 'Menu', importSource: '@mui/material/Menu' },
    DropdownButton: { newName: 'Menu', importSource: '@mui/material/Menu' },
    // Form related
    Form: { newName: 'Box', importSource: '@mui/material/Box' },
    FormLabel: { newName: 'InputLabel', importSource: '@mui/material/InputLabel' },
    FormControl: { newName: 'FormControl', importSource: '@mui/material/FormControl' },
    FormGroup: { newName: 'FormGroup', importSource: '@mui/material/FormGroup' },
    FormText: { newName: 'FormHelperText', importSource: '@mui/material/FormHelperText' },
    FormSelect: { newName: 'Select', importSource: '@mui/material/Select' },
    InputGroup: { newName: 'Input', importSource: '@mui/material/Input' },
    FloatingLabel: { newName: 'InputLabel', importSource: '@mui/material/InputLabel' },
    // Miscellaneous
    Modal: { newName: 'Modal', importSource: '@mui/material/Modal' },
    Tooltip: { newName: 'Tooltip', importSource: '@mui/material/Tooltip' },
    Popover: { newName: 'Popover', importSource: '@mui/material/Popover' },
    Pagination: { newName: 'Pagination', importSource: '@mui/material/Pagination' },
    ProgressBar: { newName: 'LinearProgress', importSource: '@mui/material/LinearProgress' },
    Spinner: { newName: 'CircularProgress', importSource: '@mui/material/CircularProgress' },
    Table: { newName: 'Table', importSource: '@mui/material/Table' },
    Tbody: { newName: 'TableBody', importSource: '@mui/material/TableBody' },
    Td: { newName: 'TableCell', importSource: '@mui/material/TableCell' },
    Th: { newName: 'TableCell', importSource: '@mui/material/TableCell' },
    Thead: { newName: 'TableHead', importSource: '@mui/material/TableHead' },
    Tr: { newName: 'TableRow', importSource: '@mui/material/TableRow' },
    Collapse: { newName: 'Collapse', importSource: '@mui/material/Collapse' },
    CloseButton: { newName: 'IconButton', importSource: '@mui/material/IconButton' },
  };

  /**
   * Mapping for sub‑components accessed as properties on `Card` (or its
   * local alias).  For example `<Card.Body>` should become
   * `<CardContent>` when migrating to MUI.  The keys correspond to the
   * property name on the JSX member expression.  When a match is found,
   * the member expression is replaced with a single identifier and the
   * corresponding MUI import is scheduled.
   */
  const CARD_SUBCOMPONENTS = {
    Body: { newName: 'CardContent', importSource: '@mui/material/CardContent' },
    Footer: { newName: 'CardActions', importSource: '@mui/material/CardActions' },
    Header: { newName: 'CardHeader', importSource: '@mui/material/CardHeader' },
    Img: { newName: 'CardMedia', importSource: '@mui/material/CardMedia' },
    ImgOverlay: { newName: 'CardMedia', importSource: '@mui/material/CardMedia' },
    Title: { newName: 'Typography', importSource: '@mui/material/Typography' },
    Subtitle: { newName: 'Typography', importSource: '@mui/material/Typography' },
    Text: { newName: 'Typography', importSource: '@mui/material/Typography' },
  };

  // A record of new imports to insert: { importSource: [ { importedName, localName } ] }
  const newImports = {};

  // A set of aliases for Card imported from React‑Bootstrap.  We use this to
  // identify JSX member expressions such as <Card.Body>.
  const cardAliases = new Set();

  // First pass: find all imports from 'react-bootstrap'
  root.find(j.ImportDeclaration, { source: { value: 'react-bootstrap' } })
    .forEach(path => {
      const specifiers = path.node.specifiers;
      const remainingSpecifiers = [];

      specifiers.forEach(spec => {
        // Only handle named imports (ImportSpecifier).  If you use default
        // imports from react-bootstrap (rare), leave them untouched.
        if (j.ImportSpecifier.check(spec)) {
          const importedName = spec.imported.name;
          const localName = spec.local ? spec.local.name : importedName;

          if (REPLACEMENTS.hasOwnProperty(importedName)) {
            // Register the Card alias if we're replacing Card itself
            if (importedName === 'Card') {
              cardAliases.add(localName);
            }
            const replacement = REPLACEMENTS[importedName];
            const { newName, importSource } = replacement;
            // Prepare an entry for the new import.  Preserve the local alias.
            if (!newImports[importSource]) newImports[importSource] = [];
            newImports[importSource].push({ importedName: newName, localName });
            // Remove this specifier from the original import (i.e. don't
            // include it in `remainingSpecifiers`).
          } else {
            // Unknown specifier – keep it and emit a warning.  It will
            // continue to import from react-bootstrap and you should
            // manually migrate it.
            console.warn(
              `Warning: no replacement mapping for React-Bootstrap component '${importedName}'. ` +
              `It will remain imported from 'react-bootstrap'.`
            );
            remainingSpecifiers.push(spec);
          }
        } else {
          // Keep other kinds of import specifiers (e.g. default)
          remainingSpecifiers.push(spec);
        }
      });

      // Replace the list of specifiers on the original import declaration
      if (remainingSpecifiers.length > 0) {
        path.node.specifiers = remainingSpecifiers;
      } else {
        // Remove the entire import declaration if no specifiers remain
        j(path).remove();
      }
    });

  // Second pass: rewrite JSX member expressions for Card sub‑components
  if (cardAliases.size > 0) {
    cardAliases.forEach(alias => {
      // Find JSXMemberExpression where object is the card alias
      root.find(j.JSXMemberExpression, {
        object: { type: 'JSXIdentifier', name: alias },
      }).forEach(memberPath => {
        const propertyName = memberPath.node.property.name;
        if (CARD_SUBCOMPONENTS.hasOwnProperty(propertyName)) {
          const { newName, importSource } = CARD_SUBCOMPONENTS[propertyName];
          // Schedule the import of the new subcomponent.  Use the newName as both
          // importedName and localName.
          if (!newImports[importSource]) newImports[importSource] = [];
          newImports[importSource].push({ importedName: newName, localName: newName });
          // Replace the member expression with a simple identifier.  In JSX the
          // name of an element can either be a JSXIdentifier or a
          // JSXMemberExpression; by replacing the member expression with an
          // identifier we change `<Card.Body>` into `<CardContent>`.
          j(memberPath).replaceWith(j.jsxIdentifier(newName));
        }
      });
    });
  }

  /**
   * Deduplicate and normalize the newImports object.  Because multiple
   * occurrences of the same component might be scheduled, we need to
   * combine them into unique entries keyed by localName.  We also
   * compress entries that share the same importSource but have the same
   * importedName/localName pairs.
   */
  Object.keys(newImports).forEach(importSource => {
    const list = newImports[importSource];
    const seen = new Set();
    const deduped = [];
    list.forEach(item => {
      const key = `${item.importedName}__${item.localName}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    });
    newImports[importSource] = deduped;
  });

  // Third pass: insert or merge import declarations for the new imports
  Object.keys(newImports).forEach(importSource => {
    const items = newImports[importSource];
    if (items.length === 0) return;
    // Find existing import from this source
    const existingImports = root.find(j.ImportDeclaration, {
      source: { type: 'Literal', value: importSource },
    });
    if (existingImports.size() > 0) {
      // Use the first occurrence
      const importDecl = existingImports.at(0).get();
      const existingSpecifiers = importDecl.node.specifiers;
      items.forEach(item => {
        const { importedName, localName } = item;
        // Check if a specifier with the same localName already exists
        const alreadyExists = existingSpecifiers.some(spec => {
          return (
            j.ImportSpecifier.check(spec) &&
            spec.local && spec.local.name === localName
          );
        });
        if (!alreadyExists) {
          // Add a new ImportSpecifier, aliasing if necessary
          if (localName === importedName) {
            existingSpecifiers.push(
              j.importSpecifier(j.identifier(importedName))
            );
          } else {
            existingSpecifiers.push(
              j.importSpecifier(j.identifier(importedName), j.identifier(localName))
            );
          }
        }
      });
    } else {
      // Build a new ImportDeclaration
      const specifiers = items.map(item => {
        const { importedName, localName } = item;
        if (localName === importedName) {
          return j.importSpecifier(j.identifier(importedName));
        } else {
          return j.importSpecifier(j.identifier(importedName), j.identifier(localName));
        }
      });
      const newImport = j.importDeclaration(
        specifiers,
        j.literal(importSource)
      );
      // Insert the new import near the top of the file (after any
      // existing imports)
      const firstImport = root.find(j.ImportDeclaration).at(0);
      if (firstImport.size() > 0) {
        firstImport.insertBefore(newImport);
      } else {
        // If there are no existing imports, unshift into the body
        root.get().node.program.body.unshift(newImport);
      }
    }
  });

  return root.toSource({ quote: 'single', trailingComma: true });
};