window.onload = async function () {
  const modules = {};
  let unimported;

  function canonicalModuleName(importName, moduleName) {
    if (importName.startsWith("./")) {
      const dir = moduleName.match("(.*/)?.*")[1] ?? "";
      return `${dir}${importName.slice(2)}`;
    } else {
      return `node_modules/${importName}`;
    }
  }

  window.define = function(imports, factory) {
    const defineModule = document.currentScript.getAttribute('src').match("(.*?)(?:.js)?$")[1];
    unimported.delete(defineModule);

    for (let importName of imports.slice(2)) {
      importName = canonicalModuleName(importName, defineModule);
      if (!modules[importName]) {
        unimported.add(importName);
      }
    }

    function require(moduleName, requireName) {
      requireName = canonicalModuleName(requireName, moduleName);
      if (!modules[requireName]) {
        requireName += "/index";
      }
      if (!modules[requireName]) {
        throw new Error(`imported module "${requireName}" does not exist or has not been loaded`);
      }
      modules[requireName].factory();
      return modules[requireName].exports;
    }
    const module = { exports: {} };
    factory = factory.bind(null, require.bind(null, defineModule), module.exports);
    module.factory = function() {
      if (!this.initialized) {
        this.initialized = true;
        factory();
      }
    };
    modules[defineModule] = module;
  }
  define.amd = true;
  function changeScriptType(importScript) {
    importScript.type = "application/javascript";
    importScript.src = `${importScript.getAttribute('src')}.js`;
    return new Promise(resolve => { importScript.onload = resolve });
  }
  function createScriptElement(importName) {
    return new Promise(resolve => {
      const importScript = document.createElement("script");
      document.head.appendChild(importScript);
      importScript.type = "application/javascript";
      importScript.src = `${importName}.js`;
      importScript.onerror = () => {
        importScript.remove();
        const importScript2 = document.createElement("script");
        document.head.appendChild(importScript2);
        importScript2.type = "application/javascript";
        importScript2.src = `${importName}/index.js`;
        importScript2.onload = () => {
          resolve();
        }
      }
      importScript.onload = () => {
        resolve();
      }
    });
  }
  const importScripts = document.querySelectorAll("script[type=umd]");
  let importPromises = Array.from(importScripts).map(changeScriptType);

  do {
    unimported = new Set;
    await Promise.allSettled(importPromises);
    importPromises = Array.from(unimported).map(createScriptElement);
  } while(unimported.size > 0);

  delete window.define;
  for (const module of Object.values(modules)) {
    module.factory();
  }
};
