// Trecho para o cypress.config.js do projeto de testes.
// Instale antes:  npm i -D mocha-junit-reporter junit-report-merger
const { defineConfig } = require("cypress");

module.exports = defineConfig({
  reporter: "mocha-junit-reporter",
  reporterOptions: {
    // Um arquivo por spec; o pipeline junta todos com o junit-report-merger.
    mochaFile: "cypress/results/results-[hash].xml",
    // O Kiwi usa "classname.name" como título do caso: deixe os describe/it estáveis.
    testsuitesTitle: "Cypress",
    toConsole: false,
  },
  e2e: {
    baseUrl: "http://localhost:3000",
  },
});
