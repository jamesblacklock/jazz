window.onload = async function () {
  const modules = {};
  window.define = function(imports, factory) {
    const defineModule = document.currentScript.getAttribute('src').match("(.*?)(?:.js)?$")[1];
    function require(moduleName, requireName) {
      if (requireName.startsWith("./")) {
        const dir = moduleName.match("(.*/)?.*")[1] ?? "";
        requireName = dir + requireName.slice(2)
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
  function doImport(importScript) {
    importScript.type = "application/javascript";
    importScript.src = `${importScript.getAttribute('src')}.js`;
    return new Promise(resolve => { importScript.onload = resolve });
  }
  const importScripts = document.querySelectorAll("script[type=umd]");
  await Promise.allSettled(Array.from(importScripts).map(doImport));
  delete window.define;
  for (const module of Object.values(modules)) {
    module.factory();
  }
};
