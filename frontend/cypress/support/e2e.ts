import './commands';
import { installSseMock, resetSseMock } from './sse-mock';

beforeEach(() => {
  resetSseMock();
  // Safety net: if polling fallback still runs, do not hit a live cluster.
  cy.intercept('GET', '/api/namespaces/*/inferenceservices', {
    statusCode: 200,
    body: { inferenceServices: [] },
  });
});

// Hide fetch/XHR requests from command log
Cypress.on('window:before:load', win => {
  installSseMock(win);
  cy.stub(win.console, 'log').as('consoleLog');
  cy.stub(win.console, 'error').as('consoleError');
});
