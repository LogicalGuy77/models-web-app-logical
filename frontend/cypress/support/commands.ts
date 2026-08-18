import {
  emitSseOnWindow,
  setSseMockOptions,
  SseMockOptions,
  SseWatchEvent,
} from './sse-mock';

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom command to select DOM element by data-cy attribute.
       * @example cy.dataCy('greeting')
       */
      dataCy(value: string): Chainable<JQuery<HTMLElement>>;

      /**
       * Custom command to wait for Angular to be ready
       */
      waitForAngular(): Chainable<void>;

      /**
       * Configure InferenceService data delivered over the mocked EventSource.
       * Must run before cy.visit().
       */
      mockSse(options?: SseMockOptions): Chainable<void>;

      /**
       * Push a watch event to an open mocked EventSource.
       */
      emitSse(event: SseWatchEvent, urlIncludes?: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('dataCy', (value: string) => {
  return cy.get(`[data-cy=${value}]`);
});

Cypress.Commands.add('waitForAngular', () => {
  cy.window().then((win: any) => {
    return new Cypress.Promise(resolve => {
      if (win.getAllAngularTestabilities) {
        const testabilities = win.getAllAngularTestabilities();
        if (testabilities.length === 0) {
          resolve();
          return;
        }
        let count = testabilities.length;
        testabilities.forEach((testability: any) => {
          testability.whenStable(() => {
            count--;
            if (count === 0) {
              resolve();
            }
          });
        });
      } else {
        resolve();
      }
    });
  });
});

Cypress.Commands.add('mockSse', (options: SseMockOptions = {}) => {
  setSseMockOptions(options);
});

Cypress.Commands.add(
  'emitSse',
  (event: SseWatchEvent, urlIncludes?: string) => {
    cy.window().then(win => {
      const emitted = emitSseOnWindow(win, event, urlIncludes);
      expect(
        emitted,
        'at least one open EventSource matching the watch URL',
      ).to.be.greaterThan(0);
    });
  },
);

export {};
